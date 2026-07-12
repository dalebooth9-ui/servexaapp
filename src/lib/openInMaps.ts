// Platform detection + deep links for native maps apps.
// No API keys — plain universal links.

export type MapsPlatform = "apple" | "google" | "unknown";

export function detectMapsPlatform(): MapsPlatform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  const platform = (navigator as any).platform || "";
  // iPhone / iPad / iPod
  if (/iPhone|iPad|iPod/i.test(ua)) return "apple";
  // Modern iPadOS reports as Mac with touch support
  if (/Macintosh/i.test(ua) && (navigator as any).maxTouchPoints > 1) return "apple";
  // Desktop macOS — prefer Apple Maps
  if (/Mac OS X|Macintosh/i.test(ua) || /^Mac/i.test(platform)) return "apple";
  if (/Android/i.test(ua)) return "google";
  if (/Windows|Linux|CrOS/i.test(ua)) return "google";
  return "unknown";
}

export interface MapsDestination {
  address?: string | null;
  postcode?: string | null;
  lat?: number | null;
  lng?: number | null;
}

function destinationString(dest: MapsDestination): string {
  if (dest.lat != null && dest.lng != null && Number.isFinite(dest.lat) && Number.isFinite(dest.lng)) {
    return `${dest.lat},${dest.lng}`;
  }
  const parts = [dest.address, dest.postcode].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  // Avoid duplicating postcode already present in address
  if (parts.length === 2 && dest.address && dest.postcode &&
      dest.address.toLowerCase().includes(dest.postcode.toLowerCase())) {
    return dest.address!;
  }
  return parts.join(", ");
}

export function buildAppleMapsUrl(dest: MapsDestination): string {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(destinationString(dest))}&dirflg=d`;
}

export function buildGoogleMapsUrl(dest: MapsDestination): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destinationString(dest))}`;
}

export function buildMapsUrl(dest: MapsDestination, platform?: MapsPlatform): string {
  const p = platform ?? detectMapsPlatform();
  return p === "apple" ? buildAppleMapsUrl(dest) : buildGoogleMapsUrl(dest);
}

export function hasDestination(dest: MapsDestination): boolean {
  return !!(
    (dest.lat != null && dest.lng != null) ||
    (dest.address && dest.address.trim()) ||
    (dest.postcode && dest.postcode.trim())
  );
}
