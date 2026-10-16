/**
 * Notificação no celular pelo app ntfy (https://ntfy.sh).
 *
 * Quem quer receber instala o app ntfy no celular e assina o tópico que está em
 * VITE_NTFY_TOPICO. Cada lançamento do celular de campo manda uma mensagem
 * para esse tópico.
 *
 * O campo nem sempre tem internet: a mensagem entra numa fila guardada no
 * próprio aparelho (localStorage) e sai assim que a conexão voltar.
 *
 * Um lançamento pode gravar vários registros de uma vez (abastecimento +
 * horímetro de cada talhão, ticket repartido entre turmas): o envio espera um
 * instante e junta numa notificação só o que é da mesma pessoa.
 */

const SERVIDOR = String(import.meta.env.VITE_NTFY_SERVIDOR || "https://ntfy.sh").trim().replace(/\/+$/, "");
export const TOPICO_NTFY = String(import.meta.env.VITE_NTFY_TOPICO ?? "").trim();
export const ntfyConfigurado = Boolean(TOPICO_NTFY);
export const enderecoNtfy = `${SERVIDOR}/${TOPICO_NTFY}`;

const CHAVE_FILA = "fcc-fila-ntfy";
// Mensagem velha demais já não ajuda ninguém: depois de 3 dias, descarta.
const VALIDADE_MS = 3 * 24 * 60 * 60 * 1000;
const ESPERA_MS = 2000;

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

/** Junta as mensagens vizinhas da mesma pessoa numa só. */
function juntar(fila) {
  const grupos = [];
  for (const m of fila) {
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo[0].quem === m.quem) ultimo.push(m);
    else grupos.push([m]);
  }
  return grupos.map((g) => (g.length === 1 ? { msg: g[0], n: 1 } : {
    n: g.length,
    msg: {
      titulo: `${g[0].quem}: ${g.length} lançamentos`,
      mensagem: g.map((m) => `• ${m.linha ?? m.mensagem}`).join("\n"),
      tags: g.some((m) => m.tags?.includes("receipt")) ? ["receipt"] : g[0].tags,
      prioridade: Math.max(...g.map((m) => m.prioridade ?? 3)),
    },
  }));
}

let enviando = false;
let agendado = null;

/** Tenta mandar tudo o que está na fila. Para no primeiro erro (provavelmente sem internet). */
export async function esvaziarFilaNtfy() {
  if (!ntfyConfigurado || enviando) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  enviando = true;
  try {
    const agora = Date.now();
    let fila = lerFila().filter((m) => agora - m.criado < VALIDADE_MS);
    gravarFila(fila);
    for (const { msg, n } of juntar(fila)) {
      await publicar(msg);
      // Relê: pode ter entrado mensagem nova enquanto esta ia.
      fila = lerFila().slice(n);
      gravarFila(fila);
    }
  } catch {
    // Fica na fila para a próxima tentativa.
  } finally {
    enviando = false;
  }
}

/** Põe a mensagem na fila e envia daqui a pouco (junto com as que vierem logo atrás). */
export function notificarNtfy(msg) {
  if (!ntfyConfigurado) return;
  gravarFila([...lerFila(), { ...msg, criado: Date.now() }]);
  clearTimeout(agendado);
  agendado = setTimeout(esvaziarFilaNtfy, ESPERA_MS);
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
