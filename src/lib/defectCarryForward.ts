import { supabase } from "@/integrations/supabase/client";
import type { PdfTemplateField } from "@/lib/pdfBody";
import { format } from "date-fns";

const VERB_BASE: Record<string, string> = {
  securing: "secure", replacing: "replace", repairing: "repair", cleaning: "clean",
  painting: "paint", fixing: "fix", tightening: "tighten", lubricating: "lubricate",
  adjusting: "adjust", renewing: "renew", refitting: "refit", removing: "remove",
  labelling: "label", labeling: "label", sealing: "seal", greasing: "grease",
  testing: "test", servicing: "service", clearing: "clear", draining: "drain",
  fitting: "fit", installing: "install", resecuring: "re-secure", rehanging: "re-hang",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const tidy = (s: string) => s.replace(/^(the|a|an)\s+/i, "").replace(/[.\s]+$/, "").trim();

/** Best-effort works/materials suggestion from a defect's wording. Returns
 *  empty strings when nothing sensible can be inferred — never guesses parts. */
export function suggestWorksAndMaterials(title: string, description?: string | null): { works: string; materials: string } {
  const text = `${description || ""}`.trim() || title.trim();
  const tail = (s: string) => s.split(/[:—–-]\s+/).pop() || s;
  for (const src of [text, title]) {
    const t = tail(src).trim();
    let m = t.match(/^(.+?)\s+(?:needs|need|requires|require|to be)\s+(?:to be\s+)?([a-z-]+)/i);
    if (m) {
      const verb = m[2].toLowerCase();
      const base = VERB_BASE[verb] ?? verb.replace(/ed$/, "");
      const noun = tidy(m[1]).toLowerCase();
      const works = `${cap(base)} ${noun}`;
      const materials = /^(replace|renew|fit|install|refit)$/.test(base) ? cap(noun) : "";
      return { works, materials };
    }
    m = t.match(/^(?:missing|no)\s+(.+)$/i) || t.match(/^(.+?)\s+(?:is\s+|are\s+)?missing\b/i);
    if (m) { const noun = tidy(m[1]); return { works: `Supply and fit ${noun.toLowerCase()}`, materials: cap(noun) }; }
    m = t.match(/^(.+?)\s+(?:is\s+|are\s+)?(?:damaged|broken|defective|faulty|seized|cracked)\b/i)
      || t.match(/^(?:damaged|broken|defective|faulty|seized|cracked)\s+(.+)$/i);
    if (m) { const noun = tidy(m[1]); return { works: `Repair or replace ${noun.toLowerCase()}`, materials: "" }; }
    m = t.match(/^(secure|replace|repair|clean|fit|install|remove|label|seal|adjust|renew|drain|clear)\s+(.+)$/i);
    if (m) return { works: cap(t.replace(/[.\s]+$/, "")), materials: /^(replace|renew|fit|install)$/i.test(m[1]) ? cap(tidy(m[2])) : "" };
  }
  return { works: "", materials: "" };
}

export type CarriedRemedial = {
  id: string; title: string; asset_id: string | null; riser: string | null;
  works_required: string | null; materials_required: string | null;
  visit_date: string | null; carry_outcome: string | null; carry_comment: string | null;
};

export type DefectAttachmentResult = { defect_id: string; outcome: string; job_id: string | null; job_ref: string | null; site_name: string | null; visit_date: string | null; report_name: string | null };
export function attachmentMessage(r: DefectAttachmentResult): string {
  if (r.outcome === "scheduled") return `Added to Job ${r.job_ref} (${r.site_name || "No site"}, ${r.visit_date ? format(new Date(`${r.visit_date}T12:00:00`), "d MMM") : "visit not scheduled"}) · ${r.report_name || "Service report"}`;
  return ({ no_site: "No site linked", no_visit: "No upcoming visit", site_mismatch: "Site doesn't match any job", customer_mismatch: "Customer doesn't match this job", closed: "Defect is already closed", not_found: "Defect not found or unavailable", job_unavailable: "Job is closed or unavailable" } as Record<string, string>)[r.outcome] || "Defect was not added";
}

export function remedialsForRiser(rows: CarriedRemedial[], assetId?: string | null) {
  return rows.filter(r => r.carry_outcome !== "done" && (!assetId || !r.asset_id || r.asset_id === assetId));
}

export function carriedReportFields(rows: CarriedRemedial[]): { fields: PdfTemplateField[]; answers: Record<string, string> } {
  const fields: PdfTemplateField[] = []; const answers: Record<string, string> = {};
  for (const r of rows) {
    const id = `carried_${r.id}`;
    fields.push({ id, label: `${r.riser || "General item"}: ${r.title}`, type: "textarea", required: false, section: "REMEDIAL WORKS OUTSTANDING FROM PREVIOUS VISIT" });
    answers[id] = [`Works required: ${r.works_required || r.title}`, `Materials required: ${r.materials_required || "—"}`, r.carry_outcome === "not_done" ? "Not done" : "Done / Not done", r.carry_comment ? `Comments: ${r.carry_comment}` : ""].filter(Boolean).join("\n");
  }
  return { fields, answers };
}

export async function loadCarriedRemedials(jobId: string, assetId?: string | null): Promise<CarriedRemedial[]> {
  const { data, error } = await (supabase as any).rpc("job_carried_remedials", { p_job: jobId });
  if (error) throw error;
  return remedialsForRiser((data || []) as CarriedRemedial[], assetId);
}
