import { cheatSectionOrder } from "@/lib/plannerConfig";
/** Cheat-sheet notes. Sections are each company's own (Settings default: one "General" section). */
export interface CheatEntry { id: string; section: string; title: string; body: string | null; sort_order: number }
export function filterCheat(entries: CheatEntry[], q: string): CheatEntry[] {
  const t = q.trim().toLowerCase(); if (!t) return entries;
  return entries.filter((e) => `${e.section} ${e.title} ${e.body || ""}`.toLowerCase().includes(t));
}
export function sectionList(entries: CheatEntry[], configSections: string[]): string[] {
  return cheatSectionOrder(configSections, entries.map((e) => e.section));
}
/** Move one section up (-1) or down (+1). */
export function moveSection(list: string[], name: string, dir: -1 | 1): string[] {
  const i = list.indexOf(name), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const out = [...list]; [out[i], out[j]] = [out[j], out[i]]; return out;
}
