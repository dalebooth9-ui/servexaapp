// Register-based residential sprinkler reports (sprinkler_reports) as a
// template + answers, so they print on the same multi-page Viva sheet as the
// template reports. Pure, safe for tests.
import type { PdfTemplateField } from "@/lib/pdfBody";
import { visibleSections } from "@/lib/sprinklerReport";
import { ZONE_CHECKS, VISIT_TYPE_LABEL, UNIT_RESULT_LABEL, SYSTEM_TYPE_LABEL, compareUnitLabels, type VisitType } from "@/lib/sprinklers";

const YN: Record<string, string> = { Y: "YES", N: "NO", NA: "N/A" };
const yn = (v: any) => YN[String(v ?? "").toUpperCase()] ?? v ?? "";

export function sprinklerReportSheet(input: {
  report: { visit_type?: string | null; answers?: any; unit_results?: any };
  system: { system_type?: string | null; register?: any } | null;
  units: Array<{ id: string; label: string; head_count?: number | null; revisit_pending?: boolean | null }>;
}): { name: string; fields: PdfTemplateField[]; answers: Record<string, any> } {
  const a: any = input.report.answers || {}; const reg: any = input.system?.register || {};
  const type = String(input.system?.system_type || "block");
  const visit = VISIT_TYPE_LABEL[input.report.visit_type as VisitType] || String(input.report.visit_type || "");
  const kind = type === "house" ? "Residential Sprinkler (Single House)" : type === "mist" ? "Residential Sprinkler (Care Home Mist)" : "Residential Sprinkler";
  const name = `${kind} — ${/bi-annual|6 month/i.test(visit) ? "6 Month Inspection" : `${visit} Service`} (BS 9251)`;
  const fields: PdfTemplateField[] = []; const answers: Record<string, any> = {};
  const add = (section: string, id: string, label: string, type: string, value: any, extra: Partial<PdfTemplateField> & Record<string, any> = {}) => {
    fields.push({ id, label, type, section, required: false, ...extra } as PdfTemplateField); answers[id] = value;
  };
  const sys = "System details";
  add(sys, "visit_type", "Visit type", "text", visit);
  add(sys, "property_type", "Property type", "text", SYSTEM_TYPE_LABEL[type as keyof typeof SYSTEM_TYPE_LABEL] || type);
  add(sys, "head_manufacturer", "Sprinkler head manufacturer", "text", reg.head_manufacturer || "");
  add(sys, "head_size", "Sprinkler head size", "text", reg.head_size || "");
  const nc = "Major non-compliances (BS 9251:2021)";
  [1, 2, 3].forEach((n) => { add(nc, `nc_${n}`, `Major non-compliance ${n}`, "text", a[`nc_${n}`] || ""); add(nc, `nc_${n}_ref`, "BS 9251:2021 clause ref", "text", a[`nc_${n}_ref`] || ""); });
  add(nc, "additional_defects", "Additional defects", "textarea", a.additional_defects || "");
  add(nc, "engineer_comments", "Engineer's comments", "textarea", a.engineer_comments || "");
  for (const s of visibleSections(type)) {
    const title = s.title.replace(/^\d+\.\s*/, "");
    (s.register || []).forEach(([k, l]) => add(title, `reg_${s.id}_${k}`, l, "text", reg[k] || ""));
    if (s.id === "zones") {
      const zs: any[] = Array.isArray(a.zones) ? a.zones : [];
      add(title, "zones", "Zone valves", "repeating_table", zs.map((z) => ({ name: z.name, ...Object.fromEntries(ZONE_CHECKS.map((c) => [c.id, z[c.id]])), pressure: z.pressure, sign: z.sign, notes: z.notes || z.note || "" })), {
        columns: [{ id: "name", label: "Zone valve / location", type: "text" }, ...ZONE_CHECKS.map((c) => ({ id: c.id, label: c.label, type: "yn_na" })), { id: "pressure", label: "Gauge (bar)", type: "text" }, { id: "sign", label: "Sign fitted", type: "yn_na" }, { id: "notes", label: "Notes", type: "text" }],
      });
      continue;
    }
    s.checks.forEach((c) => { add(title, c.id, c.label, "checkbox", yn(a[c.id]), { allow_na: true }); if (a[`${c.id}_note`]) answers[`${c.id}_notes`] = a[`${c.id}_note`]; });
    (s.values || []).forEach((v) => add(title, v.id, v.label, "text", a[v.id] || ""));
  }
  add("Summary", "overall_result", "Overall result", "text", a.overall_result || "");
  add("Summary", "summary", "Summary", "textarea", a.summary || "");
  const res: any = input.report.unit_results || {};
  const units = [...(input.units || [])].sort((x, z) => compareUnitLabels(x.label, z.label));
  if (units.length) {
    add("Flats / units", "flats", "Flat results", "repeating_table", units.map((u) => { const x = res[u.id] || {}; return { flat: u.label, result: x.result ? UNIT_RESULT_LABEL[x.result as keyof typeof UNIT_RESULT_LABEL] : "Not recorded", heads: x.heads ?? u.head_count ?? "", note: x.note || "" }; }), {
      columns: [{ id: "flat", label: "Flat no.", type: "text" }, { id: "result", label: "Result (OK / No access / Remedial)", type: "text" }, { id: "heads", label: "Heads", type: "text" }, { id: "note", label: "Notes", type: "text" }],
    });
  }
  return { name, fields, answers };
}
