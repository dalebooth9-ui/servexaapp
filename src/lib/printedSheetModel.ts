// Multi-page Viva printed sheet for sprinkler reports (BS 9251 residential,
// BS EN 12845 commercial). Pure model builder: turns a template + answers into
// header-independent blocks (section bands, question rows, tables) that
// src/workers/printedSheetPages.ts draws. Safe for tests.
import type { PdfTemplateField } from "@/lib/pdfBody";
import { fillText, pickOption } from "@/lib/paperFormFill";
import { isRatingField } from "@/lib/ratingFields";

export type SheetRow = { kind: "row"; label: string; answer: string; options?: string[]; picked?: string | null };
export type SheetTable = { kind: "table"; title: string; columns: string[]; rows: string[][] };
export type SheetBlock = { kind: "section"; label: string } | SheetRow | SheetTable;
export type SheetModel = { scope: string; compliance: string; standard: string; variant: SprinklerVariant; blocks: SheetBlock[]; issues: string };
export type SprinklerVariant = "commercial" | "block" | "house" | "mist";
export type SheetDefect = { title: string; location?: string | null; priority?: string | null };

const CARRIED = /^REMEDIAL WORKS OUTSTANDING/i;
const PLANT = /tank|pump|zone|valve set|monitor|panel/i;

export const realBreaks = (t: string) => String(t ?? "").replace(/\\r\\n|\\n|\\r/g, "\n");

/** Sprinkler report templates that print on the multi-page Viva sheet. */
export function isSprinklerSheet(name: string | null | undefined): boolean {
  const n = String(name || "");
  return !/retired/i.test(n) && /sprinkler|bs\s*9251|12845/i.test(n);
}

export function sprinklerStandard(name: string): "BS EN 12845" | "BS 9251:2021" {
  return /12845|commercial/i.test(name) ? "BS EN 12845" : "BS 9251:2021";
}

export function sprinklerVariant(name: string, answers: Record<string, any>): SprinklerVariant {
  if (sprinklerStandard(name) === "BS EN 12845") return "commercial";
  const t = `${fillText(answers?.property_type)} ${name}`;
  if (/single\s*dwelling|single\s*house|bungalow/i.test(t)) return "house";
  if (/care\s*home|sheltered|mist/i.test(t)) return "mist";
  return "block";
}

function activity(name: string, answers: Record<string, any>): string {
  if (/commission/i.test(name)) return "commissioning";
  if (/6\s*month|six\s*month|bi-?annual/i.test(name)) return "6 month inspection";
  if (/periodic/i.test(name)) return "periodic service";
  if (/annual/i.test(name)) return "annual service";
  const f = fillText(answers?.service_frequency);
  return f ? `${f.toLowerCase()} service` : "service";
}

export function sprinklerScope(name: string, answers: Record<string, any>): string {
  const std = sprinklerStandard(name); const v = sprinklerVariant(name, answers); const act = activity(name, answers).toUpperCase();
  const kind = v === "commercial" ? "SPRINKLER SYSTEM" : v === "mist" ? "RESIDENTIAL MIST SYSTEM (CARE HOME)" : v === "house" ? "RESIDENTIAL SPRINKLER (SINGLE DWELLING)" : "RESIDENTIAL SPRINKLER SYSTEM";
  return `SCOPE OF WORK: ${act} - ${kind} (${std})`;
}

export function sprinklerCompliance(name: string, answers: Record<string, any>): string {
  const std = sprinklerStandard(name); const v = sprinklerVariant(name, answers);
  const what = v === "commercial" ? "sprinkler system" : v === "mist" ? "residential mist system" : "residential sprinkler system";
  return `We have, today, carried out a ${what} ${activity(name, answers)} to the requirements of ${std}.`;
}

/** Header rows (customer, site, ref, date, engineer, signatures) print in the header/sign-off, not the body. */
export function isHeaderField(f: PdfTemplateField): boolean {
  const t = String(f.type || "").toLowerCase();
  if (["signature", "photo", "photo_gallery", "image", "file"].includes(t)) return true;
  const id = String(f.id || "").toLowerCase();
  if (["site_name", "site_address", "reference", "date", "engineer", "customer_name"].includes(id)) return true;
  const l = String(f.label || "").toLowerCase().replace(/[:\s]+$/, "");
  return /^site (name|address)$|^reference( \/ job number)?$|^inspection date$|^engineer name$|customer representative name|signature$/.test(l);
}

const ukDate = (v: string) => { const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : v; };

function cellText(type: string | undefined, v: any): string {
  const t = String(type || "").toLowerCase();
  if (v === true) return "Yes"; if (v === false) return "No";
  const s = realBreaks(fillText(v));
  if (/yn|yes_no|checkbox|boolean/.test(t)) { const u = s.toUpperCase(); if (["Y", "YES", "TRUE"].includes(u)) return "Yes"; if (["N", "NO", "FALSE"].includes(u)) return "No"; if (["NA", "N/A"].includes(u)) return "N/A"; }
  return /date/.test(t) ? ukDate(s) : s;
}

/** One printed question row: options with the chosen one boxed, else the written answer. Fair is kept. */
export function rowFor(f: PdfTemplateField, answers: Record<string, any>): SheetRow {
  const t = String(f.type || "").toLowerCase().replace(/[-\s]+/g, "_");
  const v = answers?.[f.id];
  const note = realBreaks(fillText(answers?.[`${f.id}_notes`] ?? answers?.[`${f.id}_note`]));
  const label = String(f.label || "").trim();
  let options: string[] | undefined;
  if (isRatingField(f as any)) options = ["GOOD", "FAIR", "POOR", "N/A"];
  else if (["checkbox", "yes_no", "yesno", "boolean", "toggle", "yn_na"].includes(t)) options = ["YES", "NO", "N/A"];
  else if (t === "pass_fail" || t === "passfail") options = ["PASS", "FAIL", "N/A"];
  else if (Array.isArray((f as any).options) && (f as any).options.length) options = (f as any).options.map((o: any) => String(o?.label ?? o?.value ?? o).trim().toUpperCase()).filter(Boolean);
  const raw = typeof v === "boolean" ? (v ? "YES" : "NO") : v;
  let picked: string | null = null;
  if (options) picked = pickOption(options, raw);
  let answer = "";
  if (options && picked) answer = options.join(" / ").length > 44 ? picked : options.join(" / ");
  else answer = cellText(t, v) || (options && options.join(" / ").length <= 44 ? options.join(" / ") : "");
  if (options && picked && answer === picked) options = [picked];
  if (note) answer = answer ? `${answer}\nNote: ${note}` : `Note: ${note}`;
  return { kind: "row", label, answer, options: options && picked ? options : undefined, picked: options && picked ? picked : null };
}

/** A repeating table (zone valves, flats, pumps, valve sets, rooms) as a printed table. */
export function tableFor(f: PdfTemplateField, answers: Record<string, any>): SheetTable {
  const cols = (((f as any).columns || []) as any[]).filter((c) => !/photo|image|file|signature/i.test(String(c.type || "")));
  const rows = tableRows(answers?.[f.id]);
  const body = rows
    .map((r) => cols.map((c) => cellText(c.type, r?.[c.id])))
    .filter((r) => r.some((c) => c !== ""));
  return { kind: "table", title: String(f.label || "").trim(), columns: cols.map((c) => String(c.label || c.id)), rows: body.length ? body : [["None recorded", ...cols.slice(1).map(() => "")]] };
}

/** Table answers are arrays, or JSON text on some saved reports. */
export function tableRows(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim().startsWith("[")) { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

/** Flats/units whose result is no answer / no access / refused → revisit list. */
export function revisitRows(t: SheetTable): string[][] {
  const ri = t.columns.findIndex((c) => /access|result/i.test(c));
  if (ri < 0) return [];
  return t.rows.filter((r) => /no\s*answer|no\s*access|refused/i.test(r[ri] || "")).map((r) => [r[0], r[ri]]);
}

const answered = (f: PdfTemplateField, a: Record<string, any>) => f.type === "repeating_table" ? tableRows(a?.[f.id]).length > 0 : !!fillText(a?.[f.id]);

export function buildSprinklerSheetModel(input: {
  name: string; fields: PdfTemplateField[]; answers: Record<string, any>;
  issues?: string | null; also?: string[]; defects?: SheetDefect[];
}): SheetModel {
  const { name, answers } = input;
  const variant = sprinklerVariant(name, answers);
  const order: string[] = []; const by = new Map<string, PdfTemplateField[]>();
  for (const f of input.fields || []) {
    if (isHeaderField(f)) continue;
    const s = f.section || "General";
    if (!by.has(s)) { by.set(s, []); order.push(s); }
    by.get(s)!.push(f);
  }
  // Last-visit remedials first.
  order.sort((a, b) => Number(CARRIED.test(b)) - Number(CARRIED.test(a)));
  const blocks: SheetBlock[] = []; const printed: string[] = []; const revisits: string[][] = [];
  // Sections the engineer marked "not applicable" are listed, not printed blank.
  const omitted: string[] = Array.isArray(answers?.__omitted_sections__) ? answers.__omitted_sections__.map(String) : [];
  const omittedSet = new Set(omitted.map((x) => x.toLowerCase()));
  const skipped: string[] = [];
  for (const sec of order) {
    let list = by.get(sec)!;
    if (omittedSet.has(sec.toLowerCase()) && !list.some((f) => answered(f, answers))) { skipped.push(sec); continue; }
    // Single houses print only the plant sections that were actually filled in.
    if (variant === "house" && PLANT.test(sec) && !list.some((f) => answered(f, answers))) continue;
    // "Is a tank/pump present?" answered No → only that question prints for the section.
    const present = list.find((f) => /_present$/.test(f.id));
    if (present && pickOption(["YES", "NO", "N/A"], answers?.[present.id]) === "NO") list = [present];
    blocks.push({ kind: "section", label: sec.toUpperCase() });
    for (const f of list) {
      if (f.type === "repeating_table") {
        const t = tableFor(f, answers); blocks.push(t); revisits.push(...revisitRows(t));
      } else {
        const r = rowFor(f, answers); blocks.push(r); if (r.answer) printed.push(r.answer);
      }
    }
  }
  if (skipped.length) blocks.push({ kind: "section", label: "NOT APPLICABLE ON THIS VISIT" }, { kind: "row", label: "Sections marked not applicable by the engineer", answer: skipped.join(", ") });
  if (revisits.length) blocks.push({ kind: "section", label: "REVISIT / NO ACCESS" }, { kind: "table", title: "Revisit list", columns: ["Flat / unit", "Result"], rows: revisits });
  const defects = (input.defects || []).filter((d) => String(d.title || "").trim());
  if (defects.length) blocks.push({ kind: "section", label: "REMEDIALS / DEFECTS RAISED" }, { kind: "table", title: "Defects raised", columns: ["Defect", "Location", "Priority"], rows: defects.map((d) => [realBreaks(d.title), d.location || "", d.priority || ""]) });
  const iss = realBreaks(String(input.issues || "")).trim();
  const issues = [iss && !printed.some((p) => p.includes(iss)) ? iss : "", (input.also || []).length ? `Also on the paper sheet: ${(input.also || []).join("; ")}` : ""].filter(Boolean).join("\n");
  return { scope: sprinklerScope(name, answers), compliance: sprinklerCompliance(name, answers), standard: sprinklerStandard(name), variant, blocks, issues };
}
