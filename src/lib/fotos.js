/**
 * Fotos: dos funcionários, das máquinas, dos talhões e as de comprovante
 * (painel do horímetro, visor da bomba).
 *
 * O registro guarda só o caminho da foto (ex.: "3f2a….jpg"). A imagem vai
 * para o Storage do Supabase (bucket "fotos") e fica também no aparelho, na
 * store "fotos" do IndexedDB — assim aparece sem internet.
 *
 * Foto tirada sem internet: fica no aparelho marcada como pendente e entra na
 * mesma fila dos lançamentos (acao "foto"), então sobe antes do registro que
 * aponta para ela.
 */

import { enfileirar, gravarFoto, lerFoto } from "./db";
import { supabase, supabaseConfigurado } from "./supabase";

const BUCKET = "fotos";

/** Reduz a foto da câmera (vários MB) para um JPEG leve. */
export async function comprimir(arquivo, lado = 800, qualidade = 0.72) {
  const bmp = await createImageBitmap(arquivo, { imageOrientation: "from-image" })
    .catch(() => createImageBitmap(arquivo));
  const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * escala);
  c.height = Math.round(bmp.height * escala);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("Não foi possível ler a foto."))), "image/jpeg", qualidade));
}

const urls = new Map(); // caminho → object URL já criado
const buscando = new Map(); // caminho → promessa em andamento

function urlDoBlob(caminho, blob) {
  const url = URL.createObjectURL(blob);
  urls.set(caminho, url);
  return url;
}

/** Guarda a foto no aparelho e agenda o envio. Devolve o caminho para o registro. */
export async function salvarFotoNova(arquivo, lado) {
  const blob = await comprimir(arquivo, lado);
  const caminho = `${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}.jpg`;
  await gravarFoto(caminho, { blob, pendente: true });
  await enfileirar({ tabela: BUCKET, acao: "foto", payload: { id: caminho } });
  urlDoBlob(caminho, blob);
  return caminho;
}

/** Endereço para mostrar a foto: do aparelho ou baixada da nuvem (e guardada). */
export function urlDaFoto(caminho) {
  if (!caminho) return Promise.resolve(null);
  if (urls.has(caminho)) return Promise.resolve(urls.get(caminho));
  if (buscando.has(caminho)) return buscando.get(caminho);

  const promessa = (async () => {
    try {
      const local = await lerFoto(caminho);
      if (local?.blob) return urlDoBlob(caminho, local.blob);
      if (!supabaseConfigurado || !navigator.onLine) return null;
      const { data, error } = await supabase.storage.from(BUCKET).download(caminho);
      if (error || !data) return null;
      await gravarFoto(caminho, { blob: data, pendente: false });
      return urlDoBlob(caminho, data);
    } catch {
      return null;
    } finally {
      buscando.delete(caminho);
    }
  })();
  buscando.set(caminho, promessa);
  return promessa;
}

/** Chamado pela sincronização para cada foto na fila. */
export async function enviarFoto(caminho) {
  const foto = await lerFoto(caminho);
  if (!foto?.pendente) return;
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, foto.blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  await gravarFoto(caminho, { ...foto, pendente: false });
}

/** Baixa de uma vez as fotos dos cadastros, para o Modo Campo funcionar sem internet. */
export function guardarFotosDosCadastros(dados) {
  const caminhos = ["funcionarios", "maquinas", "talhoes", "servicos"]
    .flatMap((c) => (dados[c] ?? []).map((x) => x.foto))
    .filter(Boolean);
  for (const c of caminhos) urlDaFoto(c);
}
