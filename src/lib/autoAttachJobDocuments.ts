import { supabase } from "@/integrations/supabase/client";

export type CategoryKey = "pressure_test" | "visual" | "other";

export interface TemplateOption {
  id: string;
  name: string;
  category: string | null;
  job_category: string | null;
  fields: any;
  locked?: boolean | null;
}

export interface MatchSlot {
  /** Which qty bucket this slot belongs to */
  bucket: CategoryKey;
  /** 1-based index within the bucket (e.g. Pressure Test #1) */
  index: number;
  /** Candidate templates for this slot. If length === 1, no choice required. */
  candidates: TemplateOption[];
}

export interface AttachPlan {
  /** Slots that need a user choice (multiple matching templates) */
  needsChoice: MatchSlot[];
  /** Slots that already have a single deterministic match — auto-attach */
  autoSlots: { bucket: CategoryKey; index: number; template: TemplateOption }[];
  /** Buckets with no matching templates at all (informational) */
  noMatches: CategoryKey[];
}

interface BuildPlanInput {
  jobId: string;
  jobCategory: string | null;
  qtys: { pressure_test: number; visual: number; other: number };
  otherServiceType?: string | null;
}

/**
 * Builds the attachment plan: figures out, for each non-zero category qty,
 * how many extra draft sheet responses are needed and which template
 * candidates apply.
 */
export async function buildAttachPlan(input: BuildPlanInput): Promise<AttachPlan> {
  const { jobId, jobCategory, qtys, otherServiceType } = input;

  // Pull all templates + existing responses for this job in parallel
  const [tplsRes, respsRes] = await Promise.all([
    supabase.from("job_sheet_templates").select("id, name, category, job_category, fields, locked"),
    supabase.from("job_sheet_responses").select("id, template_id").eq("job_id", jobId),
  ]);

  const allTemplates = (tplsRes.data || []) as TemplateOption[];
  const existing = (respsRes.data || []) as { id: string; template_id: string | null }[];

  const plan: AttachPlan = { needsChoice: [], autoSlots: [], noMatches: [] };

  const buckets: { key: CategoryKey; target: number; matchCategory: string | null; preferJobCategory: string | null }[] = [
    { key: "pressure_test", target: qtys.pressure_test, matchCategory: "pressure_test", preferJobCategory: jobCategory },
    { key: "visual", target: qtys.visual, matchCategory: "visual", preferJobCategory: jobCategory },
    { key: "other", target: qtys.other, matchCategory: null, preferJobCategory: otherServiceType || jobCategory },
  ];

  for (const b of buckets) {
    if (!b.target || b.target <= 0) continue;

    // Candidate templates for this bucket
    let candidates = allTemplates.filter((t) => {
      if (b.matchCategory) return t.category === b.matchCategory;
      // "other" bucket: match by job_category or service type slug
      if (b.preferJobCategory && t.job_category) return t.job_category === b.preferJobCategory;
      return false;
    });

    // Narrow further by job_category when possible (preferred match)
    if (b.preferJobCategory) {
      const narrowed = candidates.filter((t) => t.job_category === b.preferJobCategory);
      if (narrowed.length > 0) candidates = narrowed;
    }

    if (candidates.length === 0) {
      plan.noMatches.push(b.key);
      continue;
    }

    // How many slots already filled for these candidates on this job?
    const candidateIds = new Set(candidates.map((c) => c.id));
    const alreadyAttached = existing.filter((r) => r.template_id && candidateIds.has(r.template_id)).length;
    const needed = Math.max(0, b.target - alreadyAttached);
    if (needed === 0) continue;

    for (let i = 0; i < needed; i++) {
      const slotIndex = alreadyAttached + i + 1;
      if (candidates.length === 1) {
        plan.autoSlots.push({ bucket: b.key, index: slotIndex, template: candidates[0] });
      } else {
        // Prefer locked (canonical) by default but still let admin pick
        const sorted = [...candidates].sort((a, c) => Number(!!c.locked) - Number(!!a.locked));
        plan.needsChoice.push({ bucket: b.key, index: slotIndex, candidates: sorted });
      }
    }
  }

  return plan;
}

interface InsertResponsesInput {
  jobId: string;
  userId: string;
  prefill: {
    customerName?: string | null;
    siteName?: string | null;
    siteAddress?: string | null;
    referenceNumber?: string | null;
    categoryLabel?: string | null;
  };
  slots: { template: TemplateOption }[];
}

/** Inserts draft job_sheet_responses for the given templates, with light prefill. */
export async function insertDraftResponses(input: InsertResponsesInput) {
  const { jobId, userId, prefill, slots } = input;
  if (slots.length === 0) return;

  const rows = slots.map(({ template }) => {
    const fields = (typeof template.fields === "string" ? JSON.parse(template.fields) : template.fields) as any[] | null;
    const responses: Record<string, any> = {};
    (fields || []).forEach((f: any) => {
      const label = (f.label || "").toLowerCase();
      if (label.includes("customer") && (label.includes("name") || label.includes("detail"))) {
        responses[f.id] = prefill.customerName || "";
      } else if (label === "customer") {
        responses[f.id] = prefill.customerName || "";
      } else if (label === "site" || (label.includes("site") && (label.includes("name") || label.includes("detail")))) {
        responses[f.id] = prefill.siteName || "";
      } else if (label === "site address" || label === "address") {
        responses[f.id] = prefill.siteAddress || "";
      } else if (label.includes("po") || label.includes("reference") || label === "ref" || label === "po/ref") {
        responses[f.id] = prefill.referenceNumber || "";
      } else if (label === "date" || label === "inspection date") {
        responses[f.id] = new Date().toISOString().split("T")[0];
      } else if (label.includes("scope") || label.includes("type of work") || label.includes("category")) {
        responses[f.id] = prefill.categoryLabel || "";
      }
    });

    return {
      job_id: jobId,
      template_id: template.id,
      submitted_by: userId,
      status: "draft" as const,
      responses,
    };
  });

  const { error } = await supabase.from("job_sheet_responses").insert(rows as any);
  if (error) throw error;
}
