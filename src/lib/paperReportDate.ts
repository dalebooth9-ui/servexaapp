/**
 * Read a date as written on a paper sheet or typed by the office.
 * Accepts d/m/yy, dd/mm/yy, d/m/yyyy, dd/mm/yyyy (also "." or "-" separators)
 * and yyyy-mm-dd (optionally with a time). Two-digit years are always 20yy
 * (26 → 2026, never 1926). Returns yyyy-mm-dd, or null when unreadable.
 */
export function parseSheetDate(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  let y: number, m: number, d: number;
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  const uk = value.match(/^(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2}|\d{4})$/);
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (uk) {
    d = Number(uk[1]); m = Number(uk[2]); y = Number(uk[3]);
    if (uk[3].length === 2) y += 2000;
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/** Plain-English problem with a typed date, or null when it is fine (blank is fine). */
export function sheetDateProblem(raw: string | null | undefined): string | null {
  if (!String(raw ?? "").trim()) return null;
  return parseSheetDate(raw) ? null : `"${String(raw).trim()}" isn't a date we can read. Use dd/mm/yyyy, e.g. 19/11/2026.`;
}

/**
 * Paper review dates are calendar dates, not the time the office filed them.
 * Never blocks: a blank or unreadable date falls back to today.
 */
export function paperCompletionIso(raw: string | null | undefined, now = new Date()): string {
  const day = parseSheetDate(raw);
  return day ? `${day}T12:00:00.000Z` : now.toISOString();
}

/** Strict version for an office correction of a saved report: tells them what's wrong. */
export function paperCompletionIsoStrict(raw: string | null | undefined): string {
  const day = parseSheetDate(raw);
  if (!day) throw new Error(sheetDateProblem(raw) || "Enter the completion date (dd/mm/yyyy).");
  return `${day}T12:00:00.000Z`;
}

export function paperDateText(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function isPaperReport(answers: Record<string, any>, historicBackfill = false): boolean {
  return historicBackfill || Boolean(answers._paper_completion_at || answers._scan_source);
}