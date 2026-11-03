/** Shared helpers for the dry riser register and history imports. */

export const ASSET_TAG_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ASSET_TAG_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

export function isDryRiserAsset(a: { asset_type?: string | null; category?: string | null } | null | undefined): boolean {
  if (!a) return false;
  return /dry[\s_-]*riser/i.test(`${a.asset_type || ""} ${a.category || ""}`);
}

export function isWetRiserAsset(a: { asset_type?: string | null; category?: string | null } | null | undefined): boolean {
  if (!a) return false;
  return /wet[\s_-]*riser/i.test(`${a.asset_type || ""} ${a.category || ""}`);
}

export type RiserType = "Dry Riser" | "Wet Riser";

/** "Dry Riser" / "Wet Riser" for a riser asset, otherwise null. */
export function riserTypeOf(a: { asset_type?: string | null; category?: string | null } | null | undefined): RiserType | null {
  if (isWetRiserAsset(a)) return "Wet Riser";
  if (isDryRiserAsset(a)) return "Dry Riser";
  return null;
}

export function isRiserAsset(a: { asset_type?: string | null; category?: string | null } | null | undefined): boolean {
  return riserTypeOf(a) !== null;
}

/** Supabase .or() filter matching riser assets of one type, or both when omitted. */
export function riserOrFilter(type?: RiserType | null): string {
  const d = "asset_type.ilike.dry%riser%,category.ilike.dry%riser%";
  const w = "asset_type.ilike.wet%riser%,category.ilike.wet%riser%";
  return type === "Dry Riser" ? d : type === "Wet Riser" ? w : `${d},${w}`;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
};

/**
 * Best-effort UK date parsing for imported report dates. Returns YYYY-MM-DD or
 * null when the text can't be read. "OCT 2026" -> 2026-10-01,
 * "12/03/2025" -> 2025-03-12 (day first), "2025-03-12" -> 2025-03-12.
 */
export function parseReportDateText(text: string | null | undefined): string | null {
  const s = String(text ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?\s+(\d{2,4})$/i);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return iso(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  m = s.match(/^([a-z]+)\.?[\s\-/,]+(\d{2,4})$/i);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return iso(+m[2], MONTHS[m[1].slice(0, 3).toLowerCase()], 1);
  m = s.match(/^(\d{1,2})[/.\-](\d{4})$/);
  if (m) return iso(+m[2], +m[1], 1);
  m = s.match(/^(\d{4})$/);
  if (m) return iso(+m[1], 1, 1);
  return null;
}

export type DefectSeverity = "low" | "medium" | "high" | "critical";

/** Remedial CSV priority -> defect severity (default medium). */
export function priorityToSeverity(priority: string | null | undefined): DefectSeverity {
  const p = String(priority ?? "").trim().toLowerCase();
  if (!p) return "medium";
  if (/crit|urgent|immediate|p1\b|^1$/.test(p)) return "critical";
  if (/high|p2\b|^2$/.test(p)) return "high";
  if (/low|p4\b|^4$|minor/.test(p)) return "low";
  return "medium";
}

/**
 * Remedial CSV status -> defect status. "done" = resolved; anything else is
 * open. Draft-only or unreadable statuses are open AND flagged for review.
 */
export function remedialStatus(status: string | null | undefined): { status: "resolved" | "open"; needsReview: boolean } {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "done") return { status: "resolved", needsReview: false };
  const known = ["open", "outstanding", "to do", "todo", "pending", "quoted", "not done"];
  return { status: "open", needsReview: !known.includes(s) };
}
