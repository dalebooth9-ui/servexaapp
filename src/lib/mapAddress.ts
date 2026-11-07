import { detectMapsPlatform, type MapsDestination } from './openInMaps';

export function cleanMapText(value?: string | null): string {
  const text = value?.trim() || '';
  return /^[—–-]+$/.test(text) ? '' : text;
}

export function copyableAddress(address?: string | null, postcode?: string | null): string {
  const text = cleanMapText(address);
  const code = cleanMapText(postcode);
  return code && !text.toLowerCase().replace(/\s/g, '').includes(code.toLowerCase().replace(/\s/g, '')) ? [text, code].filter(Boolean).join(', ') : text || code;
}

export function mapAddressUrl(dest: MapsDestination, directions = false, apple = detectMapsPlatform() === 'apple' && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && (navigator.maxTouchPoints > 0 || /iPhone|iPad|iPod/.test(navigator.userAgent))): string {
  const validCoordinates = dest.lat != null && dest.lng != null && Number.isFinite(dest.lat) && Number.isFinite(dest.lng) && Math.abs(dest.lat) <= 90 && Math.abs(dest.lng) <= 180;
  const query = validCoordinates ? `${dest.lat},${dest.lng}` : copyableAddress(dest.address, dest.postcode);
  if (apple) return `https://maps.apple.com/?${directions ? 'daddr' : 'q'}=${encodeURIComponent(query)}${directions ? '&dirflg=d' : ''}`;
  return directions ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}