// Emissão de NF-e pelo Bling (API v3).
// Roda no Supabase (Edge Functions): o "client secret" do Bling e as chaves de
// acesso ficam aqui e na tabela bling_conexao (trancada), nunca no app.
//
// Deploy (o --no-verify-jwt é porque o Bling chama esta função de volta, sem
// login, para entregar o código da autorização; as ações do app conferem o
// login aqui dentro):
//   supabase functions deploy bling --no-verify-jwt
//   supabase secrets set BLING_CLIENT_ID=... BLING_CLIENT_SECRET=...
//
// No aplicativo cadastrado no Bling, o "Link de redirecionamento" é o
// endereço desta função: https://SEU-PROJETO.supabase.co/functions/v1/bling
//
// Ações (POST { acao, ... }, com o login do app):
//   situacao            → está conectado? qual natureza de operação?
//   link                → endereço para autorizar o Bling (abre numa aba)
//   naturezas           → naturezas de operação cadastradas no Bling
//   configurar          → guarda a natureza de operação padrão
//   emitir { venda_id } → cria a NF-e no Bling, envia para a SEFAZ e guarda o resultado
//   consultar { venda_id } → pergunta de novo a situação (quando a SEFAZ demora)

import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://api.bling.com.br/Api/v3";
const OAUTH = "https://www.bling.com.br/Api/v3/oauth";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// O Supabase não deixa função devolver página HTML: a resposta para quem
// volta do Bling é texto simples.
const texto = (t: string, status = 200) =>
  new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

class ErroBling extends Error {}

// deno-lint-ignore no-explicit-any
type Qualquer = any;

// ─── Conexão (OAuth) ────────────────────────────────────────────────────────

const clientId = () => Deno.env.get("BLING_CLIENT_ID") ?? "";
const clientSecret = () => Deno.env.get("BLING_CLIENT_SECRET") ?? "";

async function lerConexao() {
  const { data } = await admin.from("bling_conexao").select("*").eq("id", 1).maybeSingle();
  return data;
}

async function gravarConexao(campos: Record<string, unknown>) {
  const { error } = await admin.from("bling_conexao")
    .upsert({ id: 1, ...campos, atualizado_em: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw new ErroBling(`Não consegui gravar a conexão: ${error.message}`);
}

/** Pede chaves novas ao Bling (com o código da autorização ou com o refresh_token). */
async function pedirToken(corpo: Record<string, string>) {
  const r = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId()}:${clientSecret()}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "1.0",
    },
    body: new URLSearchParams(corpo),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new ErroBling(mensagemDoBling(d) || "O Bling recusou a autorização.");
  // O refresh_token muda a cada renovação: sempre gravar o novo.
  await gravarConexao({
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expira_em: new Date(Date.now() + (Number(d.expires_in) || 21600) * 1000).toISOString(),
    estado: null,
  });
  return d.access_token as string;
}

/** Chave de acesso válida (renova sozinha quando está para vencer: dura 6 h). */
async function token() {
  const c = await lerConexao();
  if (!c?.refresh_token) throw new ErroBling("O sistema ainda não está conectado ao Bling. Clique em “Conectar ao Bling”.");
  if (c.access_token && new Date(c.expira_em).getTime() - Date.now() > 120_000) return c.access_token as string;
  try {
    return await pedirToken({ grant_type: "refresh_token", refresh_token: c.refresh_token });
  } catch {
    throw new ErroBling("A conexão com o Bling venceu (passa de 30 dias sem uso). Clique em “Conectar ao Bling” de novo.");
  }
}

// ─── Chamadas à API ─────────────────────────────────────────────────────────

/** Junta a mensagem de erro do Bling com os campos que ele apontou. */
function mensagemDoBling(d: Qualquer) {
  const e = d?.error;
  if (!e) return d?.error_description ?? "";
  const campos = (e.fields ?? []).map((f: Qualquer) => [f.element, f.msg].filter(Boolean).join(": ")).filter(Boolean);
  return [e.description || e.message, ...campos].filter(Boolean).join(" · ");
}

async function bling(metodo: string, caminho: string, corpo?: unknown) {
  const r = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", Accept: "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const d = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroBling(mensagemDoBling(d) || `O Bling respondeu com erro ${r.status}.`);
  return d;
}

// ─── Montagem da nota ───────────────────────────────────────────────────────

const so = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const n = (v: unknown) => Number(v) || 0;

/** Quilos em cada unidade de venda (o mesmo de UNIDADES_VENDA no app). */
const KG: Record<string, number> = { t: 1000, kg: 1, sc60: 60, arroba: 15 };
const UNIDADE_NF: Record<string, string> = {
  t: "TON", kg: "KG", sc60: "SC", arroba: "ARROBA", saco: "SC", caixa: "CX", unidade: "UN", cabeca: "CAB",
};

/** Data e hora de agora no horário de Brasília, como o Bling pede. */
const agoraBrasilia = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }).format(new Date());

const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const igual = (a: unknown, b: unknown) =>
  String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

async function montarNota(venda: Qualquer, naturezaId: number, observacoes: string) {
  const [{ data: cultura }, { data: compradores }] = await Promise.all([
    admin.from("culturas").select("*").eq("id", venda.cultura_id).maybeSingle(),
    admin.from("compradores").select("*"),
  ]);
  const comp = (compradores ?? []).find((c: Qualquer) => c.ativo !== false && igual(c.nome, venda.comprador));

  const faltam: string[] = [];
  if (!comp) faltam.push(`cadastro do comprador “${venda.comprador}” (aba Compradores)`);
  else {
    if (![11, 14].includes(so(comp.documento).length)) faltam.push("CNPJ/CPF do comprador");
    if (comp.contribuinte === "1" && !comp.ie) faltam.push("inscrição estadual do comprador");
    for (const [c, r] of [["endereco", "endereço"], ["bairro", "bairro"], ["municipio", "município"], ["uf", "UF"]]) {
      if (!comp[c]) faltam.push(`${r} do comprador`);
    }
  }
  if (!cultura) faltam.push("cultura da venda");
  else if (so(cultura.ncm).length !== 8) faltam.push(`NCM da cultura ${cultura.nome} (8 números, no cadastro de Culturas)`);
  if (faltam.length) throw new ErroBling(`Falta preencher: ${faltam.join("; ")}.`);

  // Quantidade da nota = a da venda menos o desconto em kg (umidade, impureza).
  const kgUn = KG[venda.unidade];
  const quantidade = kgUn ? n(venda.quantidade) - n(venda.desconto_kg) / kgUn : n(venda.quantidade);
  const pesoKg = venda.peso_liquido ? n(venda.peso_liquido) - n(venda.desconto_kg) : null;
  if (quantidade <= 0) throw new ErroBling("A quantidade da venda está zerada.");

  const documento = so(comp.documento);
  const placa = String(venda.placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const descricao = [cultura.nome, venda.classificacao].filter(Boolean).join(" - ").toUpperCase();

  // Quem paga o frete: caminhão da fazenda = próprio do remetente (3);
  // frete cobrado do comprador = por conta do remetente (0); senão o
  // comprador busca (1, FOB).
  const fretePorConta = venda.caminhao_id ? 3 : n(venda.frete_cobrado) ? 0 : 1;

  const obs = [
    observacoes,
    venda.vencimento && `Vencimento: ${dataBR(venda.vencimento)}`,
  ].filter(Boolean).join("\n");

  return {
    tipo: 1,
    dataOperacao: agoraBrasilia(),
    finalidade: 1,
    naturezaOperacao: { id: naturezaId },
    contato: {
      nome: comp.razao_social || comp.nome,
      tipoPessoa: comp.tipo_pessoa || (documento.length === 14 ? "J" : "F"),
      numeroDocumento: documento,
      contribuinte: Number(comp.contribuinte) || 9,
      ...(comp.contribuinte === "1" ? { ie: so(comp.ie) } : {}),
      ...(comp.email ? { email: comp.email } : {}),
      ...(comp.telefone ? { telefone: comp.telefone } : {}),
      endereco: {
        endereco: comp.endereco, numero: comp.numero || "S/N", complemento: comp.complemento ?? "",
        bairro: comp.bairro, cep: so(comp.cep), municipio: comp.municipio, uf: comp.uf, pais: "Brasil",
      },
    },
    itens: [{
      codigo: cultura.codigo_nf || cultura.nome.toUpperCase(),
      descricao,
      unidade: UNIDADE_NF[venda.unidade] ?? "UN",
      quantidade: +quantidade.toFixed(4),
      valor: n(venda.preco_unitario),
      tipo: "P",
      origem: 0,
      classificacaoFiscal: so(cultura.ncm),
      ...(pesoKg ? { pesoBruto: pesoKg, pesoLiquido: pesoKg } : {}),
    }],
    transporte: {
      fretePorConta,
      ...(n(venda.frete_cobrado) ? { frete: n(venda.frete_cobrado) } : {}),
      ...(placa.length === 7 ? { veiculo: { placa } } : {}),
      ...(pesoKg ? { volume: { quantidade: n(venda.volumes) || 1, pesoBruto: pesoKg, pesoLiquido: pesoKg } } : {}),
    },
    ...(obs ? { observacoes: obs } : {}),
  };
}

/** Lê a nota no Bling e guarda o que interessa em notas_fiscais. */
async function atualizarRegistro(venda: Qualquer, blingId: number, mensagem: string | null) {
  const { data: nf } = await bling("GET", `/nfe/${blingId}`);
  const registro = {
    venda_id: venda.id,
    // Nota ainda não emitida vem com a data zerada.
    data: (/^[1-9]/.test(String(nf.dataEmissao ?? "")) ? String(nf.dataEmissao) : agoraBrasilia()).slice(0, 10),
    comprador: nf.contato?.nome ?? venda.comprador,
    bling_id: blingId,
    numero: nf.numero ? String(nf.numero) : null,
    serie: nf.serie != null ? String(nf.serie) : null,
    situacao: nf.situacao ?? null,
    chave_acesso: nf.chaveAcesso || null,
    link_danfe: nf.linkDanfe || nf.linkPDF || null,
    valor: nf.valorNota ?? null,
    mensagem,
    atualizado_em: new Date().toISOString(),
  };
  const { data, error } = await admin.from("notas_fiscais")
    .upsert(registro, { onConflict: "venda_id" }).select().single();
  if (error) throw new ErroBling(`A nota foi para o Bling, mas não consegui guardar no sistema: ${error.message}`);
  return data;
}

const AUTORIZADA = [5, 6, 7];
const ESPERANDO_SEFAZ = [3, 8, 10];

async function emitir(vendaId: string, naturezaPedida: number | null, observacoes: string) {
  const { data: venda } = await admin.from("vendas").select("*").eq("id", vendaId).maybeSingle();
  if (!venda) throw new ErroBling("Esta venda ainda não chegou na nuvem. Espere sincronizar (ícone no topo) e tente de novo.");

  const { data: anterior } = await admin.from("notas_fiscais").select("*").eq("venda_id", vendaId).maybeSingle();
  if (anterior && AUTORIZADA.includes(Number(anterior.situacao))) {
    throw new ErroBling(`Esta venda já tem a NF-e nº ${anterior.numero} autorizada.`);
  }
  if (anterior && ESPERANDO_SEFAZ.includes(Number(anterior.situacao))) {
    return atualizarRegistro(venda, anterior.bling_id, "Ainda aguardando a SEFAZ.");
  }

  const conexao = await lerConexao();
  const naturezaId = naturezaPedida || conexao?.natureza_id;
  if (!naturezaId) throw new ErroBling("Escolha a natureza de operação (na aba Notas fiscais).");

  const corpo = await montarNota(venda, Number(naturezaId), observacoes);

  // Nota que ficou pendente ou foi rejeitada: corrige a mesma no Bling em vez
  // de criar outra (cancelada ou denegada não volta: cria uma nova).
  let blingId: number;
  if (anterior?.bling_id && [1, 4].includes(Number(anterior.situacao))) {
    blingId = Number(anterior.bling_id);
    await bling("PUT", `/nfe/${blingId}`, corpo);
  } else {
    const { data } = await bling("POST", "/nfe", corpo);
    blingId = data.id;
  }

  let mensagem: string | null = null;
  try {
    await bling("POST", `/nfe/${blingId}/enviar`);
  } catch (e) {
    // Rejeição da SEFAZ: a nota fica no Bling para corrigir e enviar de novo.
    mensagem = String((e as Error).message);
  }
  return atualizarRegistro(venda, blingId, mensagem);
}

async function consultar(vendaId: string) {
  const { data: anterior } = await admin.from("notas_fiscais").select("*").eq("venda_id", vendaId).maybeSingle();
  if (!anterior?.bling_id) throw new ErroBling("Esta venda ainda não tem nota no Bling.");
  return atualizarRegistro({ id: vendaId, comprador: anterior.comprador }, anterior.bling_id, anterior.mensagem);
}

// ─── Entrada ────────────────────────────────────────────────────────────────

async function voltaDoBling(url: URL) {
  const code = url.searchParams.get("code");
  const estado = url.searchParams.get("state");
  if (!code) return texto("O Bling não mandou a autorização. Volte ao sistema e clique em “Conectar ao Bling” de novo.", 400);
  const c = await lerConexao();
  if (!c?.estado || c.estado !== estado) {
    return texto("Este link de autorização não é válido (ou já foi usado). Volte ao sistema e clique em “Conectar ao Bling” de novo.", 400);
  }
  try {
    await pedirToken({ grant_type: "authorization_code", code });
  } catch (e) {
    return texto(`Não deu para conectar: ${(e as Error).message}`, 400);
  }
  return texto("Pronto! O sistema da Fazenda Carvalho Cruz está conectado ao Bling.\n\nPode fechar esta aba e voltar ao sistema.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!clientId() || !clientSecret()) {
    return json({ erro: "Faltam as chaves do aplicativo do Bling no Supabase (BLING_CLIENT_ID e BLING_CLIENT_SECRET)." }, 500);
  }

  // O Bling volta para cá (GET) depois que alguém autoriza.
  if (req.method === "GET") return voltaDoBling(new URL(req.url));

  // Daqui em diante, só quem está logado no app.
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: quem } = await admin.auth.getUser(jwt);
  if (!quem?.user) return json({ erro: "Entre no sistema de novo (login vencido)." }, 401);

  const corpo = await req.json().catch(() => ({}));
  try {
    switch (corpo.acao) {
      case "situacao": {
        const c = await lerConexao();
        return json({ conectado: Boolean(c?.refresh_token), natureza_id: c?.natureza_id ?? null, natureza_nome: c?.natureza_nome ?? null });
      }
      case "link": {
        const estado = crypto.randomUUID();
        await gravarConexao({ estado });
        const u = new URL(`${OAUTH}/authorize`);
        u.searchParams.set("response_type", "code");
        u.searchParams.set("client_id", clientId());
        u.searchParams.set("state", estado);
        return json({ url: u.toString() });
      }
      case "naturezas": {
        const { data } = await bling("GET", "/naturezas-operacoes?limite=100");
        return json({ naturezas: (data ?? []).map((x: Qualquer) => ({ id: x.id, descricao: x.descricao, padrao: x.padrao })) });
      }
      case "configurar": {
        await gravarConexao({ natureza_id: corpo.natureza_id ?? null, natureza_nome: corpo.natureza_nome ?? null });
        return json({ ok: true });
      }
      case "emitir":
        if (!corpo.venda_id) return json({ erro: "Informe a venda." }, 400);
        return json({ nota: await emitir(corpo.venda_id, corpo.natureza_id ?? null, String(corpo.observacoes ?? "").trim()) });
      case "consultar":
        if (!corpo.venda_id) return json({ erro: "Informe a venda." }, 400);
        return json({ nota: await consultar(corpo.venda_id) });
      default:
        return json({ erro: "Ação desconhecida." }, 400);
    }
  } catch (e) {
    // Erro esperado (cadastro incompleto, rejeição): 200 com `erro`, para o
    // app mostrar a mensagem como veio.
    if (e instanceof ErroBling) return json({ erro: e.message });
    return json({ erro: `Falha inesperada: ${(e as Error).message}` }, 500);
  }
});
