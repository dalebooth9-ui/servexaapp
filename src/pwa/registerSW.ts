/**
 * Guarded service-worker registration. Follows the Lovable PWA skill rules:
 * - Never register in dev / iframe / Lovable preview hosts / when ?sw=off is set
 * - In refused contexts, unregister any matching SW so previous installs clean up
 * - Single registration entry-point (vite-plugin-pwa has `injectRegister: null`)
 *
 * Exposes `setupPWA({ onNeedRefresh, onOfflineReady })` so React components
 * can subscribe to update / offline-ready events without depending on the
 * registration internals.
 */
type Callbacks = {
  onNeedRefresh?: (reload: () => Promise<void>) => void;
  onOfflineReady?: () => void;
};

const REFUSE_HOSTNAMES = (h: string) =>
  h === "lovableproject.com" ||
  h.endsWith(".lovableproject.com") ||
  h === "lovableproject-dev.com" ||
  h.endsWith(".lovableproject-dev.com") ||
  h === "beta.lovable.dev" ||
  h.endsWith(".beta.lovable.dev");

function shouldRefuse(): boolean {
  if (!import.meta.env.PROD) return true;
  if (typeof window === "undefined") return true;
  try {
    if (window.self !== window.top) return true; // inside an iframe (preview)
  } catch {
    return true; // cross-origin frame — refuse
  }
  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (REFUSE_HOSTNAMES(host)) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

async function unregisterMatching(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(
      regs.map(async (r) => {
        const scriptUrl = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
        if (/\/sw\.js$|\/service-worker\.js$|\/registerSW\.js$/.test(scriptUrl)) {
          await r.unregister();
        }
      }),
    );
  } catch {
    // ignore
  }
}

export async function setupPWA(cb: Callbacks = {}): Promise<void> {
  if (shouldRefuse()) {
    await unregisterMatching();
    return;
  }
  try {
    const { registerSW } = await import("virtual:pwa-register");
    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        cb.onNeedRefresh?.(async () => {
          await update(true);
        });
      },
      onOfflineReady() {
        cb.onOfflineReady?.();
      },
    });
    // Best-effort Background Sync registration (Chromium browsers only).
    // On Safari/Firefox `sync` is absent and we fall back to the page-level
    // `online` listener in useSyncQueueDrainer.
    try {
      if ("serviceWorker" in navigator) {
        const reg: any = await navigator.serviceWorker.ready;
        if (reg && "sync" in reg) {
          await reg.sync.register("servexa-sync-queue");
        }
      }
    } catch {
      // ignore — Background Sync is optional
    }
  } catch {
    // virtual:pwa-register only exists after vite-plugin-pwa builds; ignore in tests
  }
}
