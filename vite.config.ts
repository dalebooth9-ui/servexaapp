import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

// Build-time version stamp. Injected as globals so the app can display which
// build is running (for support triage) and so update detection has a stable
// per-deployment identifier.
const BUILD_TIME = new Date().toISOString();
const APP_VERSION = BUILD_TIME.replace(/[-:.TZ]/g, "").slice(0, 12); // e.g. 202607121930
// Prefix of the service worker's stored app copy. The page clears any older prefix on update.
const SW_CACHE_ID = "servexa-v5";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __SW_CACHE_ID__: JSON.stringify(SW_CACHE_ID),
  },
  // Strip console.* and debugger statements from production builds only.
  // Dev keeps them so engineers can inspect logs locally.
  ...(mode === "production"
    ? { esbuild: { drop: ["console", "debugger"] as ("console" | "debugger")[] } }
    : {}),
  worker: {
    format: "es",
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mcpPlugin(),
    mode === "development" && componentTagger(),
    // Emit /version.json at build time so long-lived tabs can poll for a new
    // deploy even when the service-worker update path is delayed.
    {
      name: "servexa-version-json",
      apply: "build" as const,
      generateBundle(this: any) {
        (this as any).emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify({ version: APP_VERSION, builtAt: BUILD_TIME }),
        });
      },
    } as any,


    VitePWA({
      // "prompt": a new version waits until the user taps Update or reopens the app — never reloads mid-form
      registerType: "prompt",
      injectRegister: null, // we register via a guarded wrapper in src/pwa/registerSW.ts
      devOptions: { enabled: false }, // never emit a SW in dev / Lovable preview
      includeAssets: ["favicon.png", "favicon.ico", "bg-sync.js", "icon-192.png", "icon-512.png", "icon-maskable-512.png"],
      workbox: {
        cacheId: SW_CACHE_ID,
        cleanupOutdatedCaches: true,
        // When "Update now" activates this worker it takes over open pages at once.
        // (skipWaiting stays off: it only happens when the user asks.)
        clientsClaim: true,
        // HTML is deliberately NOT precached: a precached page is served
        // cache-first and kept devices on old builds. Pages are network-first below.
        globPatterns: ["**/*.{js,css,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Pull in the Background Sync listener so queued offline writes
        // can drain even when the page is closed (supported browsers only)
        importScripts: ["/bg-sync.js"],
        // No navigateFallback: it answers every page open from the stored copy.
        navigateFallback: undefined,
        runtimeCaching: [
          // HTML navigations — NetworkFirst (never serve a stale shell to a connected user)
          // One stored app page (key /index.html) is the offline fallback for every route.
          // OAuth / auth callbacks are excluded and always go to the network.
          {
            urlPattern: ({ request, url }) =>
              request.mode === "navigate" &&
              !/^\/(~oauth|\.lovable\/oauth|api|auth\/callback)/.test(url.pathname),
            handler: "NetworkFirst",
            options: {
              cacheName: "servexa-html",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
              plugins: [
                {
                  cacheKeyWillBeUsed: async () => self.location.origin + "/index.html",
                },
              ],
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
          // Stored photos — signed links carry a token + expiry in the query
          // string, so a re-signed link must still match the cached copy.
          {
            urlPattern: ({ url }) => /supabase\.co\/storage\/v1\/object\//.test(url.href),
            handler: "CacheFirst",
            options: {
              // v2: old cache held opaque copies that broke PDF signature loads.
              cacheName: "servexa-storage-images-v2",
              matchOptions: { ignoreSearch: true },
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              // Never cache opaque (status 0) responses — they can't be read
              // by later CORS requests (PDF generators), which then fail.
              cacheableResponse: { statuses: [200] },
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
        // Follow device rotation on tablets — engineers rotate landscape for job sheets.
        orientation: "any",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
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
