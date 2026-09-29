/**
 * Motor de sincronização entre IndexedDB (local) e Supabase (nuvem).
 *
 * Fluxo de uma sincronização:
 *   1. ENVIA a fila local, em ordem de criação (FIFO). A ordem importa:
 *      um talhão criado offline precisa chegar antes da aplicação que o usa.
 *   2. PUXA o estado completo das tabelas e substitui a cópia local.
 *
 * Como o envio acontece antes da leitura, a alteração feita no celular de
 * quem está no campo vence em caso de conflito (last-write-wins do lado local).
 */

import { supabase, supabaseConfigurado } from "./supabase";
import { COLECOES_LEVES, MAX_TENTATIVAS, apagarOp, atualizarOp, gravarMeta, gravarTodasColecoes, lerFila, lerMeta, lerTodasColecoes } from "./db";

const INTERVALO_AUTO_SYNC = 60_000;

let estado = {
  configurado: supabaseConfigurado,
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  sincronizando: false,
  pendentes: 0,
  falhas: 0,
  ultimaSync: null,
  erro: null,
};

const ouvintes = new Set();

export function estadoSync() {
  return estado;
}

export function observarSync(fn) {
  ouvintes.add(fn);
  fn(estado);
  return () => ouvintes.delete(fn);
}

function definirEstado(patch) {
  estado = { ...estado, ...patch };
  for (const fn of ouvintes) fn(estado);
}

export async function atualizarContadores() {
  const fila = await lerFila();
  definirEstado({
    pendentes: fila.filter((op) => op.tentativas < MAX_TENTATIVAS).length,
    falhas: fila.filter((op) => op.tentativas >= MAX_TENTATIVAS).length,
  });
  return fila;
}

// ─── Envio ──────────────────────────────────────────────────────────────────

async function executarOp(op) {
  if (op.acao === "delete") {
    const { error } = await supabase.from(op.tabela).delete().eq("id", op.payload.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from(op.tabela).upsert(op.payload, { onConflict: "id" });
  if (error) throw error;
}

/**
 * Processa a fila. Para no primeiro erro para não furar a ordem — exceto nas
 * operações que já estouraram MAX_TENTATIVAS, que ficam guardadas para
 * inspeção manual na tela de Sincronização e deixam a fila seguir.
 */
export async function enviarFila() {
  const fila = await lerFila();
  let enviadas = 0;

  for (const op of fila) {
    if (op.tentativas >= MAX_TENTATIVAS) continue; // falha permanente: não bloqueia

    try {
      await executarOp(op);
      await apagarOp(op.id);
      enviadas++;
    } catch (err) {
      const tentativas = op.tentativas + 1;
      await atualizarOp({ ...op, tentativas, erro: String(err?.message ?? err) });
      await atualizarContadores();
      // Interrompe esta rodada: a próxima operação pode depender desta.
      throw err;
    }
  }

  await atualizarContadores();
  return enviadas;
}

// ─── Leitura ────────────────────────────────────────────────────────────────

/**
 * Lê as tabelas da nuvem, uma a uma, e devolve o estado local resultante.
 *
 * Uma coleção que falha NÃO derruba as outras e, principalmente, não é
 * sobrescrita com vazio: se a tabela ainda não existe na nuvem — o intervalo
 * entre publicar uma versão nova e rodar o SQL — ou se a leitura falhou por
 * outro motivo, o que está no aparelho continua lá. Apagar a cópia local por
 * causa de uma leitura que não aconteceu seria perder dado de verdade.
 *
 * @returns {Promise<{ dados: object, falhas: string[] }>}
 */
export async function puxar() {
  const buscados = {};
  const falhas = [];

  // As fotos não descem aqui (seriam megabytes a cada minuto): cada uma é
  // baixada quando alguém abre (ver lib/fotos.js).
  for (const colecao of COLECOES_LEVES) {
    const { data, error } = await supabase.from(colecao).select("*");
    if (error) {
      falhas.push(`${colecao}: ${error.message ?? error}`);
      continue;
    }
    buscados[colecao] = data ?? [];
  }

  // Grava só o que realmente veio.
  await gravarTodasColecoes(buscados);

  // O estado devolvido é o banco local depois da gravação: o que chegou da
  // nuvem, mais o que já estava aqui nas coleções que falharam.
  return { dados: await lerTodasColecoes(), falhas };
}

// ─── Sincronização completa ─────────────────────────────────────────────────

let emAndamento = null;

export async function sincronizar() {
  if (!supabaseConfigurado) {
    definirEstado({ erro: null });
    return null;
  }
  if (!estado.online) {
    definirEstado({ erro: "Sem conexão" });
    return null;
  }
  if (emAndamento) return emAndamento;

  definirEstado({ sincronizando: true, erro: null });

  emAndamento = (async () => {
    try {
      await enviarFila();
      const { dados, falhas } = await puxar();
      const agora = new Date().toISOString();
      await gravarMeta("ultimaSync", agora);
      definirEstado({
        ultimaSync: agora,
        // O que deu certo foi gravado; o que falhou continua sendo mostrado,
        // com o nome da tabela, na tela de Sincronização.
        erro: falhas.length ? `Não foi possível ler ${falhas.join(" · ")}` : null,
      });
      return dados;
    } catch (err) {
      definirEstado({ erro: String(err?.message ?? err) });
      await atualizarContadores();
      return null;
    } finally {
      definirEstado({ sincronizando: false });
      emAndamento = null;
    }
  })();

  return emAndamento;
}

// ─── Auto-sync ──────────────────────────────────────────────────────────────

let timer = null;

export function iniciarAutoSync(aoReceberDados) {
  if (typeof window === "undefined") return () => {};

  const rodar = async () => {
    const dados = await sincronizar();
    if (dados && aoReceberDados) aoReceberDados(dados);
  };

  const ficouOnline = () => {
    definirEstado({ online: true });
    rodar();
  };
  const ficouOffline = () => definirEstado({ online: false, erro: null });
  const voltouAoFoco = () => {
    if (document.visibilityState === "visible") rodar();
  };

  window.addEventListener("online", ficouOnline);
  window.addEventListener("offline", ficouOffline);
  document.addEventListener("visibilitychange", voltouAoFoco);
  timer = setInterval(rodar, INTERVALO_AUTO_SYNC);

  lerMeta("ultimaSync").then((v) => v && definirEstado({ ultimaSync: v }));

  return () => {
    window.removeEventListener("online", ficouOnline);
    window.removeEventListener("offline", ficouOffline);
    document.removeEventListener("visibilitychange", voltouAoFoco);
    clearInterval(timer);
  };
}
