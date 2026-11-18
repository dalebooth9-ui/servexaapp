/** Compliance status is worked out from the expiry date; the stored status is only used when there is no expiry. */
export const EXPIRING_SOON_DAYS = 60;

export function complianceStatus(expiry: string | null | undefined, stored: string, today = new Date()): string {
  if (!expiry) return stored;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const [y, m, d] = expiry.slice(0, 10).split("-").map(Number);
  const e = new Date(y, m - 1, d).getTime();
  if (e < t) return "expired";
  if (e - t <= EXPIRING_SOON_DAYS * 86400000) return "expiring_soon";
  return "valid";
}
