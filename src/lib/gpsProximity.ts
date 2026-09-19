/**
 * gpsProximity — distance maths and address geocoding used by the engineer
 * Quick Capture flow, which files an orphan photo against the nearest active
 * job site.
 */
import { geocodeWithNominatim, type LatLng } from "@/lib/geocodeCache";

/** Maximum distance (metres) between engineer and job site for an auto-assign. */
export const GPS_AUTO_ASSIGN_RADIUS = 500;

export type JobCoords = {
  id: string;
  site_latitude?: number | null;
  site_longitude?: number | null;
};

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two coordinates, in metres. */
export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Nearest job to the engineer. Jobs without coordinates are ignored.
 * Returns null when nothing can be measured.
 */
export function findNearestJob<T extends JobCoords>(
  userLat: number,
  userLng: number,
  jobs: T[],
): { job: T; distance: number } | null {
  let best: { job: T; distance: number } | null = null;
  for (const job of jobs) {
    const lat = job.site_latitude;
    const lng = job.site_longitude;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const distance = haversineDistance(userLat, userLng, lat, lng);
    if (!best || distance < best.distance) best = { job, distance };
  }
  return best;
}

/** Human-friendly distance label, e.g. "320 m" or "4.2 km". */
export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres)) return "";
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`;
}

/**
 * Geocode a free-text address using the shared (cached) OpenStreetMap
 * Nominatim lookup. Returns null when the address can't be resolved.
 */
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  if (!address || !address.trim()) return null;
  return geocodeWithNominatim(address.trim());
}

/** Current device position, or null when unavailable / denied / timed out. */
export function getCurrentCoords(timeoutMs = 8000): Promise<LatLng | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: LatLng | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => done(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        done({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        done(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}
