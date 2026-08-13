// Shared UK (en-GB) date formatting helpers.
// All date display in the app MUST go through these helpers so we never
// accidentally render US-format dates (M/D/YYYY).

const LOCALE = "en-GB";

type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** DD/MM/YYYY */
export function formatDate(value: DateInput, fallback = ""): string {
  const d = toDate(value);
  if (!d) return fallback;
  return d.toLocaleDateString(LOCALE);
}

/** e.g. "4 Jun 2026" */
export function formatDateShort(value: DateInput, fallback = ""): string {
  const d = toDate(value);
  if (!d) return fallback;
  return d.toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" });
}

/** e.g. "4 June 2026" */
export function formatDateLong(value: DateInput, fallback = ""): string {
  const d = toDate(value);
  if (!d) return fallback;
  return d.toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric" });
}

/** DD/MM/YYYY, HH:MM */
export function formatDateTime(value: DateInput, fallback = ""): string {
  const d = toDate(value);
  if (!d) return fallback;
  return d.toLocaleString(LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** e.g. "4 Jun" */
export function formatDayMonth(value: DateInput, fallback = ""): string {
  const d = toDate(value);
  if (!d) return fallback;
  return d.toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
}

/** Today as DD/MM/YYYY */
export function todayUK(): string {
  return new Date().toLocaleDateString(LOCALE);
}

/**
 * Convert an ISO-looking date string (yyyy-mm-dd, optionally with a time part)
 * into UK DD/MM/YYYY for display. Anything else is returned unchanged, so this
 * is safe to run across arbitrary form answers. Stored values are untouched.
 */
export function ukDateify<T>(value: T): T | string {
  if (typeof value !== "string") return value;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+.*)?$/);
  if (!m) return value;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Deep-apply ukDateify to every string value in an answers object/array. */
export function ukDateifyRecord<T>(input: T): T {
  if (typeof input === "string") return ukDateify(input) as unknown as T;
  if (Array.isArray(input)) return input.map((v) => ukDateifyRecord(v)) as unknown as T;
  if (input && typeof input === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(input as Record<string, any>)) out[k] = ukDateifyRecord(v);
    return out as unknown as T;
  }
  return input;
}
