import { supabase } from "@/integrations/supabase/client";

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

export async function loadCarriedRemedials(jobId: string, assetId?: string | null): Promise<CarriedRemedial[]> {
  const { data, error } = await (supabase as any).rpc("job_carried_remedials", { p_job: jobId });
  if (error) throw error;
  const rows = ((data || []) as CarriedRemedial[]).filter((r) => r.carry_outcome !== "done");
  return assetId ? rows.filter((r) => !r.asset_id || r.asset_id === assetId) : rows;
}
