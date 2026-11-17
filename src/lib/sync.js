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
 *
 * Se o operador fechar o app antes de terminar, o service worker
 * (public/sync-sw.js) manda a fila sozinho quando tiver sinal (Background
 * Sync, Android/Chrome). Os dois dividem a trava "fcc-fila".
 */

import { anonKey, supabase, supabaseConfigurado, url } from "./supabase";
import { BUCKET } from "./arquivos";
import { enviarFoto } from "./fotos";
import { COLECOES, MAX_TENTATIVAS, apagarArquivo, apagarOps, atualizarOp, gravarMeta, gravarTodasColecoes, lerArquivo, lerFila, lerMeta, lerTodasColecoes } from "./db";

const INTERVALO_AUTO_SYNC = 60_000;
const TAG_FILA = "fcc-fila";

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

// ─── Envio em segundo plano ─────────────────────────────────────────────────

/** Uma fila só por vez, entre o app e o service worker. */
function comTrava(fn) {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(TAG_FILA, fn);
  return fn();
}

/**
 * Pede ao Android para mandar a fila assim que tiver internet, mesmo que o
 * app seja fechado. Onde não existe (iPhone, modo dev) não faz nada: a fila
 * sai na próxima vez que o app abrir.
 */
export async function pedirEnvioEmSegundoPlano() {
  try {
    const registro = await navigator.serviceWorker?.getRegistration();
    await registro?.sync?.register(TAG_FILA);
  } catch { /* sem Background Sync: fica para quando o app abrir */ }
}

/** O service worker não usa o cliente do Supabase: precisa do token à mão. */
function guardarCredenciais(sessao) {
  const valor = sessao?.access_token
    ? { url, chave: anonKey, token: sessao.access_token, expira_em: sessao.expires_at ?? null }
    : null;
  gravarMeta("credenciaisSync", valor).catch(() => {});
}

if (supabaseConfigurado) {
  supabase.auth.onAuthStateChange((_evento, sessao) => guardarCredenciais(sessao));
}

// ─── Envio ──────────────────────────────────────────────────────────────────

const LIMITE_PAYLOAD_GRANDE = 300_000; // caracteres (~300 KB)

// Limites de um lote: quantos registros e quantos caracteres (fotos pesam).
const LOTE_MAX_ITENS = 500;
const LOTE_MAX_TAMANHO = 2_000_000;

function erroDeRede(err) {
  return err instanceof TypeError || /load failed|failed to fetch|network/i.test(String(err?.message ?? err));
}

function tamanhoDoPayload(op) {
  try {
    return JSON.stringify(op.payload).length;
  } catch {
    return 0;
  }
}

async function executarOp(op) {
  if (op.acao === "foto") {
    await enviarFoto(op.payload.id);
    return;
  }
  if (op.acao === "upload") {
    // Comprovante: sobe o arquivo guardado no aparelho e apaga a cópia local.
    const caminho = op.payload.id;
    const local = await lerArquivo(caminho);
    if (!local) return; // já foi enviado numa rodada anterior
    const { error } = await supabase.storage.from(BUCKET)
      .upload(caminho, local.arquivo, { upsert: true, contentType: local.tipo || undefined });
    if (error) throw error;
    await apagarArquivo(caminho);
    return;
  }
  if (op.acao === "delete") {
    const { error } = await supabase.from(op.tabela).delete().eq("id", op.payload.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from(op.tabela).upsert(op.payload, { onConflict: "id" });
  if (error) throw error;
}

/** Envia de uma vez várias operações da mesma tabela e da mesma ação. */
async function executarLote(ops) {
  if (ops.length === 1) return executarOp(ops[0]);
  const { tabela, acao } = ops[0];
  if (acao === "delete") {
    const { error } = await supabase.from(tabela).delete().in("id", ops.map((op) => op.payload.id));
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from(tabela).upsert(ops.map((op) => op.payload), { onConflict: "id" });
  if (error) throw error;
}

/** Chave que diz se duas operações podem ir no mesmo lote. */
function assinatura(op) {
  // Foto e comprovante sobem um por vez (cada um é um arquivo).
  if (op.acao !== "upsert" && op.acao !== "delete") return `sozinho|${op.id}`;
  const campos = op.acao === "delete" ? "" : Object.keys(op.payload).sort().join(",");
  return `${op.tabela}|${op.acao}|${campos}`;
}

/**
 * Junta operações VIZINHAS da mesma tabela, mesma ação e mesmos campos em
 * lotes — assim a ordem da fila é mantida, mas 300 contatos importados viram
 * 1 envio em vez de 300. Um mesmo registro nunca entra duas vezes no lote
 * (o banco recusa isso), e registros com campos diferentes vão separados para
 * que nenhum campo ausente vire "vazio" na nuvem.
 */
function montarLotes(ops) {
  const lotes = [];
  let atual = null;
  for (const op of ops) {
    const tamanho = tamanhoDoPayload(op);
    const cabe =
      atual &&
      atual.assinatura === assinatura(op) &&
      !atual.ids.has(op.payload.id) &&
      atual.ops.length < LOTE_MAX_ITENS &&
      atual.tamanho + tamanho <= LOTE_MAX_TAMANHO;
    if (!cabe) {
      atual = { assinatura: assinatura(op), ops: [], ids: new Set(), tamanho: 0 };
      lotes.push(atual);
    }
    atual.ops.push(op);
    atual.ids.add(op.payload.id);
    atual.tamanho += tamanho;
  }
  return lotes.map((l) => l.ops);
}

/**
 * Processa a fila em lotes. Se um lote falhar, reenvia as operações dele uma a
 * uma para descobrir qual é a problemática; para no primeiro erro para não
 * furar a ordem — exceto nas operações que já estouraram MAX_TENTATIVAS, que
 * ficam guardadas para inspeção manual na tela de Sincronização e deixam a
 * fila seguir.
 */
export function enviarFila() {
  return comTrava(enviarFilaSemTrava);
}

async function enviarFilaSemTrava() {
  const fila = await lerFila();
  const ativas = fila.filter((op) => op.tentativas < MAX_TENTATIVAS); // falha permanente: não bloqueia
  let enviadas = 0;

  for (const lote of montarLotes(ativas)) {
    try {
      await executarLote(lote);
      await apagarOps(lote.map((op) => op.id));
      enviadas += lote.length;
      definirEstado({ pendentes: Math.max(0, estado.pendentes - lote.length) });
      continue;
    } catch (err) {
      if (lote.length === 1) {
        await registrarFalha(lote[0], err);
        throw err;
      }
    }

    // O lote falhou: tenta um por um para achar o culpado.
    for (const op of lote) {
      try {
        await executarOp(op);
        await apagarOps([op.id]);
        enviadas++;
      } catch (err) {
        await registrarFalha(op, err);
        // Interrompe esta rodada: a próxima operação pode depender desta.
        throw err;
      }
    }
  }

  await atualizarContadores();
  return enviadas;
}

async function registrarFalha(op, err) {
  // Sinal fraco ("Load failed" no iPhone, "Failed to fetch" nos outros) não
  // é culpa do lançamento: não gasta tentativa, senão o sinal ruim marca
  // tudo como erro definitivo. Registro muito grande (com fotos) conta,
  // porque pode ser ele mesmo que não passa.
  const soRede = erroDeRede(err) && tamanhoDoPayload(op) < LIMITE_PAYLOAD_GRANDE;
  const tentativas = soRede ? op.tentativas : op.tentativas + 1;
  await atualizarOp({ ...op, tentativas, erro: String(err?.message ?? err) });
  await atualizarContadores();
}

// ─── Leitura ────────────────────────────────────────────────────────────────

// O Supabase devolve no máximo 1000 linhas por pedido: lê em páginas.
const TAMANHO_PAGINA = 1000;

async function lerTabelaInteira(colecao) {
  const linhas = [];
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const { data, error } = await supabase
      .from(colecao)
      .select("*")
      .order("id")
      .range(inicio, inicio + TAMANHO_PAGINA - 1);
    if (error) throw error;
    linhas.push(...(data ?? []));
    if (!data || data.length < TAMANHO_PAGINA) return linhas;
  }
}

/**
 * Lê as tabelas da nuvem, todas ao mesmo tempo, e devolve o estado local
 * resultante.
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

  await Promise.all(
    COLECOES.map(async (colecao) => {
      try {
        buscados[colecao] = await lerTabelaInteira(colecao);
      } catch (error) {
        falhas.push(`${colecao}: ${error?.message ?? error}`);
      }
    })
  );

  // Grava só o que realmente veio.
  await gravarTodasColecoes(buscados);

  // O estado devolvido é o banco local depois da gravação: o que chegou da
  // nuvem, mais o que já estava aqui nas coleções que falharam.
  return { dados: await lerTodasColecoes(), falhas };
}

// ─── Sincronização completa ─────────────────────────────────────────────────

let emAndamento = null;
// Pedido que chegou com outra sincronização no meio: roda de novo no fim, senão
// o que entrou na fila depois que ela começou só sairia na rodada seguinte.
let deNovo = false;

export async function sincronizar() {
  if (!supabaseConfigurado) {
    definirEstado({ erro: null });
    return null;
  }
  if (!estado.online) {
    definirEstado({ erro: "Sem conexão" });
    return null;
  }
  if (emAndamento) {
    deNovo = true;
    return emAndamento;
  }

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
      if (deNovo) {
        deNovo = false;
        sincronizar();
      }
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
  // Saindo do app (botão de início, trocou de app, apagou a tela): tenta
  // mandar já e deixa pedido o envio em segundo plano para o que sobrar.
  const saindo = () => {
    if (!estado.pendentes) return;
    pedirEnvioEmSegundoPlano();
    if (estado.online) enviarFila().then(() => {}, () => {});
  };
  const voltouAoFoco = () => {
    if (document.visibilityState === "visible") rodar();
    else saindo();
  };
  // O service worker mandou a fila com o app aberto em segundo plano.
  const avisoDoServiceWorker = (e) => {
    if (e.data?.tipo === "fcc-fila-enviada") rodar();
  };

  window.addEventListener("online", ficouOnline);
  window.addEventListener("offline", ficouOffline);
  document.addEventListener("visibilitychange", voltouAoFoco);
  window.addEventListener("pagehide", saindo);
  navigator.serviceWorker?.addEventListener("message", avisoDoServiceWorker);
  timer = setInterval(rodar, INTERVALO_AUTO_SYNC);

  lerMeta("ultimaSync").then((v) => v && definirEstado({ ultimaSync: v }));

  return () => {
    window.removeEventListener("online", ficouOnline);
    window.removeEventListener("offline", ficouOffline);
    document.removeEventListener("visibilitychange", voltouAoFoco);
    window.removeEventListener("pagehide", saindo);
    navigator.serviceWorker?.removeEventListener("message", avisoDoServiceWorker);
    clearInterval(timer);
  };
}
