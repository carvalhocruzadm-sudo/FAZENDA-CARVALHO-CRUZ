// Assessor da fazenda pelo WhatsApp.
// - Comprovante (foto ou PDF): a IA lê, lança em Despesas na hora e responde o que lançou.
// - Texto: conversa com o sistema todo — responde perguntas consultando os dados
//   e prepara lançamentos e correções em qualquer tela, mas só grava depois que
//   a pessoa responde SIM.
//
// As regras de cada tela (campos, opções, contas automáticas, conferências) vêm
// do próprio src/lib/esquema.js do app, baixado do GitHub na hora do Deploy:
// um lançamento feito aqui sai igual a um feito no app. Mudou o esquema? Faça
// o Deploy da função de novo.
//
// Roda no Supabase (Edge Functions) e recebe as mensagens da WhatsApp Cloud API
// (Meta). Só aceita mensagens assinadas pela Meta e vindas dos números
// autorizados. Passo a passo para ligar: README → "Assessor pelo WhatsApp".
//
// Deploy:  supabase functions deploy whatsapp-comprovantes --no-verify-jwt
// Segredos (supabase secrets set NOME=valor):
//   ANTHROPIC_API_KEY            chave de console.anthropic.com
//   WHATSAPP_TOKEN               token permanente do usuário do sistema (Meta)
//   WHATSAPP_APP_SECRET          "Chave secreta do app" (Meta → Configurações do app → Básico)
//   WHATSAPP_VERIFY_TOKEN        uma senha qualquer que você inventa e repete na Meta
//   WHATSAPP_NUMEROS_AUTORIZADOS quem pode usar, com DDI e DDD: 5511999998888,5511977776666
//   (opcional) MODELO_AGENTE_WHATSAPP=claude-sonnet-5-5 (entende melhor, custa mais; o padrão é o Haiku) · WHATSAPP_GRAPH_VERSAO=v23.0

import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import * as EsquemaDoApp from "https://raw.githubusercontent.com/carvalhocruzadm-sudo/FAZENDA-CARVALHO-CRUZ/main/src/lib/esquema.js";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

// deno-lint-ignore no-explicit-any
type Qualquer = any;
type Registro = Record<string, Qualquer>;
type Dados = Record<string, Registro[]>;

const { ESQUEMA, registroNovo, prepararRegistro, campoVisivel, CATEGORIAS_DESPESA, FORMAS_PAGAMENTO } = EsquemaDoApp as Qualquer;

const MODELO = Deno.env.get("MODELO_AGENTE_WHATSAPP") ?? "claude-haiku-5-5";
const ORIGEM = "WHATSAPP-IA"; // entra no id, para o mesmo comprovante não duplicar
const GRAPH = `https://graph.facebook.com/${Deno.env.get("WHATSAPP_GRAPH_VERSAO") ?? "v23.0"}`;
const BUCKET = "comprovantes"; // o mesmo de src/lib/arquivos.js
const EXTENSOES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/** Tabelas que o assessor nem lê (senhas, links com código de acesso). */
const ESCONDIDAS = new Set(["usuarios", "links_agronomo"]);
/** Tabelas que ele lê mas não grava (o app ou outra função é que preenche). */
const SO_LEITURA = new Set(["notas_fiscais", "avisos", "pulverizacao_itens"]);
/** Cadastros que entram no pedido à IA (nome → id) e servem às contas do esquema. */
const CADASTROS = ["culturas", "fazendas", "talhoes", "safras", "funcionarios", "turmas", "maquinas", "servicos", "insumos", "compradores"];
/** Campos que não cabem numa mensagem (fotos, arquivos, listas). */
const PESADOS = new Set(["foto", "fotos", "arquivo", "itens"]);

const MINUTOS_LEGENDA = 10; // texto mandado até 10 min antes do comprovante vira a legenda dele
const HORAS_CONVERSA = 12; // o assessor lembra das mensagens das últimas 12 horas
const HORAS_PENDENTE = 2; // lançamento esperando o SIM vale por 2 horas

const segredo = (nome: string) => {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`Falta configurar o segredo ${nome} no Supabase.`);
  return v;
};

const banco = () => createClient(segredo("SUPABASE_URL"), segredo("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
type Banco = ReturnType<typeof banco>;

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (d: string) => String(d).slice(0, 10).split("-").reverse().join("/");
const hojeBR = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const diaDaSemana = () => new Date().toLocaleDateString("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" });

// ─── Conferências de segurança ────────────────────────────────────────────

/** A Meta assina cada mensagem com a chave secreta do app; sem isso, qualquer um poderia lançar. */
async function assinaturaValida(corpo: string, cabecalho: string | null) {
  if (!cabecalho?.startsWith("sha256=")) return false;
  const chave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(segredo("WHATSAPP_APP_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const assinatura = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo)));
  const esperado = [...assinatura].map((b) => b.toString(16).padStart(2, "0")).join("");
  const recebido = cabecalho.slice(7);
  if (recebido.length !== esperado.length) return false;
  let diferenca = 0;
  for (let i = 0; i < esperado.length; i++) diferenca |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return diferenca === 0;
}

/** Celular do Brasil às vezes chega sem o 9 da frente (5511 8888-7777); aceita dos dois jeitos. */
function variantes(numero: string) {
  const n = numero.replace(/\D/g, "");
  const lista = [n];
  if (n.startsWith("55") && n.length === 13 && n[4] === "9") lista.push(n.slice(0, 4) + n.slice(5));
  if (n.startsWith("55") && n.length === 12) lista.push(n.slice(0, 4) + "9" + n.slice(4));
  return lista;
}

function autorizado(numero: string) {
  const lista = (Deno.env.get("WHATSAPP_NUMEROS_AUTORIZADOS") ?? "").split(",").map((n) => n.replace(/\D/g, "")).filter(Boolean);
  return variantes(numero).some((v) => lista.includes(v));
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────

async function responder(telefoneId: string, para: string, texto: string, mensagemId?: string) {
  // Fica nos Logs mesmo quando a Meta não entrega (ex.: número de teste), para dar para ver o que houve.
  console.log(`Resposta para ${para}: ${texto.replace(/\n+/g, " | ")}`);
  const r = await fetch(`${GRAPH}/${telefoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${segredo("WHATSAPP_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: para, type: "text", text: { body: texto.slice(0, 4000) },
      ...(mensagemId ? { context: { message_id: mensagemId } } : {}),
    }),
  });
  if (!r.ok) console.error("Falha ao responder no WhatsApp:", await r.text());
}

async function baixarMidia(id: string) {
  const auth = { Authorization: `Bearer ${segredo("WHATSAPP_TOKEN")}` };
  const info = await (await fetch(`${GRAPH}/${id}`, { headers: auth })).json();
  if (!info?.url) throw new Error("Não consegui baixar o arquivo do WhatsApp.");
  const arquivo = await fetch(info.url, { headers: auth });
  if (!arquivo.ok) throw new Error("Não consegui baixar o arquivo do WhatsApp.");
  return { bytes: new Uint8Array(await arquivo.arrayBuffer()), tipo: String(info.mime_type ?? "").split(";")[0] };
}

// ─── IA ───────────────────────────────────────────────────────────────────

async function chamarIA(corpo: Registro) {
  const resposta = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": segredo("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELO, max_tokens: 16000, tool_choice: { type: "auto" }, ...corpo }),
  });
  const json = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(json?.error?.message ?? "A IA não respondeu.");
  return json as { content: Registro[]; stop_reason: string };
}

const textoDa = (r: { content: Registro[] }) =>
  r.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();

// ─── Conversa guardada (whatsapp_conversa) ────────────────────────────────

async function guardar(db: Banco, numero: string, papel: "user" | "assistant", texto: string) {
  const { error } = await db.from("whatsapp_conversa").insert({ numero, papel, texto });
  if (error) console.error("Não consegui guardar a conversa (rodou o SQL da tabela whatsapp_conversa?):", error.message);
}

async function conversaRecente(db: Banco, numero: string, horas: number) {
  const desde = new Date(Date.now() - horas * 3_600_000).toISOString();
  const { data } = await db.from("whatsapp_conversa").select("papel, texto, criado_em")
    .eq("numero", numero).gte("criado_em", desde).order("criado_em", { ascending: false }).limit(16);
  return ((data ?? []) as Registro[]).reverse();
}

/** Mensagens anteriores no formato da IA: começa sempre por uma da pessoa. */
async function historico(db: Banco, numero: string) {
  const linhas = await conversaRecente(db, numero, HORAS_CONVERSA);
  while (linhas.length && linhas[0].papel !== "user") linhas.shift();
  return linhas.map((l) => ({ role: l.papel, content: String(l.texto) }));
}

// ─── Legenda mandada antes do comprovante (whatsapp_recados) ───────────────
// "almoço jhun", "1620": o assessor anota (ferramenta anotar_legenda) e o
// próximo comprovante da mesma pessoa, em até 10 minutos, usa como legenda.

async function recadosRecentes(db: Banco, numero: string) {
  const desde = new Date(Date.now() - MINUTOS_LEGENDA * 60_000).toISOString();
  const { data, error } = await db.from("whatsapp_recados").select("id, texto")
    .eq("numero", numero).gte("criado_em", desde).order("criado_em");
  if (error) console.error("Não consegui ler os recados:", error.message);
  return (data ?? []) as { id: number; texto: string }[];
}

// ─── Cadastros e nomes ────────────────────────────────────────────────────

async function carregarCadastros(db: Banco): Promise<Dados> {
  const dados: Dados = {};
  await Promise.all(CADASTROS.map(async (c) => {
    const { data, error } = await db.from(c).select("*");
    if (error) console.error(`Não consegui ler ${c}:`, error.message);
    dados[c] = (data ?? []) as Registro[];
  }));
  return dados;
}

function nomeDe(colecao: string, r: Registro | undefined, dados: Dados) {
  if (!r) return null;
  try {
    const n = ESQUEMA[colecao]?.resumo?.(r, dados);
    if (n) return String(n);
  } catch { /* cai no nome */ }
  return String(r.nome ?? r.fantasia ?? r.titulo ?? r.id);
}

function nomePorId(colecao: string, id: string, dados: Dados) {
  return nomeDe(colecao, (dados[colecao] ?? []).find((r) => r.id === id), dados) ?? id;
}

/** Valor como a pessoa lê: nome no lugar do id, rótulo da opção, R$, data dd/mm/aaaa. */
function formatar(campo: Registro, v: Qualquer, dados: Dados): string {
  if (v == null || v === "") return "—";
  if (campo.tipo === "ref") return nomePorId(campo.colecao, v, dados);
  if (campo.tipo === "refs" && Array.isArray(v)) return v.map((id) => nomePorId(campo.colecao, id, dados)).join(", ");
  if (campo.tipo === "opcoes" && Array.isArray(campo.opcoes)) {
    const op = campo.opcoes.find((o: Qualquer) => (Array.isArray(o) ? o[0] : o) === v);
    return Array.isArray(op) ? String(op[1]) : String(v);
  }
  if (campo.tipo === "dinheiro") return reais(Number(v));
  if (campo.tipo === "data") return dataBr(v);
  if (campo.tipo === "booleano") return v ? "Sim" : "Não";
  if (campo.tipo === "numero") return Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return String(v);
}

// ─── O esquema do app explicado para a IA ─────────────────────────────────

let descricaoGuardada = "";

/** Campos que o calcular do esquema preenche sozinho (descobertos rodando a conta num registro vazio). */
function calculados(colecao: string) {
  try {
    const vazio: Dados = Object.fromEntries(CADASTROS.map((c) => [c, []]));
    return new Set(Object.keys(ESQUEMA[colecao].calcular?.(registroNovo(colecao), vazio) ?? {}));
  } catch {
    return new Set<string>();
  }
}

function descreverEsquema() {
  if (descricaoGuardada) return descricaoGuardada;
  const partes: string[] = [];
  for (const [colecao, def] of Object.entries<Registro>(ESQUEMA)) {
    if (ESCONDIDAS.has(colecao)) continue;
    const contas = calculados(colecao);
    const marca = SO_LEITURA.has(colecao) ? " (só consulta)" : "";
    const linhas = [`## ${colecao} — ${def.titulo}${marca}`];
    if (def.descricao) linhas.push(String(def.descricao));
    for (const [chave, c] of Object.entries<Registro>(def.campos)) {
      if (PESADOS.has(c.tipo)) continue;
      const info = [c.tipo === "ref" ? `id de ${c.colecao}` : c.tipo === "refs" ? `lista de ids de ${c.colecao}` : c.tipo];
      if (Array.isArray(c.opcoes)) info.push(`opções: ${c.opcoes.map((o: Qualquer) => (Array.isArray(o) ? `${o[0]}=${o[1]}` : o)).join(", ")}`);
      if (Array.isArray(c.sugestoes) && c.sugestoes.length <= 30) info.push(`sugestões: ${c.sugestoes.join(", ")}`);
      if (c.obrigatorio === true) info.push("obrigatório");
      else if (typeof c.obrigatorio === "function") info.push("obrigatório em alguns casos");
      if (c.mostrarSe || c.paraCultura) info.push("só vale em alguns casos");
      if (contas.has(chave)) info.push("conta automática, não preencha");
      if (c.oculto || c.somenteLeitura) info.push("o sistema preenche");
      if (c.dica) info.push(`dica: ${c.dica}`);
      linhas.push(`- ${chave} "${c.rotulo}" (${info.join("; ")})`);
    }
    partes.push(linhas.join("\n"));
  }
  descricaoGuardada = partes.join("\n\n");
  return descricaoGuardada;
}

function listarCadastros(dados: Dados) {
  return CADASTROS.map((c) => {
    const itens = (dados[c] ?? []).slice(0, 400).map((r) => `${r.id} → ${nomeDe(c, r, dados)}${r.ativo === false ? " (inativo)" : ""}`);
    return `## ${c}\n${itens.join("\n") || "(vazio)"}`;
  }).join("\n\n");
}

// ─── Ferramentas do assessor ──────────────────────────────────────────────

const OPERADORES = ["=", "!=", ">", ">=", "<", "<=", "contém", "vazio", "preenchido"];
const FILTROS = {
  type: "array",
  description: "Condições (todas juntas). Ex.: [{coluna:'data', op:'>=', valor:'2026-10-01'}, {coluna:'categoria', op:'=', valor:'Alimentação'}]",
  items: {
    type: "object",
    properties: { coluna: { type: "string" }, op: { type: "string", enum: OPERADORES }, valor: {} },
    required: ["coluna", "op"],
  },
};

const FERRAMENTAS = [
  {
    name: "consultar",
    description: "Busca registros de uma tabela do sistema (até 50). Os campos que apontam para cadastros vêm também com o nome (campo_nome).",
    input_schema: {
      type: "object",
      properties: {
        tabela: { type: "string" },
        filtros: FILTROS,
        ordem: { type: "string", description: "Coluna para ordenar; comece com - para do maior para o menor (ex.: -data)." },
        limite: { type: "integer", description: "Quantos registros (padrão 20, máximo 50)." },
      },
      required: ["tabela"],
    },
  },
  {
    name: "somar",
    description: "Soma colunas numéricas e conta registros de uma tabela, opcionalmente agrupando. Use para totais (quanto gastou, quantos litros, quantas horas).",
    input_schema: {
      type: "object",
      properties: {
        tabela: { type: "string" },
        filtros: FILTROS,
        colunas: { type: "array", items: { type: "string" }, description: "Colunas numéricas a somar (ex.: ['valor'])." },
        agrupar_por: { type: "string", description: "Coluna para agrupar (ex.: 'categoria', 'maquina_id'), ou 'mes:<coluna de data>' para agrupar por mês." },
      },
      required: ["tabela", "colunas"],
    },
  },
  {
    name: "anotar_legenda",
    description: "Guarda o texto como legenda do próximo comprovante (foto/PDF) que a pessoa vai mandar, ex.: 'almoço jhun', '1620', 'diária João'.",
    input_schema: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] },
  },
  {
    name: "propor_lancamento",
    description: "Prepara um lançamento NOVO numa tabela, com as regras do app. Não grava: a pessoa vê o resumo e precisa responder SIM.",
    input_schema: {
      type: "object",
      properties: {
        tabela: { type: "string" },
        campos: { type: "object", description: "Campos do registro (nomes das colunas). Datas AAAA-MM-DD; campos de cadastro com o id." },
      },
      required: ["tabela", "campos"],
    },
  },
  {
    name: "propor_alteracao",
    description: "Prepara a correção de um registro que já existe (ache o id com consultar antes). Não grava: a pessoa precisa responder SIM.",
    input_schema: {
      type: "object",
      properties: {
        tabela: { type: "string" },
        id: { type: "string" },
        campos: { type: "object", description: "Só os campos que mudam, com o valor novo." },
      },
      required: ["tabela", "id", "campos"],
    },
  },
];

type Ctx = { db: Banco; dados: Dados; numero: string; nome: string };

function conferirTabela(tabela: string, gravar = false): { def?: Registro; erro?: string } {
  const def = ESQUEMA[tabela];
  if (!def || ESCONDIDAS.has(tabela)) return { erro: `A tabela "${tabela}" não existe. Use os nomes da lista de tabelas.` };
  if (gravar && SO_LEITURA.has(tabela)) return { erro: `"${def.titulo}" não se lança por aqui; só no app.` };
  return { def };
}

const COLUNAS_FIXAS = ["id", "criado_em", "atualizado_em"];

function aplicarFiltros(q: Qualquer, def: Registro, filtros: Registro[] = []) {
  for (const f of filtros) {
    if (!def.campos[f.coluna] && !COLUNAS_FIXAS.includes(f.coluna)) throw new Error(`A coluna "${f.coluna}" não existe nessa tabela.`);
    const v = f.valor;
    switch (f.op) {
      case "=": q = v == null ? q.is(f.coluna, null) : q.eq(f.coluna, v); break;
      case "!=": q = q.neq(f.coluna, v); break;
      case ">": q = q.gt(f.coluna, v); break;
      case ">=": q = q.gte(f.coluna, v); break;
      case "<": q = q.lt(f.coluna, v); break;
      case "<=": q = q.lte(f.coluna, v); break;
      case "contém": q = q.ilike(f.coluna, `%${String(v ?? "").replace(/[%_\\]/g, "\\$&")}%`); break;
      case "vazio": q = q.is(f.coluna, null); break;
      case "preenchido": q = q.not(f.coluna, "is", null); break;
      default: throw new Error(`Operador "${f.op}" não existe. Use: ${OPERADORES.join(", ")}.`);
    }
  }
  return q;
}

/** Registro enxuto para a IA: sem campos vazios nem pesados, com o nome ao lado de cada id. */
function enxugar(def: Registro, r: Registro, dados: Dados) {
  const saida: Registro = { id: r.id };
  for (const [chave, c] of Object.entries<Registro>(def.campos)) {
    const v = r[chave];
    if (v == null || v === "" || PESADOS.has(c.tipo)) continue;
    saida[chave] = typeof v === "string" && v.length > 300 ? `${v.slice(0, 300)}…` : v;
    if (c.tipo === "ref") saida[`${chave}_nome`] = nomePorId(c.colecao, v, dados);
  }
  return saida;
}

async function consultar(e: Registro, { db, dados }: Ctx) {
  const { def, erro } = conferirTabela(e.tabela);
  if (!def) return { erro };
  let q = aplicarFiltros(db.from(e.tabela).select("*"), def, e.filtros);
  if (e.ordem) {
    const coluna = String(e.ordem).replace(/^-/, "");
    q = q.order(coluna, { ascending: !String(e.ordem).startsWith("-"), nullsFirst: false });
  }
  const { data, error } = await q.limit(Math.min(Number(e.limite) || 20, 50));
  if (error) return { erro: error.message };
  return { quantidade: data?.length ?? 0, registros: (data ?? []).map((r: Registro) => enxugar(def, r, dados)) };
}

async function somar(e: Registro, { db, dados }: Ctx) {
  const { def, erro } = conferirTabela(e.tabela);
  if (!def) return { erro };
  const colunas: string[] = (e.colunas ?? []).filter(Boolean);
  for (const c of colunas) if (!def.campos[c]) return { erro: `A coluna "${c}" não existe nessa tabela.` };
  const porMes = String(e.agrupar_por ?? "").startsWith("mes:");
  const grupo = e.agrupar_por ? String(e.agrupar_por).replace(/^mes:/, "") : null;
  if (grupo && !def.campos[grupo]) return { erro: `A coluna "${grupo}" não existe nessa tabela.` };

  const seletor = [...new Set(["id", ...colunas, ...(grupo ? [grupo] : [])])].join(",");
  const linhas: Registro[] = [];
  for (let pagina = 0; pagina < 30; pagina++) {
    const q = aplicarFiltros(db.from(e.tabela).select(seletor), def, e.filtros);
    const { data, error } = await q.order("id").range(pagina * 1000, pagina * 1000 + 999);
    if (error) return { erro: error.message };
    linhas.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }

  const totais = new Map<string, Registro>();
  for (const r of linhas) {
    let chave = "total";
    if (grupo) {
      const v = r[grupo];
      chave = v == null ? "(vazio)" : porMes ? String(v).slice(0, 7) : def.campos[grupo].tipo === "ref" ? nomePorId(def.campos[grupo].colecao, v, dados) : String(v);
    }
    const t = totais.get(chave) ?? { registros: 0, ...Object.fromEntries(colunas.map((c) => [c, 0])) };
    t.registros++;
    for (const c of colunas) t[c] += Number(r[c]) || 0;
    totais.set(chave, t);
  }
  const resultado: Registro[] = [...totais.entries()].map(([g, t]) => ({ grupo: g, ...t }));
  if (porMes) resultado.sort((a, b) => a.grupo.localeCompare(b.grupo));
  else resultado.sort((a, b) => (Number(b[colunas[0]]) || 0) - (Number(a[colunas[0]]) || 0));
  return { registros_somados: linhas.length, resultado: resultado.slice(0, 60) };
}

/** Resumo do lançamento para a pessoa conferir antes do SIM. */
function resumoDoRegistro(tabela: string, reg: Registro, dados: Dados) {
  const def = ESQUEMA[tabela];
  const linhas = [`*${def.titulo}*`];
  for (const [chave, c] of Object.entries<Registro>(def.campos)) {
    const v = reg[chave];
    if (v == null || v === "" || c.oculto || PESADOS.has(c.tipo) || chave === "lancado_por") continue;
    if (!campoVisivel(c, reg, dados)) continue;
    if (c.tipo === "booleano" && !v && !c.padrao) continue;
    linhas.push(`• ${c.rotulo}: ${formatar(c, v, dados)}`);
  }
  return linhas.join("\n");
}

/** Passa cada campo pelo aoMudar do esquema, como se a pessoa tivesse digitado no app. */
function preencher(def: Registro, base: Registro, campos: Registro, dados: Dados) {
  const reg = { ...base };
  const desconhecidos: string[] = [];
  for (const [chave, v] of Object.entries(campos ?? {})) {
    if (!def.campos[chave]) { desconhecidos.push(chave); continue; }
    reg[chave] = v;
    try {
      Object.assign(reg, def.aoMudar?.[chave]?.(reg, dados, {}) ?? {});
    } catch (e) {
      console.error(`aoMudar de ${chave} falhou:`, e);
    }
  }
  return { reg, desconhecidos };
}

/**
 * O prepararRegistro do app, mas sem exigir foto (a chuva pede a do pluviômetro):
 * pelo WhatsApp em texto não há foto, e quem usa são os números autorizados.
 */
function prepararPeloWhatsApp(tabela: string, reg: Registro, dados: Dados) {
  const fotos = Object.entries<Registro>(ESQUEMA[tabela].campos).filter(([k, c]) => PESADOS.has(c.tipo) && c.obrigatorio && reg[k] == null).map(([k]) => k);
  const provisorio = { ...reg, ...Object.fromEntries(fotos.map((k) => [k, ESQUEMA[tabela].campos[k].tipo === "fotos" ? ["-"] : "-"])) };
  const pronto = prepararRegistro(tabela, provisorio, dados);
  for (const k of fotos) pronto.reg[k] = null;
  return pronto as { reg: Registro; erro: string | null };
}

/** Os registros da própria tabela, para as conferências que comparam com os outros (boleto repetido…). */
async function comOsDaTabela(ctx: Ctx, tabela: string): Promise<Dados> {
  if (!ESQUEMA[tabela].validar || ctx.dados[tabela]) return ctx.dados;
  const { data } = await ctx.db.from(tabela).select("*").order("criado_em", { ascending: false }).limit(5000);
  return { ...ctx.dados, [tabela]: (data ?? []) as Registro[] };
}

async function guardarPendente(ctx: Ctx, acao: "inserir" | "alterar", tabela: string, registro: Registro, resumo: string) {
  const { error } = await ctx.db.from("whatsapp_pendentes")
    .upsert({ numero: ctx.numero, acao, tabela, registro, resumo, criado_em: new Date().toISOString() }, { onConflict: "numero" });
  if (error) return { erro: `Não consegui guardar para confirmação (rodou o SQL da tabela whatsapp_pendentes?): ${error.message}` };
  return { ok: true, resumo };
}

async function proporLancamento(e: Registro, ctx: Ctx) {
  const { def, erro } = conferirTabela(e.tabela, true);
  if (!def) return { erro };
  const base = registroNovo(e.tabela);
  if (def.campos.data) base.data = hojeBR(); // o padrão do app é o dia em UTC; aqui vale o dia no Brasil
  const { reg, desconhecidos } = preencher(def, base, e.campos, ctx.dados);
  if (desconhecidos.length) return { erro: `Campos que não existem em ${e.tabela}: ${desconhecidos.join(", ")}.` };
  if (def.quemLancou) reg.lancado_por = `WhatsApp · ${ctx.nome || ctx.numero}`;

  const dados = await comOsDaTabela(ctx, e.tabela);
  const pronto = prepararPeloWhatsApp(e.tabela, reg, dados);
  if (pronto.erro) return { erro: pronto.erro, dica: "Pergunte à pessoa o que falta ou corrija." };
  const registro = { ...pronto.reg, id: crypto.randomUUID(), atualizado_em: new Date().toISOString() };
  return guardarPendente(ctx, "inserir", e.tabela, registro, `Vou lançar em ${resumoDoRegistro(e.tabela, registro, dados)}`);
}

async function proporAlteracao(e: Registro, ctx: Ctx) {
  const { def, erro } = conferirTabela(e.tabela, true);
  if (!def) return { erro };
  const { data: antes, error } = await ctx.db.from(e.tabela).select("*").eq("id", e.id).maybeSingle();
  if (error) return { erro: error.message };
  if (!antes) return { erro: `Não achei esse registro (id ${e.id}) em ${e.tabela}.` };
  const { reg, desconhecidos } = preencher(def, antes, e.campos, ctx.dados);
  if (desconhecidos.length) return { erro: `Campos que não existem em ${e.tabela}: ${desconhecidos.join(", ")}.` };

  const dados = await comOsDaTabela(ctx, e.tabela);
  const pronto = prepararPeloWhatsApp(e.tabela, reg, dados);
  if (pronto.erro) return { erro: pronto.erro };
  const mudancas: Registro = {};
  const linhas = [`Vou corrigir em *${def.titulo}*:`];
  for (const [chave, c] of Object.entries<Registro>(def.campos)) {
    if (JSON.stringify(antes[chave] ?? null) === JSON.stringify(pronto.reg[chave] ?? null)) continue;
    mudancas[chave] = pronto.reg[chave];
    if (!c.oculto && !PESADOS.has(c.tipo)) linhas.push(`• ${c.rotulo}: ${formatar(c, antes[chave], dados)} → ${formatar(c, pronto.reg[chave], dados)}`);
  }
  if (!Object.keys(mudancas).length) return { erro: "Nada mudaria nesse registro." };
  mudancas.atualizado_em = new Date().toISOString();
  return guardarPendente(ctx, "alterar", e.tabela, { id: e.id, ...mudancas }, linhas.join("\n"));
}

async function executar(nome: string, entrada: Registro, ctx: Ctx): Promise<Registro> {
  try {
    if (nome === "consultar") return await consultar(entrada, ctx);
    if (nome === "somar") return await somar(entrada, ctx);
    if (nome === "anotar_legenda") {
      const { error } = await ctx.db.from("whatsapp_recados").insert({ numero: ctx.numero, texto: String(entrada.texto ?? "").trim() });
      return error ? { erro: `Não consegui anotar (rodou o SQL da tabela whatsapp_recados?): ${error.message}` } : { ok: true };
    }
    if (nome === "propor_lancamento") return await proporLancamento(entrada, ctx);
    if (nome === "propor_alteracao") return await proporAlteracao(entrada, ctx);
    return { erro: `Ferramenta ${nome} não existe.` };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Confirmação (whatsapp_pendentes) ─────────────────────────────────────

const SIM = /^\s*(sim|s|ss|ok|okay|pode|pode lan[cç]ar|confirmo|confirma|confirmado|isso|certo|lan[cç]a|manda)\s*[!.]*\s*$/i;
// Só o "não" sozinho cancela; "não, são 150 litros" vai para a IA refazer o lançamento.
const NAO = /^\s*(n[aã]o|n|cancela|cancelar|deixa|esquece|deixa pra l[aá])\s*[!.]*\s*$/i;

async function pendenteDe(db: Banco, numero: string) {
  const desde = new Date(Date.now() - HORAS_PENDENTE * 3_600_000).toISOString();
  const { data } = await db.from("whatsapp_pendentes").select("*").eq("numero", numero).gte("criado_em", desde).maybeSingle();
  return data as Registro | null;
}

async function gravarPendente(db: Banco, p: Registro) {
  const def = ESQUEMA[p.tabela];
  const { error } = p.acao === "inserir"
    ? await db.from(p.tabela).insert(p.registro)
    : await db.from(p.tabela).update(Object.fromEntries(Object.entries(p.registro).filter(([k]) => k !== "id"))).eq("id", p.registro.id);
  if (error) return `❌ O sistema não aceitou: ${error.message}`;
  await db.from("whatsapp_pendentes").delete().eq("numero", p.numero);
  return `✅ ${p.acao === "inserir" ? "Lançado" : "Corrigido"} em ${def.titulo}.\n[registro: ${p.tabela} ${p.registro.id}]`;
}

// ─── O assessor ───────────────────────────────────────────────────────────

const INSTRUCOES = `Você é o assessor da Fazenda Carvalho Cruz no WhatsApp: ajuda os sócios a consultar e lançar no sistema de gestão da fazenda (milho, laranja, silagem, abóbora, amendoim, confinamento; máquinas, diesel, químicos, financeiro, vendas).

Como trabalhar:
- Responda em português do Brasil, curto, no jeito do WhatsApp: *negrito* com um asterisco de cada lado, listas com •. Nada de títulos com #.
- Pergunta sobre dados: SEMPRE busque com consultar ou somar antes de responder. Nunca invente número, nome ou data.
- Pedido para lançar algo novo: use propor_lancamento. Para corrigir algo que já existe: ache o registro com consultar e use propor_alteracao. Nada é gravado até a pessoa responder SIM — nunca diga que já lançou ou corrigiu.
- Depois de propor, não escreva o resumo de novo: o sistema mostra o resumo e pede o SIM sozinho.
- Campos de cadastro (máquina, talhão, cultura, funcionário, produto, comprador…) guardam o id: ache na lista de cadastros abaixo. Se o nome bater com mais de um, ou com nenhum, pergunte.
- Faltou algo obrigatório: pergunte só o que falta, numa mensagem curta.
- Datas: "hoje", "ontem", "segunda" contam a partir do dia que vem no começo da mensagem. Nas ferramentas, use AAAA-MM-DD.
- Campos marcados como conta automática o sistema calcula: não preencha.
- Apagar registro não é por aqui: diga para apagar no app.
- Comprovante de pagamento (foto ou PDF) a pessoa manda direto e o sistema lança a despesa sozinho. Se ela escrever algo que parece a legenda de um comprovante que vai mandar (ex.: "almoço jhun", "1620", "diária João"), use anotar_legenda com o texto dela.
- O "[registro: tabela id]" nas suas mensagens anteriores é o que foi gravado: use esse id para corrigir.
- Se a pergunta não tem a ver com a fazenda, responda em uma linha que você cuida do sistema da fazenda.

Tabelas do sistema (nome — título; cada campo: nome "rótulo" (tipo; regras)):

`;

async function assessor(ctx: Ctx, texto: string) {
  const historicoAntes = await historico(ctx.db, ctx.numero);
  const pendente = await pendenteDe(ctx.db, ctx.numero);
  const aviso = pendente ? `\n[Esperando o SIM da pessoa para isto (se ela pedir mudança, proponha de novo já com a mudança):\n${pendente.resumo}]` : "";
  const mensagens: Registro[] = [...historicoAntes, { role: "user", content: `[Hoje: ${hojeBR()}, ${diaDaSemana()}]${aviso}\n${texto}` }];
  const sistema = [
    { type: "text", text: INSTRUCOES + descreverEsquema(), cache_control: { type: "ephemeral" } },
    { type: "text", text: `Cadastros (id → nome):\n\n${listarCadastros(ctx.dados)}`, cache_control: { type: "ephemeral" } },
  ];

  for (let volta = 0; volta < 8; volta++) {
    const r = await chamarIA({ system: sistema, tools: FERRAMENTAS, messages: mensagens });
    mensagens.push({ role: "assistant", content: r.content });
    const usos = r.content.filter((b) => b.type === "tool_use");
    if (r.stop_reason !== "tool_use" || !usos.length) return textoDa(r) || "Não entendi. Pode explicar de outro jeito?";

    const resultados: Registro[] = [];
    let proposta: string | null = null;
    let legenda: string | null = null;
    for (const u of usos) {
      const res = await executar(u.name, u.input, ctx);
      console.log(`Ferramenta ${u.name}: ${JSON.stringify(u.input).slice(0, 300)} → ${res.erro ? `erro: ${res.erro}` : "ok"}`);
      if (u.name.startsWith("propor_") && res.ok) proposta = res.resumo;
      if (u.name === "anotar_legenda" && res.ok) legenda = String(u.input.texto ?? "");
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(res).slice(0, 20000), ...(res.erro ? { is_error: true } : {}) });
    }
    if (proposta) {
      const antes = textoDa(r);
      return `${antes ? `${antes}\n\n` : ""}${proposta}\n\nResponda *SIM* para gravar, ou me diga o que mudar.`;
    }
    if (legenda && usos.length === 1) {
      return `📝 Anotei: "${legenda}". Agora mande a foto ou o PDF do comprovante (nos próximos ${MINUTOS_LEGENDA} minutos) que eu uso isso para lançar.`;
    }
    mensagens.push({ role: "user", content: resultados });
  }
  return "Essa ficou complicada para mim. Pode pedir de um jeito mais direto?";
}

// ─── Comprovante ──────────────────────────────────────────────────────────

const FERRAMENTA_COMPROVANTE = {
  name: "lancar_despesa",
  description: "Registra a despesa lida do comprovante no sistema da fazenda.",
  input_schema: {
    type: "object",
    properties: {
      e_comprovante: { type: "boolean", description: "true se o arquivo é um comprovante de pagamento (PIX, boleto pago, transferência, TED…)." },
      motivo: { type: "string", description: "Se não for comprovante, o que é o arquivo, em poucas palavras." },
      data: { type: "string", description: "Data do pagamento, AAAA-MM-DD." },
      valor: { type: "number", description: "Valor pago em reais, com centavos." },
      favorecido: { type: "string", description: "Quem recebeu o dinheiro, como está escrito no comprovante." },
      forma_pagamento: { type: "string", enum: FORMAS_PAGAMENTO },
      categoria: { type: "string", enum: CATEGORIAS_DESPESA },
      tipo: { type: "string", description: "Detalhe curto da categoria, ex.: Diárias, Almoço, Pneus, Pró-labore LB." },
      descricao: { type: "string", description: "Descrição curta da despesa. Use a legenda da mensagem quando houver." },
      centro: { type: "string", enum: ["geral", "cultura"], description: "geral, ou cultura quando a legenda ou o histórico deixam claro para qual cultura foi." },
      cultura_id: { type: ["string", "null"], description: "id da cultura (da lista) quando centro = cultura." },
      maquina_id: { type: ["string", "null"], description: "id da máquina/caminhão (da lista) quando o texto diz que a despesa foi dela." },
      id_transacao: { type: ["string", "null"], description: "ID da transação / autenticação / E2E do comprovante, se aparecer." },
      duvida: { type: ["string", "null"], description: "O que ficou incerto e vale a pessoa conferir. null se estiver tudo claro." },
    },
    required: ["e_comprovante"],
  },
};

type Leitura = {
  e_comprovante: boolean; motivo?: string; data?: string; valor?: number; favorecido?: string;
  forma_pagamento?: string; categoria?: string; tipo?: string; descricao?: string; centro?: string;
  cultura_id?: string | null; maquina_id?: string | null; id_transacao?: string | null; duvida?: string | null;
};

type Item = { id: string; nome: string };

/** O último lançamento de cada favorecido ensina à IA como a fazenda costuma classificar. */
async function historicoDeFavorecidos(db: Banco, culturas: Item[]) {
  const { data: recentes } = await db.from("despesas").select("favorecido, categoria, tipo, centro, cultura_id, data")
    .not("favorecido", "is", null).order("data", { ascending: false }).limit(1500);
  const vistos = new Map<string, string>();
  const nomeCultura = new Map(culturas.map((c) => [c.id, c.nome]));
  for (const d of (recentes ?? []) as Registro[]) {
    const chave = String(d.favorecido).trim().toUpperCase();
    if (vistos.has(chave) || vistos.size >= 250) continue;
    const cult = d.centro === "cultura" ? ` · cultura ${nomeCultura.get(d.cultura_id) ?? "?"}` : "";
    vistos.set(chave, `${chave} → ${d.categoria}${d.tipo ? ` / ${d.tipo}` : ""}${cult}`);
  }
  return [...vistos.values()].join("\n");
}

async function lerComprovante(arquivo: { bytes: Uint8Array; tipo: string }, legenda: string, culturas: Item[], maquinas: Item[], historicoFav: string): Promise<Leitura> {
  const dados = encodeBase64(arquivo.bytes);
  const bloco = arquivo.tipo === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: dados } }
    : { type: "image", source: { type: "base64", media_type: arquivo.tipo, data: dados } };

  const pedido = `Este arquivo foi mandado pelo WhatsApp para o financeiro da Fazenda Carvalho Cruz (milho, laranja, silagem, abóbora, amendoim, confinamento).
Leia o comprovante e responda chamando a ferramenta lancar_despesa (sempre, mesmo que não seja comprovante).

O que a pessoa escreveu (legenda da foto e mensagens de texto mandadas logo antes): ${legenda ? `"${legenda}"` : "(nada)"}
Hoje: ${hojeBR()}

Culturas cadastradas (id → nome):
${culturas.map((c) => `${c.id} → ${c.nome}`).join("\n") || "(nenhuma)"}

Máquinas e caminhões (id → nome):
${maquinas.map((m) => `${m.id} → ${m.nome}`).join("\n") || "(nenhuma)"}

Como a fazenda classificou cada favorecido da última vez (use para escolher categoria, tipo e cultura):
${historicoFav || "(sem histórico)"}

Regras:
- O que a pessoa escreveu manda, sempre acima do histórico: se diz para que foi (ex.: "diária João", "pró-labore LB", "adubo milho", "almoço"), use isso na categoria, no tipo e na descrição.
- Comida (almoço, janta, café, lanche, marmita, refeição, restaurante) = "Alimentação", com o tipo "Almoço", "Janta" etc.
- Se o texto cita uma máquina ou caminhão (nome, modelo ou placa), preencha maquina_id. "1620" é o caminhão MB 1620.
- Só quando a pessoa não escreveu para que foi, use o histórico do favorecido; se não tiver histórico, escolha a categoria mais provável e diga a dúvida.
- Pró-labore e retirada dos sócios (Lucas, Carlinhos) = "Retirada / dividendos". Pagamento de boleto de banco/financiamento = "Empréstimos".
- Valor e data exatamente como no comprovante. Nunca invente: se não der para ler, diga em "duvida".`;

  const r = await chamarIA({
    output_config: { effort: "low" },
    tools: [FERRAMENTA_COMPROVANTE],
    messages: [{ role: "user", content: [bloco, { type: "text", text: pedido }] }],
  });
  const uso = r.content.find((b) => b.type === "tool_use");
  if (!uso) throw new Error("A IA não devolveu a leitura do comprovante.");
  return uso.input as Leitura;
}

/** Mesmo comprovante mandado duas vezes vira o mesmo id, então não duplica. */
async function idDoComprovante(chave: string) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ORIGEM}:${chave}`)));
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

// "1620" no texto é o caminhão (mesma regra e mesmo id de src/lib/esquema.js).
const CAMINHAO_1620 = "00000000-0000-4000-8300-000000000001";
const tem1620 = (texto?: string | null) => /(^|\D)1620(\D|$)/.test(texto ?? "");

/** Lança o comprovante e devolve a resposta (com o id marcado para a conversa). */
async function comprovante(db: Banco, msg: Mensagem, nome: string, midia: { id: string; caption?: string }) {
  const arquivo = await baixarMidia(midia.id);
  if (arquivo.tipo !== "application/pdf" && !/^image\/(jpeg|png|webp|gif)$/.test(arquivo.tipo)) {
    return "Esse tipo de arquivo eu não consigo ler. Mande a foto (print) ou o PDF do comprovante.";
  }
  const recados = await recadosRecentes(db, msg.from);
  const legenda = [...recados.map((r) => r.texto), midia.caption ?? ""].map((t) => t.trim()).filter(Boolean).join(" · ");
  if (recados.length) await db.from("whatsapp_recados").delete().in("id", recados.map((r) => r.id));
  await guardar(db, msg.from, "user", `[comprovante enviado]${midia.caption ? ` ${midia.caption}` : ""}`);

  const [{ data: cults }, { data: maqs }] = await Promise.all([
    db.from("culturas").select("id, nome").order("nome"),
    db.from("maquinas").select("id, nome, modelo, placa").order("nome"),
  ]);
  const culturas = (cults ?? []) as Item[];
  const maquinas = ((maqs ?? []) as Registro[]).map((m) => ({ id: m.id, nome: [m.nome, m.modelo, m.placa].filter(Boolean).join(" · ") }));
  const l = await lerComprovante(arquivo, legenda, culturas, maquinas, await historicoDeFavorecidos(db, culturas));

  if (!l.e_comprovante) return `Não lancei nada: isso não parece um comprovante de pagamento${l.motivo ? ` (${l.motivo})` : ""}.`;
  if (!l.valor || !l.data || !/^\d{4}-\d{2}-\d{2}$/.test(l.data)) {
    return `Não consegui ler ${!l.valor ? "o valor" : "a data"} desse comprovante. Mande uma foto mais nítida ou lance no app.${l.duvida ? `\n\n${l.duvida}` : ""}`;
  }

  const cultura = l.centro === "cultura" ? culturas.find((c) => c.id === l.cultura_id) : undefined;
  const maquina = maquinas.find((m) => m.id === l.maquina_id)
    ?? ([legenda, l.tipo, l.descricao].some(tem1620) ? maquinas.find((m) => m.id === CAMINHAO_1620) : undefined);
  const quando = msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString().slice(0, 10) : l.data;
  const id = await idDoComprovante(l.id_transacao?.replace(/\s/g, "") || msg.id);

  const { data: existente } = await db.from("despesas").select("id, valor, favorecido, data").eq("id", id).maybeSingle();
  if (existente) {
    return `Esse comprovante já tinha sido lançado (${reais(Number(existente.valor))} para ${existente.favorecido ?? "?"} em ${dataBr(existente.data)}). Não lancei de novo.\n[registro: despesas ${id}]`;
  }

  // O arquivo vai para o mesmo lugar dos comprovantes anexados pelo app.
  const caminho = `despesas/${quando.slice(0, 7)}/${id}.${EXTENSOES[arquivo.tipo]}`;
  const envio = await db.storage.from(BUCKET).upload(caminho, arquivo.bytes, { contentType: arquivo.tipo, upsert: true });
  if (envio.error) throw new Error(`Não consegui guardar o arquivo do comprovante: ${envio.error.message}`);

  const despesa = {
    id,
    data: l.data,
    categoria: CATEGORIAS_DESPESA.includes(l.categoria ?? "") ? l.categoria : "Outros",
    tipo: l.tipo || (legenda ? null : "Sem legenda no WhatsApp"),
    descricao: l.descricao || legenda || `Comprovante — ${l.favorecido ?? "sem favorecido"}`,
    valor: Math.round(l.valor * 100) / 100,
    forma_pagamento: FORMAS_PAGAMENTO.includes(l.forma_pagamento ?? "") ? l.forma_pagamento : "PIX",
    favorecido: l.favorecido || null,
    centro: cultura ? "cultura" : "geral",
    cultura_id: cultura?.id ?? null,
    maquina_id: maquina?.id ?? null,
    pago: true,
    nota: `WhatsApp · enviado por ${nome || msg.from} em ${dataBr(quando)}${l.id_transacao ? ` · transação ${l.id_transacao}` : ""}`,
    comprovante: caminho,
    lancado_por: `WhatsApp · ${nome || msg.from}`,
  };

  const { data: gravado, error } = await db.from("despesas").upsert(despesa, { onConflict: "id", ignoreDuplicates: true }).select("id");
  if (error) throw new Error(`O banco recusou a despesa: ${error.message}`);
  if (!gravado?.length) {
    return `Esse comprovante já tinha sido lançado (${reais(despesa.valor)} para ${despesa.favorecido ?? "?"} em ${dataBr(despesa.data)}). Não lancei de novo.\n[registro: despesas ${id}]`;
  }

  // Igual lançada à mão (mesmo dia, valor e favorecido)? Avisa para conferir.
  const { data: parecidas } = despesa.favorecido
    ? await db.from("despesas").select("id").eq("data", despesa.data).eq("valor", despesa.valor)
      .ilike("favorecido", despesa.favorecido.replace(/[%_\\]/g, "\\$&")).neq("id", despesa.id).limit(1)
    : { data: [] };

  const linhas = [
    "✅ *Lancei em Despesas:*",
    `• ${reais(despesa.valor)} — ${despesa.forma_pagamento}`,
    `• Para: ${despesa.favorecido ?? "não identificado"}`,
    `• Data: ${dataBr(despesa.data)}`,
    `• Categoria: ${despesa.categoria}${despesa.tipo ? ` (${despesa.tipo})` : ""}`,
    `• Centro de custo: ${cultura ? cultura.nome : "Geral da fazenda"}`,
    ...(maquina ? [`• Máquina: ${maquina.nome}`] : []),
  ];
  if (l.duvida) linhas.push("", `⚠️ Confira: ${l.duvida}`);
  if (parecidas?.length) linhas.push("", "⚠️ Já existia uma despesa igual (mesmo dia, valor e favorecido). Veja no app se não ficou repetida.");
  linhas.push("", "Se algo estiver errado, é só me dizer (ex.: \"muda a categoria para Peças\").", `[registro: despesas ${id}]`);
  return linhas.join("\n");
}

// ─── Cada mensagem ────────────────────────────────────────────────────────

type Mensagem = {
  id: string; from: string; type: string; timestamp?: string;
  text?: { body: string };
  image?: { id: string; mime_type?: string; caption?: string };
  document?: { id: string; mime_type?: string; caption?: string; filename?: string };
};

/** O "[registro: …]" fica guardado na conversa (para a IA achar o que acabou de lançar), mas não vai para o WhatsApp. */
const semMarcas = (texto: string) => texto.replace(/\n?\[registro: [^\]]+\]/g, "").trim();

async function tratar(msg: Mensagem, nome: string, telefoneId: string) {
  const enviar = (texto: string, citar = true) => responder(telefoneId, msg.from, semMarcas(texto), citar ? msg.id : undefined);
  if (!autorizado(msg.from)) {
    console.warn("Mensagem de número não autorizado:", msg.from);
    return;
  }
  const db = banco();
  try {
    const midia = msg.image ?? msg.document;
    if (midia) {
      const resposta = await comprovante(db, msg, nome, midia);
      await guardar(db, msg.from, "assistant", resposta);
      return await enviar(resposta);
    }

    const texto = msg.text?.body?.trim();
    if (!texto) return await enviar("Por enquanto eu entendo texto, foto e PDF. Áudio, figurinha e vídeo ainda não.");

    // SIM / NÃO para o que estava esperando confirmação.
    const pendente = await pendenteDe(db, msg.from);
    if (pendente && (SIM.test(texto) || NAO.test(texto))) {
      let resposta = "Ok, não gravei nada.";
      if (SIM.test(texto)) resposta = await gravarPendente(db, pendente);
      else await db.from("whatsapp_pendentes").delete().eq("numero", msg.from);
      await guardar(db, msg.from, "user", texto);
      await guardar(db, msg.from, "assistant", resposta);
      return await enviar(resposta);
    }

    const ctx: Ctx = { db, dados: await carregarCadastros(db), numero: msg.from, nome };
    const resposta = await assessor(ctx, texto);
    await guardar(db, msg.from, "user", texto);
    await guardar(db, msg.from, "assistant", resposta);
    await enviar(resposta);
  } catch (e) {
    console.error("Erro ao tratar mensagem:", e);
    await enviar(`Tive um problema agora (${e instanceof Error ? e.message : "erro"}). Tente de novo daqui a pouco.`);
  }
}

// ─── Entrada ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // A Meta confere o endereço uma vez, quando você cadastra o webhook.
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe"
      && url.searchParams.get("hub.verify_token") === Deno.env.get("WHATSAPP_VERIFY_TOKEN");
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "") : new Response("Token inválido", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Método não aceito", { status: 405 });

  const corpo = await req.text();
  if (!(await assinaturaValida(corpo, req.headers.get("x-hub-signature-256")))) {
    return new Response("Assinatura inválida", { status: 401 });
  }

  const evento = JSON.parse(corpo);
  const tarefas: Promise<unknown>[] = [];
  for (const entrada of evento.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      const v = mudanca.value ?? {};
      const nomes = new Map((v.contacts ?? []).map((c: { wa_id: string; profile?: { name?: string } }) => [c.wa_id, c.profile?.name ?? ""]));
      for (const msg of (v.messages ?? []) as Mensagem[]) {
        console.log(`Mensagem recebida de ${msg.from} (${msg.type})`);
        tarefas.push(tratar(msg, String(nomes.get(msg.from) ?? ""), v.metadata?.phone_number_id));
      }
      // A Meta aceita a resposta na hora e só depois avisa se não conseguiu entregar.
      for (const st of v.statuses ?? []) {
        if (st.status !== "failed") continue;
        const erro = st.errors?.[0];
        console.error(`Resposta NÃO entregue para ${st.recipient_id}: erro ${erro?.code ?? "?"} — ${erro?.title ?? "sem detalhe"}`);
      }
    }
  }

  // Responde logo para a Meta não reenviar; a leitura continua em segundo plano.
  EdgeRuntime.waitUntil(Promise.allSettled(tarefas));
  return new Response("ok");
});
