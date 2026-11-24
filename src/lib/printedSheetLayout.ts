// Which report templates print on the Viva printed-sheet layout (the same
// sheet the QR flow prints) when filled in — converted paper reports and
// tablet-filled reports alike. Pure helpers, safe for tests.

/** Dry riser (pressure test, visual, commissioning), wet riser, fire hydrant and sprinkler sheets. */
export function usesPrintedSheetLayout(name: string | null | undefined): boolean {
  const n = String(name || "");
  if (/retired/i.test(n)) return false;
  if (/dry\s*riser/i.test(n)) return /pressure\s*test|visual|commission/i.test(n);
  if (/wet\s*riser/i.test(n)) return true;
  if (/hydrant/i.test(n)) return true;
  // Sprinkler templates (BS 9251 / BS EN 12845) use the multi-page sheet with tables.
  if (/sprinkler|bs\s*9251|12845/i.test(n)) return true;
  return false;
}

/** True when the report has table rows (e.g. zone valves, flats) that only the report layout prints. */
export function hasTableAnswers(fields: Array<{ id: string; type?: string }>, answers: Record<string, any>): boolean {
  return (fields || []).some((f) => f.type === "repeating_table" && Array.isArray(answers?.[f.id]) && answers[f.id].length > 0);
}

/** Sprinkler sheets draw tables and last-visit remedials themselves (multi-page sheet). */
export function printedSheetHandlesTables(name: string | null | undefined): boolean {
  return /sprinkler|bs\s*9251|12845/i.test(String(name || "")) && !/retired/i.test(String(name || ""));
}
