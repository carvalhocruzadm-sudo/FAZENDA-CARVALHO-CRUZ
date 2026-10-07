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
