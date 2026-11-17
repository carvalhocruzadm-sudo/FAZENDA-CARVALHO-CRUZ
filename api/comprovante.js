// Vercel Function — recebe o comprovante de pagamento que o Atalho do iPhone envia.
//
// Fluxo: no app do banco o usuário toca em Compartilhar → "Enviar comprovante"
// (um Atalho do app Atalhos). O Atalho faz um POST para esta rota com o PDF ou a
// foto no corpo. Aqui o arquivo é guardado na "caixa de entrada" do bucket
// "comprovantes" (pasta caixa/); no app, em Financeiro → Despesas,
// aparece em "Comprovantes recebidos": confere, escolhe a categoria e lança.
// Nada vira despesa sozinho. Mesmo jeito da Distribuidora.
//
// Por que passa por aqui: o Atalho não tem login do Supabase. Ele leva uma senha
// própria (COMPROVANTE_TOKEN) e quem grava no bucket é esta função, com a chave
// service_role — que fica só no servidor (Vercel → Settings → Environment
// Variables, SEM prefixo VITE_), nunca no app nem no Atalho.
//
// Variáveis: COMPROVANTE_TOKEN, SUPABASE_SERVICE_ROLE_KEY e a URL do projeto
// (SUPABASE_URL, ou a VITE_SUPABASE_URL que o app já usa).
//
// POST /api/comprovante   Authorization: Bearer <COMPROVANTE_TOKEN>   corpo = o arquivo

import { timingSafeEqual } from "node:crypto";

// O corpo é o arquivo cru: sem isto a Vercel tenta interpretá-lo como JSON.
export const config = { api: { bodyParser: false } };

const BUCKET = "comprovantes";
// A Vercel recusa corpo acima de 4,5 MB; com folga.
const LIMITE_BYTES = 4_000_000;

const iguais = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

async function lerCorpo(req) {
  const partes = [];
  let total = 0;
  for await (const parte of req) {
    total += parte.length;
    if (total > LIMITE_BYTES) throw Object.assign(new Error("grande"), { codigo: 413 });
    partes.push(parte);
  }
  return Buffer.concat(partes);
}

/** Descobre o tipo pelo começo do arquivo — o Atalho nem sempre manda Content-Type certo. */
function tipoDoArquivo(b) {
  if (b.length > 4 && b.subarray(0, 4).toString("latin1") === "%PDF") return { tipo: "application/pdf", ext: "pdf" };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { tipo: "image/jpeg", ext: "jpg" };
  if (b.length > 8 && b.subarray(1, 4).toString("latin1") === "PNG") return { tipo: "image/png", ext: "png" };
  return null;
}

export default async function handler(req, res) {
  const token = (process.env.COMPROVANTE_TOKEN ?? "").trim();
  const chave = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  // Igual a src/lib/supabase.js: aceita a URL colada com sobras ("/rest/v1/", barra no fim).
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "")
    .trim().replace(/\/+$/, "").replace(/\/(rest|auth)\/v1$/, "");

  // Abrir o endereço no navegador mostra o que falta configurar (sem mostrar
  // nenhuma senha) — para conferir quando o Atalho não entrega.
  if (req.method === "GET") {
    let pasta = "não deu para conferir";
    if (chave && url) {
      try {
        const r = await fetch(`${url}/storage/v1/bucket/${BUCKET}`, { headers: { apikey: chave, Authorization: `Bearer ${chave}` } });
        pasta = r.ok ? "ok" : `não existe ou a chave service_role está errada (${r.status}) — rode o supabase/schema.sql e confira a chave`;
      } catch (erro) {
        pasta = `o endereço do Supabase não respondeu (${String(erro)})`;
      }
    }
    res.status(200).json({
      COMPROVANTE_TOKEN: token ? "ok" : "FALTA",
      SUPABASE_SERVICE_ROLE_KEY: chave ? "ok" : "FALTA",
      endereco_supabase: url || "FALTA",
      pasta_comprovantes: pasta,
    });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não permitido" });
    return;
  }
  if (!token || !chave || !url) {
    res.status(500).json({ erro: "COMPROVANTE_TOKEN, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_URL precisam estar configurados no servidor" });
    return;
  }

  const enviado = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!enviado || !iguais(enviado, token)) {
    res.status(401).json({ erro: "Senha do Atalho incorreta" });
    return;
  }

  let corpo;
  try {
    corpo = await lerCorpo(req);
  } catch (erro) {
    if (erro.codigo === 413) {
      res.status(413).json({ erro: "Arquivo grande demais (máximo 4 MB). No Atalho, converta a imagem para JPEG antes de enviar." });
      return;
    }
    res.status(400).json({ erro: "Não foi possível ler o arquivo enviado" });
    return;
  }

  const tipo = tipoDoArquivo(corpo);
  if (!tipo) {
    res.status(415).json({ erro: "Só PDF, JPEG ou PNG. Se for foto do iPhone (HEIC), converta para JPEG no Atalho." });
    return;
  }

  const caminho = `caixa/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${tipo.ext}`;
  try {
    const resposta = await fetch(`${url}/storage/v1/object/${BUCKET}/${caminho}`, {
      method: "POST",
      headers: { apikey: chave, Authorization: `Bearer ${chave}`, "Content-Type": tipo.tipo },
      body: corpo,
    });
    if (!resposta.ok) {
      res.status(502).json({ erro: "O Supabase recusou o arquivo", detalhe: (await resposta.text()).slice(0, 300) });
      return;
    }
  } catch (erro) {
    res.status(502).json({ erro: "Falha ao falar com o Supabase", detalhe: String(erro) });
    return;
  }

  res.status(200).json({ ok: true, caminho });
}
