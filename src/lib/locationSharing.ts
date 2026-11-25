// Company location-sharing rules (pure, tested). Stored in app_settings under LOCATION_SHARING_KEY.
export const LOCATION_SHARING_KEY = 'location_sharing';
export const LOCATION_UPDATE_MS = 60_000; // regular update while the app is open
export const LOCATION_MIN_GAP_MS = 15_000; // movement updates are throttled to this

export type SharingRole = 'engineer' | 'admin';
export interface LocationSharingSettings { enabled: boolean; roles: SharingRole[] }
export const DEFAULT_LOCATION_SHARING: LocationSharingSettings = { enabled: true, roles: ['engineer'] };

export function parseLocationSharing(value: unknown): LocationSharingSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_LOCATION_SHARING };
  const v = value as Record<string, unknown>;
  const roles = Array.isArray(v.roles)
    ? (v.roles.filter((r) => r === 'engineer' || r === 'admin') as SharingRole[])
    : DEFAULT_LOCATION_SHARING.roles;
  return { enabled: v.enabled !== false, roles };
}

/** Should this signed-in person's device share its location? Admins only when their role is
 *  included by the company, or they switched it on for themselves. */
export function shouldShareLocation(
  settings: LocationSharingSettings,
  role: string | null,
  selfOptIn: boolean,
): boolean {
  if (!settings.enabled) return false;
  if (role === 'engineer') return settings.roles.includes('engineer');
  if (role === 'admin') return settings.roles.includes('admin') || selfOptIn;
  return false;
}

export function formatAge(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min${min !== 1 ? 's' : ''} ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h${min % 60 ? ` ${min % 60}m` : ''} ago`;
  return `${Math.floor(h / 24)} days ago`;
}

export type ChipStatus = { status: 'live' | 'stale' | 'offline'; label: string; tooltip: string };
export function locationChipStatus(updatedAt: string | null | undefined, name: string, now = Date.now()): ChipStatus {
  const first = (name || 'the engineer').split(' ')[0];
  const ask = `Ask ${first} to open Servexa on their phone and allow location.`;
  if (!updatedAt) return { status: 'offline', label: 'Location off', tooltip: `Location sharing off — never seen. ${ask}` };
  const age = now - new Date(updatedAt).getTime();
  const seen = `last seen ${formatAge(age)}`;
  if (age < 5 * 60000) return { status: 'live', label: 'Location live', tooltip: `Sharing live location · ${seen}` };
  if (age <= 30 * 60000) return { status: 'stale', label: 'Location stale', tooltip: `Location may be out of date · ${seen}. ${ask}` };
  return { status: 'offline', label: 'Location off', tooltip: `Location sharing off · ${seen}. ${ask}` };
}
