/**
 * Background Sync companion — imported by the generated Workbox service
 * worker via workbox.importScripts. Listens for `sync` events fired by the
 * browser when the device regains connectivity and notifies open pages so
 * they can drain the IndexedDB queue.
 *
 * Safe to ship alongside vite-plugin-pwa (generateSW) because we only
 * append a listener — we don't replace caching behaviour.
 */
self.addEventListener("sync", (event) => {
  if (event.tag !== "servexa-sync-queue") return;
  event.waitUntil(
    (async () => {
      try {
        const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
        for (const client of clients) {
          client.postMessage({ type: "servexa-bg-sync" });
        }
      } catch (e) {
        // ignore — page-side `online` handler is a fallback
      }
    })(),
  );
});
