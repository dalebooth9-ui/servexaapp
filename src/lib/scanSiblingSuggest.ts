import { parseSheetDate } from "@/lib/paperReportDate";

export type SiblingHeader = Record<string, any> | null | undefined;
export type DateSource = "sheet" | "other_sheet" | "today";

/**
 * Suggest a completion date and engineer for one scanned sheet. A blank or
 * unreadable value on this sheet borrows from another sheet in the same scan
 * (same visit), else the date falls back to today. Never throws.
 */
export function suggestFromSiblings(
  own: { guessDate?: string | null; header?: SiblingHeader },
  siblings: SiblingHeader[],
  today = new Date(),
): { dateIso: string; dateSource: DateSource; engineer: string; engineerFromOther: boolean } {
  const ownDate = parseSheetDate(own.guessDate) || parseSheetDate(own.header?.date);
  let dateIso = ownDate;
  let dateSource: DateSource = "sheet";
  if (!dateIso) {
    for (const h of siblings) {
      const d = parseSheetDate(h?.date);
      if (d) { dateIso = d; dateSource = "other_sheet"; break; }
    }
  }
  if (!dateIso) { dateIso = today.toISOString().slice(0, 10); dateSource = "today"; }
  const ownEng = String(own.header?.engineer || "").trim();
  let engineer = ownEng;
  let engineerFromOther = false;
  if (!engineer) {
    const other = siblings.map((h) => String(h?.engineer || "").trim()).find(Boolean);
    if (other) { engineer = other; engineerFromOther = true; }
  }
  return { dateIso, dateSource, engineer, engineerFromOther };
}
