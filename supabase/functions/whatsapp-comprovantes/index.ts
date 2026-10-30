// Agente de comprovantes pelo WhatsApp.
// Você manda a foto (ou o PDF) do comprovante para o número do agente; ele lê
// com a IA, lança em Despesas e responde dizendo o que lançou.
//
// Roda no Supabase (Edge Functions) e recebe as mensagens da WhatsApp Cloud API
// (Meta). Só aceita mensagens assinadas pela Meta e vindas dos números
// autorizados. Passo a passo para ligar: README → "Agente de comprovantes".
//
// Deploy:  supabase functions deploy whatsapp-comprovantes --no-verify-jwt
// Segredos (supabase secrets set NOME=valor):
//   ANTHROPIC_API_KEY            chave de console.anthropic.com
//   WHATSAPP_TOKEN               token permanente do usuário do sistema (Meta)
//   WHATSAPP_APP_SECRET          "Chave secreta do app" (Meta → Configurações do app → Básico)
//   WHATSAPP_VERIFY_TOKEN        uma senha qualquer que você inventa e repete na Meta
//   WHATSAPP_NUMEROS_AUTORIZADOS quem pode mandar comprovante, com DDI e DDD: 5511999998888,5511977776666
//   (opcional) MODELO_AGENTE_WHATSAPP=claude-sonnet-5-5 (lê melhor, custa mais; o padrão é o Haiku) · WHATSAPP_GRAPH_VERSAO=v23.0

import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

// Mesmas listas de src/lib/esquema.js.
const CATEGORIAS_DESPESA = [
  "Alimentação", "Produtos químicos", "Adubos", "Sementes", "Peças", "Serviços",
  "Combustíveis", "Salários", "Taxas", "Benfeitorias", "Investimentos",
  "Arrendamentos", "Empréstimos", "Retirada / dividendos", "Fretes", "Compra de laranja", "Cartão de crédito", "Outros",
];
const FORMAS_PAGAMENTO = ["PIX", "Boleto", "Cartão", "Dinheiro", "Transferência", "Cheque"];

const ORIGEM = "WHATSAPP-IA"; // entra no id, para o mesmo comprovante não duplicar
const GRAPH = `https://graph.facebook.com/${Deno.env.get("WHATSAPP_GRAPH_VERSAO") ?? "v23.0"}`;
const BUCKET = "comprovantes"; // o mesmo de src/lib/arquivos.js
const EXTENSOES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

const segredo = (nome: string) => {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`Falta configurar o segredo ${nome} no Supabase.`);
  return v;
};

const banco = () => createClient(segredo("SUPABASE_URL"), segredo("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

// ─── Conferências de segurança ────────────────────────────────────────────

/** A Meta assina cada mensagem com a chave secreta do app; sem isso, qualquer um poderia lançar despesa. */
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
      messaging_product: "whatsapp", to: para, type: "text", text: { body: texto },
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

// ─── Leitura do comprovante pela IA ───────────────────────────────────────

const FERRAMENTA = {
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
type Contexto = { culturas: Item[]; maquinas: Item[]; historico: string };

async function contexto(db: ReturnType<typeof banco>): Promise<Contexto> {
  const [{ data: culturas }, { data: maquinas }, { data: recentes }] = await Promise.all([
    db.from("culturas").select("id, nome").order("nome"),
    db.from("maquinas").select("id, nome, modelo, placa").order("nome"),
    db.from("despesas").select("favorecido, categoria, tipo, centro, cultura_id, data").not("favorecido", "is", null).order("data", { ascending: false }).limit(1500),
  ]);
  // O último lançamento de cada favorecido ensina à IA como a fazenda costuma classificar.
  const vistos = new Map<string, string>();
  const nomeCultura = new Map((culturas ?? []).map((c) => [c.id, c.nome]));
  for (const d of recentes ?? []) {
    const chave = String(d.favorecido).trim().toUpperCase();
    if (vistos.has(chave) || vistos.size >= 250) continue;
    const cult = d.centro === "cultura" ? ` · cultura ${nomeCultura.get(d.cultura_id) ?? "?"}` : "";
    vistos.set(chave, `${chave} → ${d.categoria}${d.tipo ? ` / ${d.tipo}` : ""}${cult}`);
  }
  return {
    culturas: culturas ?? [],
    maquinas: (maquinas ?? []).map((m) => ({ id: m.id, nome: [m.nome, m.modelo, m.placa].filter(Boolean).join(" · ") })),
    historico: [...vistos.values()].join("\n"),
  };
}

async function lerComprovante(arquivo: { bytes: Uint8Array; tipo: string }, legenda: string, ctx: Contexto): Promise<Leitura> {
  const dados = encodeBase64(arquivo.bytes);
  const bloco = arquivo.tipo === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: dados } }
    : { type: "image", source: { type: "base64", media_type: arquivo.tipo, data: dados } };

  const pedido = `Este arquivo foi mandado pelo WhatsApp para o financeiro da Fazenda Carvalho Cruz (milho, laranja, silagem, abóbora, amendoim, confinamento).
Leia o comprovante e responda chamando a ferramenta lancar_despesa (sempre, mesmo que não seja comprovante).

O que a pessoa escreveu (legenda da foto e mensagens de texto mandadas logo antes): ${legenda ? `"${legenda}"` : "(nada)"}
Hoje: ${new Date().toISOString().slice(0, 10)}

Culturas cadastradas (id → nome):
${ctx.culturas.map((c) => `${c.id} → ${c.nome}`).join("\n") || "(nenhuma)"}

Máquinas e caminhões (id → nome):
${ctx.maquinas.map((m) => `${m.id} → ${m.nome}`).join("\n") || "(nenhuma)"}

Como a fazenda classificou cada favorecido da última vez (use para escolher categoria, tipo e cultura):
${ctx.historico || "(sem histórico)"}

Regras:
- O que a pessoa escreveu manda, sempre acima do histórico: se diz para que foi (ex.: "diária João", "pró-labore LB", "adubo milho", "almoço"), use isso na categoria, no tipo e na descrição.
- Comida (almoço, janta, café, lanche, marmita, refeição, restaurante) = "Alimentação", com o tipo "Almoço", "Janta" etc.
- Se o texto cita uma máquina ou caminhão (nome, modelo ou placa), preencha maquina_id. "1620" é o caminhão MB 1620.
- Só quando a pessoa não escreveu para que foi, use o histórico do favorecido; se não tiver histórico, escolha a categoria mais provável e diga a dúvida.
- Pró-labore e retirada dos sócios (Lucas, Carlinhos) = "Retirada / dividendos". Pagamento de boleto de banco/financiamento = "Empréstimos".
- Valor e data exatamente como no comprovante. Nunca invente: se não der para ler, diga em "duvida".`;

  const resposta = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": segredo("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("MODELO_AGENTE_WHATSAPP") ?? "claude-haiku-5-5",
      max_tokens: 16000,
      output_config: { effort: "low" },
      tools: [FERRAMENTA],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: [bloco, { type: "text", text: pedido }] }],
    }),
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(corpo?.error?.message ?? "A leitura pela IA falhou.");
  const uso = (corpo.content ?? []).find((b: { type: string }) => b.type === "tool_use");
  if (!uso) throw new Error("A IA não devolveu a leitura do comprovante.");
  return uso.input as Leitura;
}

// ─── Lançamento ───────────────────────────────────────────────────────────

/** Mesmo comprovante mandado duas vezes vira o mesmo id, então não duplica. */
async function idDoComprovante(chave: string) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ORIGEM}:${chave}`)));
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (d: string) => d.split("-").reverse().join("/");

type Mensagem = {
  id: string; from: string; type: string; timestamp?: string;
  text?: { body: string };
  image?: { id: string; mime_type?: string; caption?: string };
  document?: { id: string; mime_type?: string; caption?: string; filename?: string };
};

const AJUDA = "Oi! Sou o agente de comprovantes da Fazenda Carvalho Cruz. Me mande a *foto ou o PDF do comprovante* (PIX, boleto, transferência). Se quiser, escreva para que foi (ex.: \"diária João\", \"almoço 1620\") na legenda ou numa mensagem antes da foto, que eu lanço certinho em Despesas.";

// "1620" no texto é o caminhão (mesma regra e mesmo id de src/lib/esquema.js).
const CAMINHAO_1620 = "00000000-0000-4000-8300-000000000001";
const tem1620 = (texto?: string | null) => /(^|\D)1620(\D|$)/.test(texto ?? "");

const SAUDACAO = /^\s*(oi+|ol[aá]|bom dia|boa tarde|boa noite|ajuda|menu)[\s!.?]*$/i;
const MINUTOS_RECADO = 10;

/**
 * Texto mandado separado da foto ("almoço jhun", "1620") fica anotado em
 * whatsapp_recados e entra como legenda do próximo comprovante da mesma pessoa.
 */
async function anotarRecado(db: ReturnType<typeof banco>, numero: string, texto: string) {
  const { error } = await db.from("whatsapp_recados").insert({ numero, texto });
  if (error) console.error("Não consegui anotar o recado (rodou o SQL da tabela whatsapp_recados?):", error.message);
}

async function recadosRecentes(db: ReturnType<typeof banco>, numero: string) {
  const desde = new Date(Date.now() - MINUTOS_RECADO * 60_000).toISOString();
  const { data, error } = await db.from("whatsapp_recados").select("id, texto")
    .in("numero", variantes(numero)).gte("criado_em", desde).order("criado_em");
  if (error) console.error("Não consegui ler os recados:", error.message);
  return (data ?? []) as { id: number; texto: string }[];
}

async function tratar(msg: Mensagem, nome: string, telefoneId: string) {
  const enviar = (texto: string, citar = true) => responder(telefoneId, msg.from, texto, citar ? msg.id : undefined);
  if (!autorizado(msg.from)) {
    console.warn("Mensagem de número não autorizado:", msg.from);
    return;
  }
  const midia = msg.image ?? msg.document;
  if (!midia) {
    const texto = msg.text?.body?.trim();
    if (!texto || SAUDACAO.test(texto)) return enviar(AJUDA, false);
    await anotarRecado(banco(), msg.from, texto);
    return enviar(`📝 Anotei: "${texto}". Agora mande a foto ou o PDF do comprovante (nos próximos ${MINUTOS_RECADO} minutos) que eu uso isso para lançar.`);
  }

  try {
    const arquivo = await baixarMidia(midia.id);
    if (arquivo.tipo !== "application/pdf" && !/^image\/(jpeg|png|webp|gif)$/.test(arquivo.tipo)) {
      return enviar("Esse tipo de arquivo eu não consigo ler. Mande a foto (print) ou o PDF do comprovante.");
    }

    const db = banco();
    const recados = await recadosRecentes(db, msg.from);
    const legenda = [...recados.map((r) => r.texto), midia.caption ?? ""].map((t) => t.trim()).filter(Boolean).join(" · ");
    const usarRecados = async () => {
      if (recados.length) await db.from("whatsapp_recados").delete().in("id", recados.map((r) => r.id));
    };
    const ctx = await contexto(db);
    const l = await lerComprovante(arquivo, legenda, ctx);

    if (!l.e_comprovante) {
      return enviar(`Não lancei nada: isso não parece um comprovante de pagamento${l.motivo ? ` (${l.motivo})` : ""}.`);
    }
    if (!l.valor || !l.data || !/^\d{4}-\d{2}-\d{2}$/.test(l.data)) {
      return enviar(`Não consegui ler ${!l.valor ? "o valor" : "a data"} desse comprovante. Mande uma foto mais nítida ou lance no app.${l.duvida ? `\n\n${l.duvida}` : ""}`);
    }

    const cultura = l.centro === "cultura" ? ctx.culturas.find((c) => c.id === l.cultura_id) : undefined;
    const maquina = ctx.maquinas.find((m) => m.id === l.maquina_id)
      ?? ([legenda, l.tipo, l.descricao].some(tem1620) ? ctx.maquinas.find((m) => m.id === CAMINHAO_1620) : undefined);
    const quando = msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString().slice(0, 10) : l.data;
    const id = await idDoComprovante(l.id_transacao?.replace(/\s/g, "") || msg.id);

    const { data: existente } = await db.from("despesas").select("id, valor, favorecido, data").eq("id", id).maybeSingle();
    if (existente) {
      await usarRecados();
      return enviar(`Esse comprovante já tinha sido lançado (${reais(Number(existente.valor))} para ${existente.favorecido ?? "?"} em ${dataBr(existente.data)}). Não lancei de novo.`);
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
    await usarRecados();
    if (!gravado?.length) {
      return enviar(`Esse comprovante já tinha sido lançado (${reais(despesa.valor)} para ${despesa.favorecido ?? "?"} em ${dataBr(despesa.data)}). Não lancei de novo.`);
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
    linhas.push("", "Se algo estiver errado, corrija no app em Financeiro → Despesas.");
    await enviar(linhas.join("\n"));
  } catch (e) {
    console.error("Erro ao tratar comprovante:", e);
    await enviar(`Não consegui lançar esse comprovante agora (${e instanceof Error ? e.message : "erro"}). Tente mandar de novo daqui a pouco ou lance no app.`);
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
