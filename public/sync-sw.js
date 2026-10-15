/**
 * Envio da fila em segundo plano (Background Sync), carregado dentro do
 * service worker gerado pelo Workbox (veja `importScripts` no vite.config.js).
 *
 * O operador lança o abastecimento e fecha o app sem esperar o "Sincronizado".
 * O lançamento já está guardado no IndexedDB; aqui o Android manda a fila
 * para o Supabase sozinho — com o app fechado — assim que tiver sinal.
 *
 * Não usa o cliente do Supabase (não roda aqui): fala direto com a API REST,
 * com a URL, a chave e o token que o app deixou em meta → "credenciaisSync".
 * Sem token válido não faz nada: a fila continua guardada e sai na próxima
 * vez que o app for aberto. Nunca renova o token aqui, para não derrubar o
 * login do app.
 *
 * Mesma regra do src/lib/sync.js: em ordem (FIFO), para no primeiro erro e
 * divide a trava "fcc-fila" com o app para os dois nunca enviarem ao mesmo
 * tempo (um mandaria uma versão velha por cima da nova).
 */

const FCC_DB = "fazenda-carvalho-cruz";
const FCC_TAG = "fcc-fila";
const FCC_MAX_TENTATIVAS = 5;

function fccPedido(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function fccAbrirDB() {
  return fccPedido(indexedDB.open(FCC_DB)).then((db) => {
    db.onversionchange = () => db.close();
    return db;
  });
}

function fccComTrava(fn) {
  if (self.navigator && self.navigator.locks) return self.navigator.locks.request(FCC_TAG, fn);
  return fn();
}

async function fccEnviarFila() {
  const db = await fccAbrirDB();
  try {
    if (!db.objectStoreNames.contains("fila") || !db.objectStoreNames.contains("meta")) return;

    const cred = await fccPedido(db.transaction("meta").objectStore("meta").get("credenciaisSync"));
    // Token vencido ou ausente: espera o app abrir (ele renova o login).
    if (!cred || !cred.token || (cred.expira_em && cred.expira_em * 1000 < Date.now() + 30_000)) return;

    const fila = (await fccPedido(db.transaction("fila").objectStore("fila").getAll())).sort((a, b) => a.id - b.id);
    const cabecalho = { apikey: cred.chave, Authorization: `Bearer ${cred.token}` };
    let enviadas = 0;

    for (const op of fila) {
      if (op.tentativas >= FCC_MAX_TENTATIVAS) continue; // falha permanente: fica para a tela de Sincronização
      // Foto e comprovante precisam do app (arquivo guardado, compressão):
      // para aqui, sem furar a ordem, e o resto sai quando o app abrir.
      if (op.acao !== "upsert" && op.acao !== "delete") break;

      const base = `${cred.url}/rest/v1/${encodeURIComponent(op.tabela)}`;
      const resp = op.acao === "delete"
        ? await fetch(`${base}?id=eq.${encodeURIComponent(op.payload.id)}`, { method: "DELETE", headers: cabecalho })
        : await fetch(`${base}?on_conflict=id`, {
          method: "POST",
          headers: { ...cabecalho, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(op.payload),
        });

      // Login recusado: não adianta insistir agora, o app resolve quando abrir.
      if (resp.status === 401 || resp.status === 403) break;
      // Outro erro: interrompe (a próxima pode depender desta) e pede ao
      // navegador para tentar de novo mais tarde.
      if (!resp.ok) throw new Error(`Supabase respondeu ${resp.status} em ${op.tabela}`);

      const tx = db.transaction("fila", "readwrite");
      tx.objectStore("fila").delete(op.id);
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
      enviadas++;
    }

    if (enviadas) {
      // Se o app estiver aberto, ele atualiza o "para enviar" na hora.
      const janelas = await self.clients.matchAll({ includeUncontrolled: true });
      for (const j of janelas) j.postMessage({ tipo: "fcc-fila-enviada", enviadas });
    }
  } finally {
    db.close();
  }
}

self.addEventListener("sync", (evento) => {
  if (evento.tag === FCC_TAG) evento.waitUntil(fccComTrava(fccEnviarFila));
});
