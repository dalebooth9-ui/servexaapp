/**
 * Long-lived tab freshness check.
 *
 * The service worker's autoUpdate already prompts most users, but plain
 * browser tabs on office PCs / tablets can miss it when the SW registration
 * update poll is throttled by the browser. As a belt-and-braces fallback we
 * fetch `/version.json` (emitted at build time) periodically and whenever the
 * tab regains focus / comes back online, and fire a callback when the
 * deployed version no longer matches the version this tab is running.
 *
 * We never auto-reload. The callback is expected to surface a subtle banner;
 * the user chooses when to refresh, so mid-form / mid-upload work is safe.
 */
const VERSION_URL = "/version.json";
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchDeployedVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${VERSION_URL}?ts=${Date.now()}`, {
      cache: "no-store",
      credentials: "omit",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return typeof data?.version === "string" ? data.version : null;
  } catch {
    return null;
  }
}

export function startVersionPolling(onNewVersion: (deployed: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  if (!import.meta.env.PROD) return () => {}; // dev has no version.json

  const current = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown";
  let notified = false;

  const check = async () => {
    if (notified) return;
    const deployed = await fetchDeployedVersion();
    if (!deployed || deployed === current) return;
    notified = true;
    onNewVersion(deployed);
  };

  // Initial check shortly after load so we don't compete with first paint.
  const initial = window.setTimeout(check, 15_000);
  const interval = window.setInterval(check, POLL_INTERVAL_MS);

  const onFocus = () => void check();
  const onVisibility = () => {
    if (document.visibilityState === "visible") void check();
  };
  const onOnline = () => void check();

  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("online", onOnline);

  return () => {
    window.clearTimeout(initial);
    window.clearInterval(interval);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("online", onOnline);
  };
}
