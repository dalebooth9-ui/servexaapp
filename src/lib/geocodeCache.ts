// Address → { lat, lng } cache shared across the app.
//
// Two-tier: an in-memory Map (survives across component mounts within a session)
// plus a localStorage-backed persistent store (survives page reloads). This cuts
// repeat Geocoding API calls dramatically when the same job addresses reappear
// on the planner map, engineer dashboard, today's dashboard, route optimiser,
// etc.
//
// Cache entries are keyed by a normalised form of the address so trivial
// differences ("  123 High St. " vs "123 High St") reuse the same result.

export type LatLng = { lat: number; lng: number };

type Entry = { lat: number; lng: number; ts: number };

const NAMESPACE_PREFIX = "geocache:v1:"; // bump if the entry shape changes
const TTL_MS = 1000 * 60 * 60 * 24 * 90; // 90 days
const MAX_MEMORY_ENTRIES = 500;

const memoryCache = new Map<string, Entry>();

function normaliseAddress(input: string): string {
  return input
    .toLowerCase()
    .replace(/[.,;:!?()"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function storageKey(provider: string, address: string): string {
  return `${NAMESPACE_PREFIX}${provider}:${normaliseAddress(address)}`;
}

function readStorage(provider: string, address: string): Entry | null {
  const memKey = `${provider}:${normaliseAddress(address)}`;
  const mem = memoryCache.get(memKey);
  if (mem && Date.now() - mem.ts < TTL_MS) return mem;

  try {
    const raw = localStorage.getItem(storageKey(provider, address));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry;
    if (!parsed || typeof parsed.lat !== "number" || typeof parsed.lng !== "number") return null;
    if (Date.now() - (parsed.ts || 0) > TTL_MS) {
      localStorage.removeItem(storageKey(provider, address));
      return null;
    }
    memoryCache.set(memKey, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(provider: string, address: string, coords: LatLng): void {
  const entry: Entry = { lat: coords.lat, lng: coords.lng, ts: Date.now() };
  const memKey = `${provider}:${normaliseAddress(address)}`;
  // Trim in-memory cache if it grows unbounded
  if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }
  memoryCache.set(memKey, entry);
  try {
    localStorage.setItem(storageKey(provider, address), JSON.stringify(entry));
  } catch {
    // Quota exceeded or storage disabled — memory cache is still useful this session
  }
}

/**
 * Geocode a UK address with the Google Maps JS Geocoder, using the shared
 * cache. Requires the Maps JS SDK to already be loaded on the page.
 */
export async function geocodeWithGoogle(address: string): Promise<LatLng | null> {
  if (!address || !address.trim()) return null;
  const cached = readStorage("google", address);
  if (cached) return { lat: cached.lat, lng: cached.lng };

  const g = (window as any).google;
  if (!g?.maps?.Geocoder) return null;
  try {
    const geocoder = new g.maps.Geocoder();
    const result = await geocoder.geocode({
      address,
      region: "GB",
      componentRestrictions: { country: "GB" },
    });
    const loc = result?.results?.[0]?.geometry?.location;
    if (!loc) return null;
    const coords = { lat: loc.lat(), lng: loc.lng() };
    writeStorage("google", address, coords);
    return coords;
  } catch {
    return null;
  }
}

/**
 * Geocode an address via OpenStreetMap Nominatim, using the shared cache.
 * Used by dashboards that just need approximate distances to sort jobs.
 */
export async function geocodeWithNominatim(address: string): Promise<LatLng | null> {
  if (!address || !address.trim()) return null;
  const cached = readStorage("osm", address);
  if (cached) return { lat: cached.lat, lng: cached.lng };
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
    );
    const data = await res.json();
    const first = data?.[0];
    if (!first) return null;
    const coords = { lat: parseFloat(first.lat), lng: parseFloat(first.lon) };
    if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return null;
    writeStorage("osm", address, coords);
    return coords;
  } catch {
    return null;
  }
}

/** Manually seed / overwrite a cache entry (e.g. from a server-side batch geocode). */
export function primeGeocodeCache(
  provider: "google" | "osm",
  address: string,
  coords: LatLng,
): void {
  writeStorage(provider, address, coords);
}

/** Clear all cached geocode entries (for debugging / cache-busting). */
export function clearGeocodeCache(): void {
  memoryCache.clear();
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(NAMESPACE_PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    // storage disabled — memory cache already cleared
  }
}
