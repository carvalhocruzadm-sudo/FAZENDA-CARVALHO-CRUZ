/**
 * Fotos tiradas no celular (ticket do posto, painel do caminhão, nota).
 *
 * A foto é diminuída no próprio aparelho (lado maior 1280 px, JPEG) — fica
 * com uns 150 KB, ainda dá para ler o ticket — e vira um registro da coleção
 * `fotos`. Grava primeiro no aparelho e entra na mesma fila de envio dos
 * lançamentos, então funciona sem internet. O lançamento guarda só o id.
 *
 * A sincronização geral não baixa as fotos; cada uma é buscada na nuvem
 * quando alguém abre, e fica guardada no aparelho.
 */

import { enfileirar, gravarItem, lerItem, novoId } from "./db";
import { supabase, supabaseConfigurado } from "./supabase";
import { atualizarContadores } from "./sync";

const LADO_MAXIMO = 1280;
const QUALIDADE = 0.72;

function carregarImagem(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível abrir a foto.")); };
    img.src = url;
  });
}

/** Arquivo da câmera → imagem JPEG menor, em texto (data URL). */
export async function comprimirFoto(arquivo) {
  const img = await carregarImagem(arquivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * escala);
  canvas.height = Math.round(img.naturalHeight * escala);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", QUALIDADE);
}

/** Guarda a foto no aparelho, põe na fila de envio e devolve o id. */
export async function guardarFoto(arquivo, origem) {
  const dados = await comprimirFoto(arquivo);
  const item = { id: novoId(), origem: origem ?? null, dados, atualizado_em: new Date().toISOString() };
  await gravarItem("fotos", item);
  await enfileirar({ tabela: "fotos", acao: "upsert", payload: item });
  await atualizarContadores();
  return item.id;
}

const naMemoria = new Map();

/** A imagem (data URL) de uma foto: do aparelho ou, se não tiver, da nuvem. */
export async function lerFoto(id) {
  if (!id) return null;
  if (naMemoria.has(id)) return naMemoria.get(id);
  let dados = (await lerItem("fotos", id))?.dados ?? null;
  if (!dados && supabaseConfigurado && navigator.onLine) {
    const { data, error } = await supabase.from("fotos").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (data) {
      await gravarItem("fotos", data);
      dados = data.dados;
    }
  }
  if (dados) naMemoria.set(id, dados);
  return dados;
}
