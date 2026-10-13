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

/**
 * Lê valor, data e favorecido do PDF do banco (foto não é lida: aí é digitar).
 * Nunca dá erro: se não leu, volta tudo `null`.
 */
export async function lerComprovante(caminho) {
  const vazio = { valor: null, data: null, favorecido: null };
  if (!ehPdf(caminho)) return vazio;
  try {
    const resposta = await fetch(await enderecoDoArquivo(caminho));
    if (!resposta.ok) return vazio;
    const [pdfjs, { default: workerUrl }, { interpretarComprovante }] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
      import("./comprovanteTexto"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await resposta.arrayBuffer()) }).promise;
    const partes = [];
    for (let n = 1; n <= Math.min(doc.numPages, 3); n++) {
      const { items } = await (await doc.getPage(n)).getTextContent();
      partes.push(items.map((i) => i.str).join(" "));
    }
    return interpretarComprovante(partes.join(" "));
  } catch {
    return vazio;
  }
}

/** Data (AAAA-MM-DD, no fuso do aparelho) em que o comprovante chegou. */
export const diaQueChegou = (criadoEm) => (criadoEm ? new Date(criadoEm).toLocaleDateString("sv-SE") : null);

/** Prepara o que a tela "Lançar comprovante" recebe a partir de um item da caixa. */
export async function daCaixa(item) {
  const lido = await lerComprovante(item.caminho);
  return { arquivo: null, texto: "", caminho: item.caminho, lido: { ...lido, data: lido.data ?? diaQueChegou(item.criadoEm) } };
}
