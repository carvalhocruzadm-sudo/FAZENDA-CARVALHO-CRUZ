/* Parte do service worker que recebe as notificações (contas vencendo) e abre o app ao tocar nelas. */
self.addEventListener("push", (evento) => {
  let aviso;
  try { aviso = evento.data ? evento.data.json() : {}; } catch { aviso = { corpo: evento.data.text() }; }
  evento.waitUntil(self.registration.showNotification(aviso.titulo || "Fazenda Carvalho Cruz", {
    body: aviso.corpo || "",
    icon: "/fazenda-192.png",
    badge: "/fazenda-192.png",
    tag: aviso.tag,
    data: { tela: aviso.tela || "boletos" },
  }));
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const tela = (evento.notification.data && evento.notification.data.tela) || "boletos";
  evento.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const j of janelas) {
      if ("focus" in j) {
        j.postMessage({ tipo: "abrir-tela", tela });
        return j.focus();
      }
    }
    return self.clients.openWindow(`/?tela=${encodeURIComponent(tela)}`);
  })());
});
