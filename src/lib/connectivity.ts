/**
 * Connectivity manager for field users on flaky cellular connections.
 *
 * `navigator.onLine` is optimistic — it flips true as soon as the OS has ANY
 * link, even if that link can't reach the internet (captive-portal wifi,
 * signal-less cell). We layer a lightweight reachability probe on top so the
 * offline banner reflects "can the app actually save?" not just "is a NIC
 * up?".
 *
 * Also surfaces cellular / effective-network-type via the Network Information
 * API when the browser exposes it, so callers can warn before a photo bundle
 * chews through a SIM's data allowance.
 *
 * Singleton state + subscribe pattern — no provider needed.
 */

export type ConnectivityState = {
  /** Raw navigator.onLine — cheap but can lie. */
  navigatorOnline: boolean;
  /** True once a reachability probe has confirmed the internet is reachable. */
  reachable: boolean;
  /** Whether the app should treat itself as online (navigator.onLine && reachable). */
  isOnline: boolean;
  /** Best-effort connection type from the Network Information API. */
  connectionType: "cellular" | "wifi" | "ethernet" | "unknown" | "none";
  /** effectiveType from the Network Information API, e.g. "4g". */
  effectiveType: string | null;
  /** True if the browser reports the device is on a mobile-data connection. */
  isCellular: boolean;
  /** User has requested data-saving mode. */
  saveData: boolean;
};

const PROBE_URL = "/favicon.ico"; // small same-origin asset, always deployed
const PROBE_INTERVAL_ONLINE_MS = 60 * 1000; // once a minute when things look fine
const PROBE_INTERVAL_OFFLINE_MS = 8 * 1000; // faster while offline so we clear the banner fast

let state: ConnectivityState = computeInitial();
const listeners = new Set<(s: ConnectivityState) => void>();
let probeTimer: number | null = null;
let inflightProbe: Promise<boolean> | null = null;
let started = false;

function readConnection(): Pick<ConnectivityState, "connectionType" | "effectiveType" | "isCellular" | "saveData"> {
  if (typeof navigator === "undefined") {
    return { connectionType: "unknown", effectiveType: null, isCellular: false, saveData: false };
  }
  const c = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (!c) return { connectionType: "unknown", effectiveType: null, isCellular: false, saveData: false };
  const type: string = c.type || "unknown";
  const effectiveType: string | null = c.effectiveType || null;
  const isCellular = type === "cellular" || /^(2g|3g|4g|5g)$/i.test(effectiveType || "");
  // Some engines only expose `effectiveType` (e.g. 4g) without `type` — treat
  // those as cellular only when explicitly declared to avoid mis-flagging wifi.
  const finalCellular = type === "cellular" ? true : isCellular && type === "unknown" && !!effectiveType && !/wifi|ethernet/i.test(type);
  return {
    connectionType: (type as ConnectivityState["connectionType"]) || "unknown",
    effectiveType,
    isCellular: finalCellular,
    saveData: !!c.saveData,
  };
}

function computeInitial(): ConnectivityState {
  const navigatorOnline = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  return {
    navigatorOnline,
    reachable: navigatorOnline, // assume true until first probe says otherwise
    isOnline: navigatorOnline,
    ...readConnection(),
  };
}

function emit() {
  for (const l of listeners) l(state);
}

function setState(patch: Partial<ConnectivityState>) {
  const next: ConnectivityState = { ...state, ...patch };
  next.isOnline = next.navigatorOnline && next.reachable;
  if (
    next.navigatorOnline !== state.navigatorOnline ||
    next.reachable !== state.reachable ||
    next.isOnline !== state.isOnline ||
    next.connectionType !== state.connectionType ||
    next.effectiveType !== state.effectiveType ||
    next.isCellular !== state.isCellular ||
    next.saveData !== state.saveData
  ) {
    state = next;
    emit();
  }
}

/**
 * Perform a lightweight reachability probe. Uses HEAD on a same-origin asset
 * with cache-busting so we can't be fooled by the service worker. Returns
 * true if we got a network-level success (any 2xx/3xx/opaque).
 */
export async function probeReachability(): Promise<boolean> {
  if (typeof fetch === "undefined") return true;
  if (inflightProbe) return inflightProbe;
  inflightProbe = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${PROBE_URL}?_probe=${Date.now()}`, {
        method: "HEAD",
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
      });
      clearTimeout(timer);
      // Any response at all means the network stack reached the origin.
      return res.ok || (res.status >= 200 && res.status < 500);
    } catch {
      return false;
    } finally {
      inflightProbe = null;
    }
  })();
  const ok = await inflightProbe;
  setState({ reachable: ok });
  return ok;
}

function scheduleNextProbe() {
  if (probeTimer !== null) window.clearTimeout(probeTimer);
  const delay = state.isOnline ? PROBE_INTERVAL_ONLINE_MS : PROBE_INTERVAL_OFFLINE_MS;
  probeTimer = window.setTimeout(async () => {
    await probeReachability();
    scheduleNextProbe();
  }, delay);
}

export function startConnectivityMonitor() {
  if (started || typeof window === "undefined") return;
  started = true;

  const refreshOnline = () => {
    setState({ navigatorOnline: navigator.onLine !== false });
    void probeReachability();
  };
  window.addEventListener("online", refreshOnline);
  window.addEventListener("offline", refreshOnline);
  window.addEventListener("focus", refreshOnline);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshOnline();
  });

  const c = (navigator as any).connection;
  if (c && typeof c.addEventListener === "function") {
    c.addEventListener("change", () => setState(readConnection()));
  }

  // Kick off first probe + regular schedule.
  void probeReachability();
  scheduleNextProbe();
}

export function getConnectivity(): ConnectivityState {
  return state;
}

export function subscribeConnectivity(fn: (s: ConnectivityState) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}
