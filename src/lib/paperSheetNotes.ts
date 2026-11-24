// Converted paper sheets: keep every sheet item on its own row.
// - literal "\n" from the scanner becomes a real line break
// - "INLET VALVE: …", "OUTLET VALVE: …" and key/contact lines move from the
//   free notes into their own rows when the template has them
// - sheet questions the template has no row for become new template rows
import type { UnmappedItem } from "./paperSheetItems";

/** Turn literal "\n" / "\r\n" text into real line breaks. */
export function realLineBreaks(v: any): any {
  if (typeof v !== "string") return v;
  return v.replace(/\\r\\n|\\n|\\r/g, "\n");
}

/** Apply realLineBreaks to every string answer (top level only). */
export function fixLineBreaksInAnswers<T extends Record<string, any>>(r: T): T {
  const out: Record<string, any> = { ...r };
  for (const [k, v] of Object.entries(out)) if (typeof v === "string") out[k] = realLineBreaks(v);
  return out as T;
}

const ACCESS_RE = /\b(keys?|key\s*safe|fob|code|ring|call|phone|contact|security cabin|reception|concierge|access)\b|\b0\d{9,10}\b/i;

export type SplitNotes = { inlet_valve: string; outlet_valve: string; access_notes: string; other: string };

/** Split a free-text notes block into inlet valve / outlet valve / access / other lines. */
export function splitSheetNotes(text: any): SplitNotes {
  const out: SplitNotes = { inlet_valve: "", outlet_valve: "", access_notes: "", other: "" };
  const access: string[] = []; const other: string[] = [];
  for (const raw of String(realLineBreaks(text ?? "")).split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const inlet = line.match(/^inlet\s*valves?\s*[:\-–]\s*(.+)$/i);
    const outlet = line.match(/^outlet\s*valves?\s*[:\-–]\s*(.+)$/i);
    if (inlet) out.inlet_valve = inlet[1].trim();
    else if (outlet) out.outlet_valve = outlet[1].trim();
    else if (ACCESS_RE.test(line)) access.push(line);
    else other.push(line);
  }
  out.access_notes = access.join("\n");
  out.other = other.join("\n");
  return out;
}

const fieldFor = (fields: any[], id: string, re: RegExp) =>
  fields.find((f) => f?.id === id) || fields.find((f) => re.test(String(f?.label || "")));

/**
 * Move inlet/outlet valve and access lines out of additional notes into the
 * template's own rows (only when the template has those rows and they are blank).
 */
export function applySheetNotes(r: Record<string, any>, fields: any[]): Record<string, any> {
  const next = fixLineBreaksInAnswers(r);
  const src = next.additional_notes ?? next._paper_pdf_input?.header?.additional_notes ?? "";
  if (!String(src).trim()) return next;
  const s = splitSheetNotes(src);
  const left: string[] = s.other ? [s.other] : [];
  const put = (key: keyof SplitNotes, id: string, re: RegExp) => {
    const val = s[key]; if (!val) return;
    const f = fieldFor(fields, id, re);
    if (!f) { left.push(key === "inlet_valve" ? `INLET VALVE: ${val}` : key === "outlet_valve" ? `OUTLET VALVE: ${val}` : val); return; }
    if (next[f.id] == null || String(next[f.id]).trim() === "") next[f.id] = val;
  };
  put("access_notes", "access_notes", /access\s*notes|keys?\s*\/\s*contact/i);
  put("inlet_valve", "inlet_valve", /^inlet\s*valve/i);
  put("outlet_valve", "outlet_valve", /^outlet\s*valve/i);
  next.additional_notes = left.join("\n") || null;
  if (next._paper_pdf_input?.header) {
    next._paper_pdf_input = { ...next._paper_pdf_input, header: { ...next._paper_pdf_input.header, additional_notes: next.additional_notes } };
  }
  return next;
}

const slug = (s: string) => s.toLowerCase().replace(/^\s*\d+[.)]\s*/, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48);
const YES_NO = /^(y|n|yes|no|n\/?a|✓|✔|x|ok|pass|fail|tick(ed)?)$/i;

/** A sheet item is a question (gets a row) unless it is long free text. */
export function isSheetQuestion(it: UnmappedItem): boolean {
  const label = String(it.label || "").trim();
  const value = String(it.value ?? "").trim();
  if (!label || label.length > 90) return false;
  if (/^(notes?|comments?|additional notes|other|misc|remarks?)$/i.test(label)) return false;
  if (value.length > 80) return false;
  return true;
}

/**
 * Sheet questions with no template row become new rows (appended to a
 * "From the paper sheet" section, or the item's own section). Returns the new
 * field list, the answers for those rows and the genuinely free-text leftovers.
 */
export function promoteUnmapped(fields: any[], items: UnmappedItem[]): {
  fields: any[]; added: any[]; answers: Record<string, any>; remaining: UnmappedItem[];
} {
  const out = [...fields];
  const added: any[] = []; const answers: Record<string, any> = {}; const remaining: UnmappedItem[] = [];
  const ids = new Set(out.map((f) => f?.id));
  const labels = new Map(out.map((f) => [String(f?.label || "").toLowerCase().replace(/[^a-z0-9]/g, ""), f]));
  for (const it of items) {
    if (!isSheetQuestion(it)) { remaining.push(it); continue; }
    const clean = String(it.label).replace(/^\s*\d+[.)]\s*/, "").replace(/\?\s*$/, "").replace(/^is\s+/i, "").trim();
    const label = clean.charAt(0).toUpperCase() + clean.slice(1);
    const value = String(it.value ?? "").trim();
    const existing = labels.get(label.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (existing) { answers[existing.id] = normaliseValue(existing, value); continue; }
    let id = slug(label) || "sheet_item"; let n = 2;
    while (ids.has(id)) id = `${slug(label)}_${n++}`;
    ids.add(id);
    const f = { id, label, type: YES_NO.test(value) ? "checkbox" : "text", section: (it as any).section || "From the paper sheet", required: false, _from_paper_sheet: true };
    out.push(f); added.push(f); labels.set(label.toLowerCase().replace(/[^a-z0-9]/g, ""), f);
    answers[id] = normaliseValue(f, value);
  }
  return { fields: out, added, answers, remaining };
}

function normaliseValue(f: any, value: string): any {
  if (f.type !== "checkbox") return value;
  if (/^(y|yes|✓|✔|ok|pass|tick(ed)?)$/i.test(value)) return "yes";
  if (/^(n|no|x|fail)$/i.test(value)) return "no";
  if (/^n\/?a$/i.test(value)) return "na";
  return value;
}

/**
 * Filing/redo step: add template rows for sheet questions with no row (kept on
 * the template for next time), move notes into their rows and fix line breaks.
 * If the template can't be updated the items stay in `_sheet_unmapped`.
 */
export async function placeSheetItems(
  supabase: any, templateId: string | null | undefined, fields: any[], responses: Record<string, any>, items: UnmappedItem[],
): Promise<{ responses: Record<string, any>; fields: any[]; added: number }> {
  let next = { ...responses };
  let allFields = fields;
  let added = 0;
  if (templateId && items.length) {
    const p = promoteUnmapped(fields, items);
    let ok = true;
    if (p.added.length) {
      const { error } = await supabase.from("job_sheet_templates").update({ fields: p.fields }).eq("id", templateId);
      if (error) { ok = false; console.warn("[paper-scan] couldn't add sheet rows to template", error.message); }
    }
    if (ok) {
      allFields = p.fields; added = p.added.length;
      for (const [k, v] of Object.entries(p.answers)) if (next[k] == null || String(next[k]).trim() === "") next[k] = v;
      next._sheet_unmapped = p.remaining;
      if (next._paper_pdf_input?.header) next._paper_pdf_input = { ...next._paper_pdf_input, header: { ...next._paper_pdf_input.header, unmapped_items: p.remaining } };
    }
  }
  next = applySheetNotes(next, allFields);
  return { responses: next, fields: allFields, added };
}

/** Hydrant header cell: "Hydrant 2 – CORNER OF NOBLE ST AND NELSON ST". */
export function hydrantLocationText(r: Record<string, any>, header?: Record<string, any> | null): string | null {
  const no = String(r.reference ?? header?.hydrant_no ?? "").trim();
  const loc = String(r.hydrant_location ?? "").trim();
  return [no && `Hydrant ${no}`, loc].filter(Boolean).join(" – ") || null;
}

/** Hydrant PO cell: a real customer PO only, never the hydrant number. */
export function hydrantPoText(jobPo: any, r: Record<string, any>): string {
  return String(jobPo || r.po_number || "").trim();
}
