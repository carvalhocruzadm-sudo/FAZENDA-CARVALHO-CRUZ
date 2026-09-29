import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "prompt": quem está lançando um abastecimento decide a hora de atualizar.
      registerType: "prompt",
      injectRegister: null,
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "logo-simbolo.png", "logo-carvalho-cruz.png", "logo-fazenda.png"],
      manifest: {
        id: "/",
        name: "Fazenda Carvalho Cruz — Gestão",
        short_name: "Fazenda CC",
        description: "Gestão da Fazenda Carvalho Cruz: talhões, culturas, máquinas, diesel, químicos, despesas e vendas.",
        lang: "pt-BR",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#FAFAF7",
        theme_color: "#2D6A4F",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // O offline é do IndexedDB + fila; resposta velha do Supabase aqui
            // faria a sincronização ler dado furado.
            // As fotos também: ficam guardadas no IndexedDB (lib/fotos.js).
            urlPattern: ({ url }) => ["/rest/v1", "/auth/v1", "/storage/v1"].some((p) => url.pathname.startsWith(p)),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  server: { host: true, port: process.env.PORT ? Number(process.env.PORT) : undefined },
  preview: { host: true, port: process.env.PORT ? Number(process.env.PORT) : undefined },
});
