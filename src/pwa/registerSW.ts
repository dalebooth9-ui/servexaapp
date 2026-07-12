/**
 * Guarded service-worker registration. Follows the Lovable PWA skill rules:
 * - Never register in dev / iframe / Lovable preview hosts / when ?sw=off is set
 * - In refused contexts, unregister any matching SW so previous installs clean up
 * - Single registration entry-point (vite-plugin-pwa has `injectRegister: null`)
 *
 * Exposes `setupPWA({ onNeedRefresh, onOfflineReady })` so React components
 * can subscribe to update / offline-ready events without depending on the
 * registration internals.
 *
 * Also exposes `forceUpdateCheck()` so UI actions (e.g. Settings → "Check for
 * updates") can manually poll for a new service worker and surface the result.
 */
type Callbacks = {
  onNeedRefresh?: (reload: () => Promise<void>) => void;
  onOfflineReady?: () => void;
};

const LAST_PROMPTED_VERSION_KEY = "pwa_last_prompted_version";
const INSTALLED_VERSION_KEY = "pwa_installed_version";

export function getLastPromptedVersion(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LAST_PROMPTED_VERSION_KEY);
  } catch {
    return null;
  }
}

export function setLastPromptedVersion(version: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_PROMPTED_VERSION_KEY, version);
  } catch {
    // ignore
  }
}

export function clearLastPromptedVersion(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LAST_PROMPTED_VERSION_KEY);
  } catch {
    // ignore
  }
}

export function getInstalledVersion(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(INSTALLED_VERSION_KEY);
  } catch {
    return null;
  }
}

export function setInstalledVersion(version: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(INSTALLED_VERSION_KEY, version);
  } catch {
    // ignore
  }
}

/**
 * Returns true if we have not already prompted for an update while this
 * exact build was the running version. This stops the banner/toast from
 * spamming the user on every foreground check once they have dismissed it.
 */
export function shouldPromptForUpdate(currentVersion: string): boolean {
  return getLastPromptedVersion() !== currentVersion;
}

/**
 * Reset the update-prompt state whenever the running app version changes.
 * This ensures a fresh install (or a fresh deployment) does not inherit a
 * stale "last prompted" version from browser storage, so the user sees the
 * update banner correctly from the first run.
 */
export function resetPromptStateOnNewInstall(currentVersion: string): void {
  const installed = getInstalledVersion();
  if (installed !== currentVersion) {
    clearLastPromptedVersion();
    setInstalledVersion(currentVersion);
  }
}

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

  // Reset the last-prompted version whenever the installed app version changes.
  // A fresh PWA install can inherit origin localStorage from prior browser use;
  // clearing the key guarantees the update banner behaves correctly from run one.
  const currentVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown";
  resetPromptStateOnNewInstall(currentVersion);

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

    // When a new SW takes control (autoUpdate swap), reload once so the
    // running page picks up the new code without requiring a full relaunch.
    if ("serviceWorker" in navigator) {
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    }

    // Actively poll for a new service worker so installed phone apps that
    // stay open for days still pick up published updates. We check:
    //   - immediately on load (registerSW already does this)
    //   - every 30 minutes while the tab is alive
    //   - whenever the tab regains focus / visibility
    //   - whenever the network comes back online
    const checkForUpdate = async () => {
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) await reg.update();
      } catch {
        // ignore
      }
    };
    setInterval(checkForUpdate, 30 * 60 * 1000);
    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    });
    window.addEventListener("online", checkForUpdate);

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

/**
 * Manually poll the registered service worker for an update.
 * Returns `true` if a new worker is installing or waiting after the check.
 * The existing PWAPrompts banner will surface via `onNeedRefresh` when the
 * new worker is waiting, so callers only need to show a "checking" toast.
 */
export async function forceUpdateCheck(): Promise<{ updateFound: boolean; error?: string }> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return { updateFound: false, error: "Service workers are not supported in this browser." };
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      return { updateFound: false, error: "No service worker is registered." };
    }
    await reg.update();
    const newWorker = reg.installing || reg.waiting;
    const updateFound = !!newWorker && newWorker !== reg.active;
    return { updateFound };
  } catch (err: any) {
    return { updateFound: false, error: err?.message || "Update check failed." };
  }
}
