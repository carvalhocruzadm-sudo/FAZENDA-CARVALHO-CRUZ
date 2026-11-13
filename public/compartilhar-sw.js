/**
 * Recebe o que o celular manda pelo botão "Compartilhar" (o comprovante que o
 * app do banco gera) e abre o app no lançamento da despesa.
 *
 * O Android envia um POST para /compartilhar (ver `share_target` no manifesto,
 * em vite.config.js). Este código roda dentro do service worker: guarda o
 * formulário recebido num cache e redireciona para /?compartilhado=1, onde o
 * app lê o arquivo (src/lib/arquivos.js → lerCompartilhado).
 */

const CACHE_COMPARTILHADO = "fcc-compartilhado";
const CHAVE_COMPARTILHADO = "/__compartilhado__";

self.addEventListener("fetch", (evento) => {
  const url = new URL(evento.request.url);
  if (evento.request.method !== "POST" || url.pathname !== "/compartilhar") return;

  evento.respondWith((async () => {
    try {
      const form = await evento.request.formData();
      const cache = await caches.open(CACHE_COMPARTILHADO);
      await cache.put(CHAVE_COMPARTILHADO, new Response(form));
    } catch {
      // Sem o arquivo, o app abre do mesmo jeito e avisa que não chegou nada.
    }
    return Response.redirect("/?compartilhado=1", 303);
  })());
});
