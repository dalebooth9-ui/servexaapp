/**
 * Reads the deployed build number from `/version.json` (emitted at build
 * time). Always bypasses every cache so a new deploy is seen immediately.
 * Automatic checks are scheduled in src/pwa/registerSW.ts.
 */
const VERSION_URL = "/version.json";

export async function fetchDeployedVersion(): Promise<string | null> {
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
