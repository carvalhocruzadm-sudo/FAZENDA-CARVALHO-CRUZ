/**
 * Arquivos anexados aos lançamentos (o comprovante de uma despesa).
 *
 * O registro guarda só o caminho do arquivo (ex.: "despesas/2026-09/<id>.pdf").
 * O arquivo em si:
 *   1. enquanto o formulário está aberto → fica na memória (`emEspera`);
 *   2. ao salvar → vai para o IndexedDB (store "arquivos") e entra na fila
 *      uma operação "upload", ANTES do registro que aponta para ele;
 *   3. na sincronização → sobe para o Storage do Supabase (bucket
 *      "comprovantes") e sai do aparelho.
 * Assim dá para lançar o comprovante sem internet, como qualquer outra coisa.
 */

import { lerArquivo } from "./db";
import { supabase, supabaseConfigurado } from "./supabase";

export const BUCKET = "comprovantes";

/** Arquivos escolhidos num formulário que ainda não foi salvo. */
const emEspera = new Map();

const EXTENSOES = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };

function extensao(arquivo) {
  if (EXTENSOES[arquivo.type]) return EXTENSOES[arquivo.type];
  const m = /\.([a-z0-9]{1,5})$/i.exec(arquivo.name ?? "");
  return m ? m[1].toLowerCase() : "bin";
}

function idAleatorio() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Reserva um caminho para o arquivo e o deixa esperando o "Salvar". */
export function anexar(colecao, arquivo) {
  const caminho = `${colecao}/${new Date().toISOString().slice(0, 7)}/${idAleatorio()}.${extensao(arquivo)}`;
  emEspera.set(caminho, arquivo);
  return caminho;
}

/** Tira da memória o que o formulário ia salvar (usado pelo useDados). */
export function retirarEmEspera(caminho) {
  const arquivo = emEspera.get(caminho);
  emEspera.delete(caminho);
  return arquivo ?? null;
}

export function ehPdf(caminho) {
  return /\.pdf$/i.test(caminho ?? "");
}

/**
 * Endereço para abrir o arquivo na tela: da memória, do aparelho (ainda não
 * enviado) ou da nuvem (link temporário de 1 hora).
 */
export async function enderecoDoArquivo(caminho) {
  const naMemoria = emEspera.get(caminho);
  if (naMemoria) return URL.createObjectURL(naMemoria);
  const local = await lerArquivo(caminho);
  if (local?.arquivo) return URL.createObjectURL(local.arquivo);
  if (!supabaseConfigurado) throw new Error("Arquivo não encontrado neste aparelho.");
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 3600);
  if (error) throw new Error(`Não foi possível abrir o comprovante: ${error.message}`);
  return data.signedUrl;
}

/**
 * Tenta ler o valor em R$ de um texto compartilhado junto com o comprovante
 * ("Comprovante de Pix — R$ 1.234,56 para Fulano"). Devolve null se não achar.
 */
export function valorDoTexto(texto) {
  const m = /R\$\s*([\d.]+,\d{2})/.exec(texto ?? "");
  return m ? Number(m[1].replace(/\./g, "").replace(",", ".")) : null;
}

// ─── O que chegou pelo "Compartilhar" do celular ───────────────────────────

// Mesmos nomes usados em public/compartilhar-sw.js.
const CACHE_COMPARTILHADO = "fcc-compartilhado";
const CHAVE_COMPARTILHADO = "/__compartilhado__";

/**
 * O service worker recebe o comprovante enviado pelo app do banco e o deixa
 * guardado; aqui ele é lido (uma vez só) para abrir o lançamento.
 * @returns {Promise<{ arquivo: File|null, texto: string } | null>}
 */
export async function lerCompartilhado() {
  if (typeof caches === "undefined") return null;
  const cache = await caches.open(CACHE_COMPARTILHADO);
  const resp = await cache.match(CHAVE_COMPARTILHADO);
  if (!resp) return null;
  await cache.delete(CHAVE_COMPARTILHADO);
  const form = await resp.formData();
  const arquivo = form.get("comprovante");
  const texto = [form.get("titulo"), form.get("texto"), form.get("link")].filter(Boolean).join(" ").trim();
  return { arquivo: arquivo instanceof File && arquivo.size ? arquivo : null, texto };
}

// ─── Caixa de entrada (o que chega pelo Atalho do iPhone) ──────────────────
//
// O iPhone não deixa o app aparecer no "Compartilhar", então quem manda é um
// Atalho (app Atalhos) que faz um POST para api/comprovante.js. O arquivo cai
// na pasta caixa/ do bucket e espera aqui até virar despesa (a despesa passa a
// apontar para ele) ou ser descartado. Precisa de internet.

/** Comprovantes da caixa que nenhuma despesa usa ainda, o mais novo primeiro: `[{ caminho, criadoEm }]`. */
export async function listarCaixa(despesas) {
  if (!supabaseConfigurado) return [];
  const { data, error } = await supabase.storage.from(BUCKET)
    .list("caixa", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  if (error) throw new Error(`Não deu para ver os comprovantes recebidos: ${error.message}`);
  const usados = new Set((despesas ?? []).map((d) => d.comprovante).filter(Boolean));
  return (data ?? [])
    .filter((f) => f.name && !f.name.startsWith("."))
    .map((f) => ({ caminho: `caixa/${f.name}`, criadoEm: f.created_at }))
    .filter((f) => !usados.has(f.caminho));
}

/** Tira da caixa um comprovante que não vai virar despesa. */
export async function descartarDaCaixa(caminho) {
  const { error } = await supabase.storage.from(BUCKET).remove([caminho]);
  if (error) throw new Error(`Não deu para descartar: ${error.message}`);
}

/** Texto do PDF (camada de texto); vazio se for escaneado ou der erro. */
async function textoDoPdf(blob) {
  try {
    const [pdfjs, { default: workerUrl }] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const partes = [];
    for (let n = 1; n <= Math.min(doc.numPages, 3); n++) {
      const { items } = await (await doc.getPage(n)).getTextContent();
      partes.push(items.map((i) => i.str).join(" "));
    }
    return partes.join(" ");
  } catch {
    return "";
  }
}

const paraBase64 = (blob) => new Promise((resolve, reject) => {
  const leitor = new FileReader();
  leitor.onload = () => resolve(String(leitor.result).split(",")[1]);
  leitor.onerror = () => reject(new Error("Não foi possível abrir o comprovante."));
  leitor.readAsDataURL(blob);
});

/** Manda o comprovante para a IA do Google (função ler-comprovante no Supabase). */
async function lerComIA(blob, tipo) {
  const { data, error } = await supabase.functions.invoke("ler-comprovante", { body: { arquivo: await paraBase64(blob), tipo } });
  if (error) {
    // A função devolve { erro } mesmo quando falha: mostra essa mensagem, que é a que explica.
    const status = error.context?.status;
    const corpo = await error.context?.json?.().catch(() => null);
    if (status === 404) throw new Error("a função ler-comprovante ainda não foi publicada no Supabase");
    throw new Error(corpo?.erro ?? corpo?.message ?? (status ? `${error.message} (${status})` : error.message));
  }
  if (data?.erro) throw new Error(data.erro);
  const c = data?.comprovante ?? {};
  const valor = typeof c.valor === "number" ? c.valor : Number(String(c.valor ?? "").replace(/\./g, "").replace(",", "."));
  return {
    valor: Number.isFinite(valor) && valor > 0 ? valor : null,
    data: /^\d{4}-\d{2}-\d{2}$/.test(String(c.data ?? "")) ? c.data : null,
    favorecido: String(c.favorecido ?? "").trim() || null,
  };
}

/**
 * Lê valor, data e favorecido do comprovante (Blob/File). O PDF com texto é
 * lido no próprio aparelho; foto, print, PDF escaneado — ou o que faltou —
 * vão para a IA do Google. Nunca dá erro: o que não leu volta `null`, e
 * `aviso` explica quando a IA não respondeu.
 */
export async function lerComprovanteDoArquivo(blob, nome = "") {
  const pdf = blob.type === "application/pdf" || /\.pdf$/i.test(nome);
  let lido = { valor: null, data: null, favorecido: null };
  if (pdf) {
    const { interpretarComprovante } = await import("./comprovanteTexto");
    lido = interpretarComprovante(await textoDoPdf(blob));
    if (lido.valor && lido.favorecido) return lido;
  }
  if (!supabaseConfigurado) return lido;
  try {
    const ia = await lerComIA(blob, pdf ? "application/pdf" : blob.type || "image/jpeg");
    return { valor: lido.valor ?? ia.valor, data: lido.data ?? ia.data, favorecido: lido.favorecido ?? ia.favorecido };
  } catch (e) {
    return { ...lido, aviso: `Não consegui ler o comprovante sozinho (${e.message}). Digite o valor e o favorecido.` };
  }
}

/** O mesmo, para um comprovante que já está na nuvem (caixa de entrada). */
export async function lerComprovante(caminho) {
  try {
    const resposta = await fetch(await enderecoDoArquivo(caminho));
    if (!resposta.ok) throw new Error(`erro ${resposta.status} ao baixar`);
    return await lerComprovanteDoArquivo(await resposta.blob(), caminho);
  } catch (e) {
    return { valor: null, data: null, favorecido: null, aviso: `Não consegui abrir o comprovante para ler (${e.message}).` };
  }
}

/** Data (AAAA-MM-DD, no fuso do aparelho) em que o comprovante chegou. */
export const diaQueChegou = (criadoEm) => (criadoEm ? new Date(criadoEm).toLocaleDateString("sv-SE") : null);

/** O que a tela "Lançar comprovante" recebe a partir de um item da caixa (ela mesma lê o arquivo). */
export const daCaixa = (item) => ({ arquivo: null, texto: "", caminho: item.caminho, dataChegada: diaQueChegou(item.criadoEm) });
