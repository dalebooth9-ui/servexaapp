// Sheet questions/answers the chosen template has no row for.
export type UnmappedItem = { label: string; value?: string | null };

/** Clean list of sheet items the template has no question for. */
export function cleanUnmapped(items: any): UnmappedItem[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: UnmappedItem[] = [];
  for (const it of items) {
    const label = String(it?.label ?? "").trim();
    if (!label) continue;
    const value = String(it?.value ?? "").trim();
    const key = `${label.toLowerCase()}|${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, value });
  }
  return out;
}

/** Printed block for sheet items with no matching question. */
export function unmappedNotesText(items: UnmappedItem[]): string {
  const clean = cleanUnmapped(items);
  if (!clean.length) return "";
  return ["Also on the paper sheet:", ...clean.map((i) => `• ${i.label}${i.value ? `: ${i.value}` : ""}`)].join("\n");
}

