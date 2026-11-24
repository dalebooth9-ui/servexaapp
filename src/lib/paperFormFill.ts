// Filling the Viva paper-form layout (paperFormRenderer) with answers from a
// converted paper sheet, so converted reports print on the same sheet as the
// QR-flow paperwork. Pure helpers only — the renderer draws.
import type { PdfTemplateField } from "@/lib/pdfBody";

export type FillImage = { dataUrl: string; width: number; height: number; format: "PNG" | "JPEG" };

export type PaperFormFill = {
  answers: Record<string, any>;
  issues?: string | null;
  recommendation?: string | null;
  priority?: string | null;
  /** Sheet items with no row on the form — printed, never dropped. */
  also?: string[];
  techName?: string | null;
  techDate?: string | null;
  custName?: string | null;
  custDate?: string | null;
  techSig?: FillImage | null;
  custSig?: FillImage | null;
};

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Answer value → printable text ("" when blank). */
export function fillText(v: any): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "YES" : "NO";
  if (Array.isArray(v)) return v.map(fillText).filter(Boolean).join(", ");
  if (typeof v === "object") return fillText(v.value ?? v.label ?? v.answer ?? "");
  return String(v).trim();
}

/** Which printed option ("YES / NO / N/A") the answer picks, if any. */
export function pickOption(options: string[], value: any): string | null {
  const t = norm(fillText(value));
  if (!t) return null;
  const alias: Record<string, string[]> = {
    YES: ["YES", "Y", "TRUE", "OK", "PASS", "GOOD"],
    NO: ["NO", "N", "FALSE", "FAIL"],
    NA: ["NA", "NOTAPPLICABLE", "N/A"],
    PASS: ["PASS", "OK", "YES", "SATISFACTORY"],
    FAIL: ["FAIL", "NO", "UNSATISFACTORY"],
    GOOD: ["GOOD", "G", "YES", "Y", "TRUE", "PASS", "OK"],
    FAIR: ["FAIR", "F", "AVERAGE"],
    POOR: ["POOR", "P", "NO", "N", "FALSE", "FAIL"],
  };
  const exact = options.find((o) => norm(o) === t);
  if (exact) return exact;
  return options.find((o) => (alias[norm(o)] || []).includes(t)) ?? null;
}

/** Outlet valve type answer → which of the four printed boxes to tick. */
export function pickValveChoices(value: any): string[] {
  const t = fillText(value).toUpperCase();
  if (!t) return [];
  const out: string[] = [];
  if (/PN\s*16/.test(t)) out.push("PN16 FLANGE");
  if (/TABLE\s*D/.test(t)) out.push("TABLE D FLANGE");
  if (/FEMALE/.test(t)) out.push("FEMALE THREAD");
  if (/(^|[^E])MALE/.test(t.replace(/FEMALE/g, ""))) out.push("MALE THREAD");
  return out;
}

const isRecordsQ = (s: string) => /7\.4\.6|inspection and test records/i.test(s);

/** Resolve the answer for a printed row, including the rows the paper form
 *  adds itself (cabinet keys, 7.4.6 records, outlet valve type). Returns the
 *  value plus the "also" item it consumed so it is not printed twice. */
export function resolveFillValue(
  field: PdfTemplateField,
  allFields: PdfTemplateField[],
  fill: PaperFormFill,
): { value: any; consumedAlso?: string } {
  const a = fill.answers || {};
  const byLabel = (re: RegExp) => {
    for (const f of allFields) if (re.test(f.label || "") && fillText(a[f.id])) return a[f.id];
    return undefined;
  };
  if (fillText(a[field.id])) return { value: a[field.id] };
  if (field.id === "cabinet_keys") return { value: byLabel(/cabinet\s*key/i) ?? a._scan_header?.cabinet_keys };
  if (field.id === "outlet_valve_type") return { value: byLabel(/valve\s*type/i) ?? a._scan_header?.valve_type };
  if (field.id === "inspection_records_complete") {
    const v = byLabel(/7\.4\.6|inspection and test records/i);
    if (fillText(v)) return { value: v };
    const item = (fill.also || []).find(isRecordsQ);
    if (item) return { value: item.split(":").slice(1).join(":").trim(), consumedAlso: item };
    return { value: undefined };
  }
  if (/number\s+of\s+outlets|no\.?\s+of\s+outlets/i.test(field.label)) return { value: a._number_of_outlets };
  return { value: undefined };
}
