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
      includeAssets: ["compartilhar-sw.js", "fazenda-favicon.svg", "fazenda-apple-touch.png", "logo-simbolo.png", "logo-carvalho-cruz.png", "logo-fazenda.png"],
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
          { src: "fazenda-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "fazenda-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "fazenda-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        // Faz o app aparecer no "Compartilhar" do Android: o comprovante que o
        // banco gera chega em /compartilhar (tratado em public/compartilhar-sw.js).
        share_target: {
          action: "/compartilhar",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            title: "titulo",
            text: "texto",
            url: "link",
            files: [{ name: "comprovante", accept: ["application/pdf", "image/*", ".pdf", ".jpg", ".jpeg", ".png"] }],
          },
        },
      },
      workbox: {
        importScripts: ["compartilhar-sw.js"],
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // O offline é do IndexedDB + fila; resposta velha do Supabase aqui
            // faria a sincronização ler dado furado.
            urlPattern: ({ url }) => url.pathname.startsWith("/rest/v1") || url.pathname.startsWith("/auth/v1"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  server: { host: true, port: process.env.PORT ? Number(process.env.PORT) : undefined },
  preview: { host: true, port: process.env.PORT ? Number(process.env.PORT) : undefined },
});
