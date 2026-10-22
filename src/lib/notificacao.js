/**
 * Notificação do aparelho (a que aparece na barra do celular ou no canto da
 * tela do computador). Só funciona com o app aberto ou em segundo plano:
 * com ele fechado de vez, o aviso aparece quando abrir de novo.
 */

export const notificacaoSuportada = () => typeof window !== "undefined" && "Notification" in window;

export const notificacaoPermitida = () => notificacaoSuportada() && Notification.permission === "granted";

export const notificacaoBloqueada = () => notificacaoSuportada() && Notification.permission === "denied";

/** Tem que ser chamada num toque do usuário (exigência do iPhone e do Chrome). */
export async function pedirPermissao() {
  if (!notificacaoSuportada()) return false;
  return (await Notification.requestPermission()) === "granted";
}

export async function notificar(titulo, texto, tag) {
  if (!notificacaoPermitida()) return;
  const opcoes = { body: texto, tag, icon: "/fazenda-192.png", badge: "/fazenda-192.png", lang: "pt-BR" };
  try {
    // No celular (Android) só dá pelo service worker; no computador os dois servem.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(titulo, opcoes); return; }
    const n = new Notification(titulo, opcoes);
    n.onclick = () => { window.focus(); n.close(); };
  } catch { /* aparelho sem suporte: fica só o aviso na tela */ }
}
