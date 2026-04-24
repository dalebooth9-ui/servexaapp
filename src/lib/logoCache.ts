// In-memory cache for logo assets used in Word/PDF document generation.
// Avoids re-fetching the same logo URL on every export within a session.

export interface CachedLogo {
  buf: Uint8Array;
  type: "png" | "jpeg";
  dims: { w: number; h: number };
}

interface Entry {
  expiresAt: number;
  promise: Promise<CachedLogo | null>;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, Entry>();

const measure = (buf: Uint8Array, type: "png" | "jpeg"): Promise<{ w: number; h: number }> =>
  new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(new Blob([buf.buffer as ArrayBuffer], { type: `image/${type}` }));
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); resolve({ w: im.naturalWidth || 400, h: im.naturalHeight || 120 }); };
      im.onerror = () => { URL.revokeObjectURL(url); resolve({ w: 400, h: 120 }); };
      im.src = url;
    } catch {
      resolve({ w: 400, h: 120 });
    }
  });

async function load(url: string): Promise<CachedLogo | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const buf = new Uint8Array(await resp.arrayBuffer());
    const type: "png" | "jpeg" = url.toLowerCase().endsWith(".png") ? "png" : "jpeg";
    const dims = await measure(buf, type);
    return { buf, type, dims };
  } catch {
    return null;
  }
}

/** Fetch a logo with in-memory caching. Returns null on failure. */
export function getCachedLogo(url: string): Promise<CachedLogo | null> {
  const now = Date.now();
  const existing = cache.get(url);
  if (existing && existing.expiresAt > now) return existing.promise;

  const promise = load(url);
  cache.set(url, { expiresAt: now + TTL_MS, promise });
  // If the load fails, evict so the next call retries.
  promise.then((res) => {
    if (!res) cache.delete(url);
  });
  return promise;
}

/** Clear cached logo entries (e.g. when a customer's logo URL changes). */
export function clearLogoCache(url?: string) {
  if (url) cache.delete(url);
  else cache.clear();
}
