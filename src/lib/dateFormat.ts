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
