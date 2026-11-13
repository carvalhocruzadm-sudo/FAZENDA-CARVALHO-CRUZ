/**
 * Notificações no aparelho para as contas que estão vencendo.
 * Quem manda é o servidor (api/avisar-vencimentos.js), toda manhã; aqui o
 * aparelho só pede a permissão e se inscreve para receber.
 */
import { supabase, supabaseConfigurado } from "./supabase";

const temSuporte = () => supabaseConfigurado && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** No iPhone a notificação só existe com o app instalado na tela de início. */
export const ehIphoneSemInstalar = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches && !navigator.standalone;

function paraBytes(base64url) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function inscricaoAtual() {
  const reg = await navigator.serviceWorker.getRegistration();
  return { reg, insc: reg ? await reg.pushManager.getSubscription() : null };
}

async function guardar(insc) {
  const { endpoint, keys } = insc.toJSON();
  const { error } = await supabase.from("push_inscricoes").upsert({ endpoint, chaves: keys, aparelho: navigator.userAgent.slice(0, 200) }, { onConflict: "endpoint" });
  if (error) throw new Error(`Não consegui registrar o aparelho: ${error.message}. Rode de novo o supabase/schema.sql no Supabase.`);
}

/** "sem-suporte" | "bloqueado" | "ligado" | "desligado" */
export async function situacaoNotificacoes() {
  if (!temSuporte()) return "sem-suporte";
  if (Notification.permission === "denied") return "bloqueado";
  const { insc } = await inscricaoAtual();
  if (!insc || Notification.permission !== "granted") return "desligado";
  // O endereço do aparelho pode mudar com o tempo: confirma no banco a cada abertura.
  guardar(insc).catch(() => {});
  return "ligado";
}

export async function ligarNotificacoes() {
  const { reg } = await inscricaoAtual();
  if (!reg) throw new Error("O app ainda está terminando de instalar. Feche, abra de novo e tente outra vez.");
  if (await Notification.requestPermission() !== "granted") throw new Error("A permissão de notificação não foi dada.");

  const resp = await fetch("/api/push-chave");
  const { chave, erro } = await resp.json().catch(() => ({}));
  if (!chave) throw new Error(erro || "O servidor de notificações ainda não está configurado.");

  const pedir = () => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: paraBytes(chave) });
  let insc;
  try {
    insc = await pedir();
  } catch {
    // Inscrição antiga feita com outra chave: desfaz e pede de novo.
    await (await reg.pushManager.getSubscription())?.unsubscribe();
    insc = await pedir();
  }
  await guardar(insc);
}

export async function desligarNotificacoes() {
  const { insc } = await inscricaoAtual();
  if (!insc) return;
  await supabase.from("push_inscricoes").delete().eq("endpoint", insc.endpoint);
  await insc.unsubscribe();
}

/** Pede ao servidor um aviso de teste só para este aparelho. */
export async function testarNotificacao() {
  const { insc } = await inscricaoAtual();
  const { data } = await supabase.auth.getSession();
  const resp = await fetch("/api/avisar-vencimentos", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify({ endpoint: insc?.endpoint }),
  });
  const r = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(r.erro || "O teste falhou.");
}
