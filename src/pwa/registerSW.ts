/**
 * Guarded service-worker registration and the app's single update path.
 *
 * Rules (Lovable PWA skill):
 * - Never register in dev / iframe / Lovable preview hosts / when ?sw=off is set;
 *   in refused contexts, unregister any matching app SW so old installs clean up.
 * - This module is the only registrar (vite-plugin-pwa has `injectRegister: null`).
 *
 * Update flow (`applyUpdate`): save open drafts → fetch the newest worker →
 * tell it to take over (SKIP_WAITING; the worker claims clients) → delete the
 * old app caches → full reload onto the new build. The page never reloads on
 * its own; only the user's "Update now" / Settings button starts this.
 */
import { flushAllDrafts } from "@/lib/draftFlush";
import { fetchDeployedVersion } from "@/pwa/versionPoll";


export const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes while open
const SW_URL = "/sw.js";
const JUST_UPDATED_KEY = "pwa_just_updated_from";

export const RUNNING_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
const CURRENT_CACHE_ID: string =
  typeof __SW_CACHE_ID__ !== "undefined" ? __SW_CACHE_ID__ : "servexa";

// Runtime caches that hold copies of the app itself (never user data).
const APP_RUNTIME_CACHES = ["servexa-html", "servexa-assets"];

/** True when a cache belongs to the app shell of an older build and can be dropped. */
export function isOldAppCache(name: string, currentCacheId: string = CURRENT_CACHE_ID): boolean {
  if (APP_RUNTIME_CACHES.includes(name)) return true;
  // Workbox precache names look like "<cacheId>-precache-v2-<scope>".
  if (/-precache-v\d+-/.test(name)) return !name.startsWith(`${currentCacheId}-precache-`);
  return false;
}

/** A newer build exists when the deployed version differs from the one running. */
export function isNewerBuild(deployed: string | null | undefined, running: string = RUNNING_VERSION): boolean {
  return !!deployed && deployed !== running;
}

function shouldRefuse(): boolean {
  if (!import.meta.env.PROD) return true;
  if (typeof window === "undefined") return true;
  try {
    if (window.self !== window.top) return true; // inside an iframe (preview)
  } catch {
    return true;
  }
  const host = window.location.hostname.toLowerCase();
  const firstLabel = host.split(".")[0];
  const lovableHost = /\.(lovable\.app|gpt-eng\.com|gptengineer\.run)$/.test(host);
  if (lovableHost && /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/.test(firstLabel)) return true;
  if (lovableHost && /^project--.+-dev$/.test(firstLabel)) return true;
  if (
    host === "lovableproject.com" || host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")
  ) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

function swSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

async function unregisterMatching(): Promise<void> {
  if (!swSupported()) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(
      regs.map(async (r) => {
        const scriptUrl = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
        if (/\/sw\.js$|\/service-worker\.js$|\/registerSW\.js$/.test(scriptUrl)) await r.unregister();
      }),
    );
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Update-available signal shared by the pop-up and Settings
// ---------------------------------------------------------------------------
type UpdateListener = (deployedVersion: string | null) => void;
const listeners = new Set<UpdateListener>();
let updateAvailable = false;
let knownDeployed: string | null = null;

export function onUpdateAvailable(fn: UpdateListener): () => void {
  listeners.add(fn);
  if (updateAvailable) fn(knownDeployed);
  return () => {
    listeners.delete(fn);
  };
}

function announce(deployed: string | null) {
  if (deployed) knownDeployed = deployed;
  updateAvailable = true;
  listeners.forEach((fn) => fn(knownDeployed));
}

let registration: ServiceWorkerRegistration | null = null;

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (registration) return registration;
  if (!swSupported()) return null;
  try {
    return (await navigator.serviceWorker.getRegistration("/")) ?? null;
  } catch {
    return null;
  }
}

function watchRegistration(reg: ServiceWorkerRegistration, onOfflineReady?: () => void) {
  const handleInstalled = (worker: ServiceWorker | null) => {
    if (!worker) return;
    const onState = () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        // A newer build is downloaded and waiting for the user's go-ahead.
        void fetchDeployedVersion().then((v) => announce(v));
      }
      if (worker.state === "activated" && !navigator.serviceWorker.controller) onOfflineReady?.();
    };
    worker.addEventListener("statechange", onState);
  };
  if (reg.waiting && navigator.serviceWorker.controller) {
    void fetchDeployedVersion().then((v) => announce(v));
  }
  if (reg.installing) handleInstalled(reg.installing);
  reg.addEventListener("updatefound", () => handleInstalled(reg.installing));
}

/** Store a copy of the app page so it can open offline (navigations are network-first). */
async function warmOfflineShell() {
  try {
    if (typeof caches === "undefined") return;
    const cache = await caches.open("servexa-html");
    const key = `${window.location.origin}/index.html`;
    if (!(await cache.match(key))) await cache.add(key);
  } catch {
    // offline or quota — the next online navigation fills it
  }
}

/**
 * Look for a newer build now (service worker + version.json, both uncached).
 * Fires the update-available signal when one exists.
 */
export async function checkForUpdate(): Promise<{ updateFound: boolean; deployed: string | null; error?: string }> {
  let error: string | undefined;
  const reg = await getRegistration();
  if (reg) {
    try {
      await reg.update();
    } catch (e: any) {
      error = e?.message || "Update check failed.";
    }
  }
  const deployed = await fetchDeployedVersion();
  const swHasNew = !!reg && (!!reg.waiting || !!reg.installing) && !!navigator.serviceWorker.controller;
  const updateFound = isNewerBuild(deployed) || swHasNew;
  if (updateFound) announce(deployed);
  if (!deployed && !reg && !error) error = "Couldn't reach Servexa to check for updates.";
  return { updateFound, deployed, error: updateFound ? undefined : error };
}

function waitForInstalled(reg: ServiceWorkerRegistration, timeoutMs: number): Promise<ServiceWorker | null> {
  if (reg.waiting) return Promise.resolve(reg.waiting);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(reg.waiting ?? null), timeoutMs);
    const track = (w: ServiceWorker | null) => {
      if (!w) return;
      w.addEventListener("statechange", () => {
        if (w.state === "installed" || w.state === "activated") {
          clearTimeout(timer);
          resolve(reg.waiting ?? w);
        }
        if (w.state === "redundant") {
          clearTimeout(timer);
          resolve(reg.waiting ?? null);
        }
      });
    };
    track(reg.installing);
    reg.addEventListener("updatefound", () => track(reg.installing));
  });
}

function activateWaiting(worker: ServiceWorker, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      resolve(ok);
    };
    const onChange = () => done(true);
    const timer = setTimeout(() => done(worker.state === "activated"), timeoutMs);
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    worker.postMessage({ type: "SKIP_WAITING" });
  });
}

async function clearOldAppCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const names = await caches.keys();
    await Promise.allSettled(names.filter((n) => isOldAppCache(n)).map((n) => caches.delete(n)));
  } catch {
    // ignore
  }
}

let applying = false;

/**
 * "Update now": save drafts, switch to the newest worker, clear the old app
 * copies and reload. Sign-in, saved drafts and the offline queue are kept
 * (they live in localStorage / IndexedDB, which this never touches).
 */
export async function applyUpdate(): Promise<void> {
  if (applying) return;
  applying = true;
  try {
    await flushAllDrafts();

    const reg = await getRegistration();
    if (reg && swSupported()) {
      try { await reg.update(); } catch { /* offline — use what we have */ }
      const waiting = await waitForInstalled(reg, 20_000);
      let switched = false;
      if (waiting && waiting !== reg.active) switched = await activateWaiting(waiting, 8_000);
      // If the new worker couldn't take over, remove the old one so the reload
      // goes straight to the network instead of an old stored copy.
      if (!switched && (waiting || isNewerBuild(await fetchDeployedVersion()))) await reg.unregister();
    }

    await clearOldAppCaches();
    try { sessionStorage.setItem(JUST_UPDATED_KEY, RUNNING_VERSION); } catch { /* ignore */ }
  } finally {
    window.location.reload();
  }
}

/** Returns the previous build number once, right after an update reload. */
export function consumeJustUpdated(): string | null {
  try {
    const from = sessionStorage.getItem(JUST_UPDATED_KEY);
    if (from) sessionStorage.removeItem(JUST_UPDATED_KEY);
    return from;
  } catch {
    return null;
  }
}

/** @deprecated kept for older callers — same as applyUpdate(). */
export const reloadToLatest = applyUpdate;

let started = false;

export async function setupPWA(cb: { onOfflineReady?: () => void } = {}): Promise<void> {
  if (started) return;
  started = true;

  const refused = shouldRefuse();
  if (refused) await unregisterMatching();

  // Automatic checks: on open, when the app comes back to the foreground,
  // when the network returns, and every few minutes while it's open.
  if (import.meta.env.PROD && typeof window !== "undefined") {
    const run = () => void checkForUpdate();
    run();
    setInterval(run, CHECK_INTERVAL_MS);
    window.addEventListener("focus", run);
    window.addEventListener("online", run);
    window.addEventListener("pageshow", (e) => { if ((e as PageTransitionEvent).persisted) run(); });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") run();
    });
  }

  if (refused || !swSupported()) return;

  try {
    // updateViaCache "none": the browser never answers sw.js (or its imports)
    // from its HTTP cache, so a new build's worker is always seen.
    const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" });
    registration = reg;
    watchRegistration(reg, cb.onOfflineReady);
    void warmOfflineShell();

    // Best-effort Background Sync registration (Chromium only).
    try {
      const ready: any = await navigator.serviceWorker.ready;
      if (ready && "sync" in ready) await ready.sync.register("servexa-sync-queue");
    } catch {
      // optional
    }
  } catch {
    // registration failed — the app still works online
  }
}

/** Settings "Check for updates". */
export const forceUpdateCheck = checkForUpdate;
