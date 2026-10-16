/**
 * Notificação no celular pelo app ntfy (https://ntfy.sh).
 *
 * Quem quer receber instala o app ntfy no celular e assina o tópico que está em
 * VITE_NTFY_TOPICO. Cada lançamento do celular de campo manda uma mensagem
 * para esse tópico.
 *
 * O campo nem sempre tem internet: a mensagem entra numa fila guardada no
 * próprio aparelho (localStorage) e sai assim que a conexão voltar.
 */

const SERVIDOR = String(import.meta.env.VITE_NTFY_SERVIDOR || "https://ntfy.sh").trim().replace(/\/+$/, "");
export const TOPICO_NTFY = String(import.meta.env.VITE_NTFY_TOPICO ?? "").trim();
export const ntfyConfigurado = Boolean(TOPICO_NTFY);
export const enderecoNtfy = `${SERVIDOR}/${TOPICO_NTFY}`;

const CHAVE_FILA = "fcc-fila-ntfy";
// Mensagem velha demais já não ajuda ninguém: depois de 3 dias, descarta.
const VALIDADE_MS = 3 * 24 * 60 * 60 * 1000;

function lerFila() {
  try { return JSON.parse(localStorage.getItem(CHAVE_FILA)) || []; } catch { return []; }
}

function gravarFila(fila) {
  try { localStorage.setItem(CHAVE_FILA, JSON.stringify(fila)); } catch { /* sem armazenamento: tenta só agora */ }
}

async function publicar({ titulo, mensagem, tags, prioridade }) {
  // Publicação em JSON: aceita acento e emoji no título (cabeçalho HTTP não aceita).
  const resp = await fetch(SERVIDOR, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic: TOPICO_NTFY, title: titulo, message: mensagem, tags, priority: prioridade }),
  });
  if (!resp.ok) throw new Error(`ntfy respondeu ${resp.status}`);
}

let enviando = false;

/** Tenta mandar tudo o que está na fila. Para no primeiro erro (provavelmente sem internet). */
export async function esvaziarFilaNtfy() {
  if (!ntfyConfigurado || enviando) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  enviando = true;
  try {
    const agora = Date.now();
    let fila = lerFila().filter((m) => agora - m.criado < VALIDADE_MS);
    while (fila.length) {
      await publicar(fila[0]);
      fila = fila.slice(1);
      gravarFila(fila);
    }
    gravarFila(fila);
  } catch {
    // Fica na fila para a próxima tentativa.
  } finally {
    enviando = false;
  }
}

/** Põe a mensagem na fila e já tenta enviar. */
export function notificarNtfy(msg) {
  if (!ntfyConfigurado) return;
  gravarFila([...lerFila(), { ...msg, criado: Date.now() }]);
  esvaziarFilaNtfy();
}

/** Liga as novas tentativas: quando a internet volta e a cada minuto. */
export function iniciarNtfy() {
  if (!ntfyConfigurado || typeof window === "undefined") return () => {};
  esvaziarFilaNtfy();
  window.addEventListener("online", esvaziarFilaNtfy);
  const timer = setInterval(esvaziarFilaNtfy, 60_000);
  return () => {
    window.removeEventListener("online", esvaziarFilaNtfy);
    clearInterval(timer);
  };
}
