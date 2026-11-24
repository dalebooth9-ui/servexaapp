// Drops scanner answers for questions that are not printed on the sheet
// (e.g. "Main Valve Condition: Satisfactory" on a hydrant sheet that has no
// such row). A question counts as on the sheet when any two adjacent words of
// its label (or its bracketed alternative) appear together in the OCR text.
// Header-type rows (site, customer, date, engineer, hydrant no, comments,
// notes) and overall result / remedial rows are kept. Pure; safe for tests.
const norm = (s: string) => ` ${String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
const KEEP = /site|customer|client|date|engineer|inspector|technician|reference|hydrant no|comment|note|signature|remedial|overall|result|location/i;

export function questionOnSheet(label: string, text: string): boolean {
  const t = norm(text);
  const parts = [String(label || "").replace(/\(.*?\)/g, " "), ...(String(label || "").match(/\((.*?)\)/g) || [])];
  for (const p of parts) {
    const w = norm(p).trim().split(" ").filter(Boolean);
    if (w.length < 2) return true; // single-word labels can't be checked reliably
    for (let i = 0; i < w.length - 1; i++) {
      if (w[i].length < 3 && w[i + 1].length < 3) continue;
      if (t.includes(` ${w[i]} ${w[i + 1]} `)) return true;
    }
  }
  return false;
}

export function dropAnswersNotOnSheet(extracted: Record<string, any>, fields: any[], text: string): { kept: Record<string, any>; dropped: string[] } {
  const kept = { ...extracted }; const dropped: string[] = [];
  if (!text || text.length < 50) return { kept, dropped };
  for (const f of fields || []) {
    if (!(f?.id in kept)) continue;
    if (f.type === "date" || KEEP.test(String(f.label || "")) || KEEP.test(String(f.id || ""))) continue;
    if (!questionOnSheet(String(f.label || ""), text)) { delete kept[f.id]; dropped.push(f.id); }
  }
  return { kept, dropped };
}
