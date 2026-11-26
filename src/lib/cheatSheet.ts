/** Fixed starting sections for the engineers' cheat sheet (no values are pre-filled). */
export const CHEAT_SECTIONS = ["Glass bulb sizes", "Sprinkler cover plates (Viking, Reliable, Rapid Drop, Victaulic)", "Riser keys by customer", "Useful phone numbers"] as const;
export interface CheatEntry { id: string; section: string; title: string; body: string | null; sort_order: number }
export function filterCheat(entries: CheatEntry[], q: string): CheatEntry[] {
  const t = q.trim().toLowerCase(); if (!t) return entries;
  return entries.filter((e) => `${e.section} ${e.title} ${e.body || ""}`.toLowerCase().includes(t));
}
export function sectionList(entries: CheatEntry[]): string[] {
  const extra = [...new Set(entries.map((e) => e.section))].filter((s) => !(CHEAT_SECTIONS as readonly string[]).includes(s));
  return [...CHEAT_SECTIONS, ...extra];
}
