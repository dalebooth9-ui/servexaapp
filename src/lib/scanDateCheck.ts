import { parseSheetDate, paperDateText } from "@/lib/paperReportDate";

export type DateCheckReason = "old" | "future" | "disagree" | "low_confidence";

const DAY = 86_400_000;
export const DATE_CHECK_OLD_DAYS = 14;

/**
 * Why a scanned sheet's date needs an office check before filing. Empty list =
 * file as normal. `siblingDates` are the dates read/filed for other sheets in
 * the same scan; `lowConfidence` is the scanner's own doubt flag.
 */
export function dateCheckReasons(
  input: { date: string | null | undefined; siblingDates?: Array<string | null | undefined>; lowConfidence?: boolean },
  today = new Date(),
): DateCheckReason[] {
  const out: DateCheckReason[] = [];
  const iso = parseSheetDate(input.date);
  const todayIso = today.toISOString().slice(0, 10);
  if (iso) {
    const diff = (Date.parse(`${todayIso}T12:00:00Z`) - Date.parse(`${iso}T12:00:00Z`)) / DAY;
    if (diff > DATE_CHECK_OLD_DAYS) out.push("old");
    if (diff < 0) out.push("future");
    const others = (input.siblingDates || []).map((d) => parseSheetDate(d)).filter(Boolean) as string[];
    if (others.some((o) => o !== iso)) out.push("disagree");
  }
  if (input.lowConfidence) out.push("low_confidence");
  return out;
}

export function dateCheckText(reasons: DateCheckReason[], siblingDates: Array<string | null | undefined> = []): string {
  const parts: string[] = [];
  if (reasons.includes("old")) parts.push(`more than ${DATE_CHECK_OLD_DAYS} days ago`);
  if (reasons.includes("future")) parts.push("in the future");
  if (reasons.includes("disagree")) {
    const others = [...new Set(siblingDates.map((d) => parseSheetDate(d)).filter(Boolean) as string[])].map(paperDateText);
    parts.push(`different from another sheet in this scan${others.length ? ` (${others.join(", ")})` : ""}`);
  }
  if (reasons.includes("low_confidence")) parts.push("the scanner wasn't sure how to read it");
  return parts.length ? `Check date: ${parts.join("; ")}.` : "";
}
