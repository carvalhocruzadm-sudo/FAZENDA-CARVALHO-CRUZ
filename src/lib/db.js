/**
 * Camada IndexedDB — o banco local que deixa o app funcionar sem internet
 * (no campo, no curral, na estrada).
 *
 * Stores:
 *   uma por coleção do esquema (culturas, talhoes, maquinas, …) → cópia local
 *   fila  → operações pendentes de envio para o Supabase, em ordem
 *   meta  → chaves de controle (última sincronização)
 *   fotos → as fotos (chave = caminho no Storage): as tiradas aqui esperando
 *           envio e as já baixadas, para aparecerem sem internet
 *   arquivos → comprovantes salvos no aparelho esperando subir para a nuvem
 *              (chave = caminho do arquivo; ver lib/arquivos.js)
 */

import { COLECOES } from "./esquema";

export { COLECOES };

const DB_NOME = "fazenda-carvalho-cruz";
// Suba a versão sempre que uma coleção nova entrar no esquema: é no upgrade
// que a store dela é criada.
const DB_VERSAO = 6;

const STORES = [...COLECOES, "fila", "meta", "fotos", "arquivos"];

let promessaDB = null;

export function abrirDB() {
  if (promessaDB) return promessaDB;

  promessaDB = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível neste navegador"));
      return;
    }

    const req = indexedDB.open(DB_NOME, DB_VERSAO);

    req.onupgradeneeded = () => {
      const db = req.result;
      for (const nome of COLECOES) {
        if (!db.objectStoreNames.contains(nome)) {
          db.createObjectStore(nome, { keyPath: "id" });
        }
      }
      if (!db.objectStoreNames.contains("fila")) {
        // autoIncrement garante o processamento em ordem cronológica (FIFO)
        db.createObjectStore("fila", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
      }
      if (!db.objectStoreNames.contains("fotos")) {
        db.createObjectStore("fotos");
      }
      if (!db.objectStoreNames.contains("arquivos")) {
        db.createObjectStore("arquivos");
      }
    };

    req.onsuccess = () => {
      // Outra aba pediu uma versão mais nova: fecha esta conexão para não
      // travar a atualização dela.
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);

    // Acontece quando o app está aberto em outra aba numa versão anterior do
    // banco: sem isto, a promessa nunca resolve e a tela fica em "carregando".
    req.onblocked = () =>
      reject(
        new Error(
          "O app está aberto em outra aba com uma versão antiga. Feche as demais abas e recarregue."
        )
      );
  });

  return promessaDB;
}

function transacao(db, stores, modo) {
  const tx = db.transaction(stores, modo);
  const concluida = new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return { tx, concluida };
}

function pedido(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Coleções ───────────────────────────────────────────────────────────────

export async function lerColecao(store) {
  const db = await abrirDB();
  const { tx } = transacao(db, [store], "readonly");
  return pedido(tx.objectStore(store).getAll());
}

export async function lerTodasColecoes() {
  const entradas = await Promise.all(
    COLECOES.map(async (nome) => [nome, await lerColecao(nome)])
  );
  return Object.fromEntries(entradas);
}

/** Substitui todo o conteúdo de uma store (usado depois de puxar da nuvem). */
export async function gravarColecao(store, itens) {
  const db = await abrirDB();
  const { tx, concluida } = transacao(db, [store], "readwrite");
  const os = tx.objectStore(store);
  os.clear();
  for (const item of itens) os.put(item);
  await concluida;
}

export async function gravarTodasColecoes(dados) {
  for (const nome of COLECOES) {
    if (Array.isArray(dados[nome])) await gravarColecao(nome, dados[nome]);
  }
}

export async function contarTudo() {
  const db = await abrirDB();
  const { tx } = transacao(db, COLECOES, "readonly");
  const totais = await Promise.all(
    COLECOES.map((nome) => pedido(tx.objectStore(nome).count()))
  );
  return totais.reduce((soma, n) => soma + n, 0);
}

// ─── Fila de sincronização ──────────────────────────────────────────────────

export const MAX_TENTATIVAS = 5;

/**
 * @param {{ tabela: string, acao: "upsert"|"delete", payload: object }} op
 */
export async function enfileirar(op) {
  const db = await abrirDB();
  const { tx, concluida } = transacao(db, ["fila"], "readwrite");
  tx.objectStore("fila").add({
    ...op,
    tentativas: 0,
    erro: null,
    criadoEm: new Date().toISOString(),
  });
  await concluida;
}

export async function enfileirarVarias(ops) {
  if (!ops.length) return;
  const db = await abrirDB();
  const { tx, concluida } = transacao(db, ["fila"], "readwrite");
  const os = tx.objectStore("fila");
  const agora = new Date().toISOString();
  for (const op of ops) {
    os.add({ ...op, tentativas: 0, erro: null, criadoEm: agora });
  }
  await concluida;
}

/** Fila completa, em ordem de criação. */
export async function lerFila() {
  const db = await abrirDB();
  const { tx } = transacao(db, ["fila"], "readonly");
  const itens = await pedido(tx.objectStore("fila").getAll());
  return itens.sort((a, b) => a.id - b.id);
}

export async function atualizarOp(op) {
  const db = await abrirDB();
  const { tx, concluida } = transacao(db, ["fila"], "readwrite");
  tx.objectStore("fila").put(op);
  await concluida;
}

export async function apagarOp(id) {
  const db = await abrirDB();
  const { tx, concluida } = transacao(db, ["fila"], "readwrite");
  tx.objectStore("fila").delete(id);
  await concluida;
}

/** Zera o contador de tentativas das operações que falharam definitivamente. */
export async function reativarFalhas() {
  const fila = await lerFila();
  const falhas = fila.filter((op) => op.tentativas >= MAX_TENTATIVAS);
  for (const op of falhas) {
    await atualizarOp({ ...op, tentativas: 0, erro: null });
  }
  return falhas.length;
}

// ─── Meta ───────────────────────────────────────────────────────────────────

export async function lerMeta(chave) {
  const db = await abrirDB();
  const { tx } = transacao(db, ["meta"], "readonly");
  return pedido(tx.objectStore("meta").get(chave));
}

export async function gravarMeta(chave, valor) {
  const db = await abrirDB();
  const { tx, concluida } = transacao(db, ["meta"], "readwrite");
  tx.objectStore("meta").put(valor, chave);
  await concluida;
}

/** Apaga tudo o que está no aparelho (usado em "recarregar da nuvem"). */
export async function limparLocal() {
  const db = await abrirDB();
  const { tx, concluida } = transacao(db, STORES, "readwrite");
  for (const nome of STORES) tx.objectStore(nome).clear();
  await concluida;
}

/** Grava (ou substitui) um registro só. */
export async function gravarItem(store, item) {
  const db = await abrirDB();
  const { tx, concluida } = transacao(db, [store], "readwrite");
  tx.objectStore(store).put(item);
  await concluida;
}

export async function apagarItem(store, id) {
  const db = await abrirDB();
  const { tx, concluida } = transacao(db, [store], "readwrite");
  tx.objectStore(store).delete(id);
  await concluida;
}

// ─── Fotos ──────────────────────────────────────────────────────────────────

/** @returns {Promise<{ blob: Blob, pendente: boolean } | undefined>} */
export async function lerFoto(caminho) {
  const db = await abrirDB();
  const { tx } = transacao(db, ["fotos"], "readonly");
  return pedido(tx.objectStore("fotos").get(caminho));
}

export async function gravarFoto(caminho, foto) {
  const db = await abrirDB();
  const { tx, concluida } = transacao(db, ["fotos"], "readwrite");
  tx.objectStore("fotos").put(foto, caminho);
  await concluida;
}

// ─── Arquivos (comprovantes) ────────────────────────────────────────────────

/** @param {{ arquivo: Blob, tipo: string }} valor */
export async function gravarArquivo(caminho, valor) {
  const db = await abrirDB();
  const { tx, concluida } = transacao(db, ["arquivos"], "readwrite");
  tx.objectStore("arquivos").put(valor, caminho);
  await concluida;
}

export async function lerArquivo(caminho) {
  const db = await abrirDB();
  const { tx } = transacao(db, ["arquivos"], "readonly");
  return pedido(tx.objectStore("arquivos").get(caminho));
}

export async function apagarArquivo(caminho) {
  const db = await abrirDB();
  const { tx, concluida } = transacao(db, ["arquivos"], "readwrite");
  tx.objectStore("arquivos").delete(caminho);
  await concluida;
}
