import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Strip console.* and debugger statements from production builds only.
  // Dev keeps them so engineers can inspect logs locally.
  ...(mode === "production"
    ? { esbuild: { drop: ["console", "debugger"] as ("console" | "debugger")[] } }
    : {}),
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null, // we register via a guarded wrapper in src/pwa/registerSW.ts
      devOptions: { enabled: false }, // never emit a SW in dev / Lovable preview
      includeAssets: ["favicon.png", "favicon.ico"],
      workbox: {
        // Bump cacheId to force all clients to evict old precaches
        cacheId: "servexa-v4",
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Pull in the Background Sync listener so queued offline writes
        // can drain even when the page is closed (supported browsers only)
        importScripts: ["/bg-sync.js"],
        // OAuth and Supabase auth callbacks must always hit the network
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [
          /^\/~oauth/,
          /^\/api/,
          /^\/auth\/callback/,
        ],
        runtimeCaching: [
          // HTML navigations — NetworkFirst (never serve a stale shell to a connected user)
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "servexa-html",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          // Same-origin hashed JS/CSS — safe to cache long-term
          {
            urlPattern: ({ url, request, sameOrigin }: any) =>
              sameOrigin && (request.destination === "script" || request.destination === "style"),
            handler: "CacheFirst",
            options: {
              cacheName: "servexa-assets",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          // Images — CacheFirst with size cap
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "servexa-images",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          // Supabase REST reads — NetworkFirst so stale data is shown only when offline
          {
            urlPattern: ({ url, request }) =>
              /supabase\.co\/rest\/v1\//.test(url.href) && request.method === "GET",
            handler: "NetworkFirst",
            options: {
              cacheName: "servexa-supabase-rest",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: "Servexa",
        short_name: "Servexa",
        description: "Servexa — Smarter Service Operations",
        theme_color: "#1E3A5F",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/favicon.png", sizes: "192x192", type: "image/png" },
          { src: "/favicon.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
