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

  // Pull all templates + existing responses + per-job template locks in parallel
  const [tplsRes, respsRes, locksRes] = await Promise.all([
    supabase.from("job_sheet_templates").select("id, name, category, job_category, fields, locked"),
    supabase.from("job_sheet_responses").select("id, template_id").eq("job_id", jobId),
    supabase.from("job_template_locks").select("bucket, template_id").eq("job_id", jobId),
  ]);

  const allTemplates = (tplsRes.data || []) as TemplateOption[];
  const existing = (respsRes.data || []) as { id: string; template_id: string | null }[];
  const locks = (locksRes.data || []) as { bucket: CategoryKey; template_id: string }[];
  const lockByBucket = new Map<CategoryKey, string>(locks.map((l) => [l.bucket, l.template_id]));

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

    // 🔒 If this bucket is locked to a specific template on this job, use only that one
    const lockedTemplateId = lockByBucket.get(b.key);
    if (lockedTemplateId) {
      const lockedTpl = allTemplates.find((t) => t.id === lockedTemplateId);
      if (lockedTpl) candidates = [lockedTpl];
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

/**
 * Persist a per-job template lock so the same template is always used for this
 * job + bucket combo on subsequent saves. Upsert on (job_id, bucket).
 */
export async function lockJobTemplate(
  jobId: string,
  bucket: CategoryKey,
  templateId: string,
  userId?: string | null
) {
  const { error } = await supabase
    .from("job_template_locks")
    .upsert(
      { job_id: jobId, bucket, template_id: templateId, created_by: userId ?? null },
      { onConflict: "job_id,bucket" }
    );
  if (error) throw error;
}

/** Remove a per-job template lock (allows the chooser to prompt again). */
export async function unlockJobTemplate(jobId: string, bucket: CategoryKey) {
  const { error } = await supabase
    .from("job_template_locks")
    .delete()
    .eq("job_id", jobId)
    .eq("bucket", bucket);
  if (error) throw error;
}

/** List all locks for a job (used by the Job Documents UI). */
export async function listJobTemplateLocks(jobId: string) {
  const { data, error } = await supabase
    .from("job_template_locks")
    .select("bucket, template_id, job_sheet_templates(name)")
    .eq("job_id", jobId);
  if (error) throw error;
  return (data || []) as { bucket: CategoryKey; template_id: string; job_sheet_templates: { name: string } | null }[];
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

/** Inserts draft job_sheet_responses for the given templates, with light prefill.
 *  Also ensures a matching `job_documents` row (document_type = 'blank_job_sheet')
 *  exists for each template so the sheet shows up in the Documents tab.
 */
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

  // Ensure each chosen template also surfaces in the Documents tab as a
  // `blank_job_sheet` row. Skip templates that already have one to avoid duplicates.
  const templateLabels = slots.map(({ template }) => template.name);
  const { data: existingDocs } = await supabase
    .from("job_documents" as any)
    .select("label")
    .eq("job_id", jobId)
    .eq("document_type", "blank_job_sheet")
    .in("label", templateLabels);
  const existingLabels = new Set((existingDocs as any[] | null || []).map((d: any) => (d.label || "").toLowerCase()));

  const docRows = slots
    .filter(({ template }) => !existingLabels.has((template.name || "").toLowerCase()))
    .map(({ template }) => ({
      job_id: jobId,
      document_type: "blank_job_sheet",
      label: template.name,
      file_url: null,
      file_name: null,
      source: "auto",
      created_by: userId,
    }));

  if (docRows.length > 0) {
    const { error: docErr } = await supabase.from("job_documents" as any).insert(docRows as any);
    if (docErr) throw docErr;
  }
}
