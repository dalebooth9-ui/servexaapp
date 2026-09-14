import { supabase } from "@/integrations/supabase/client";

export type CategoryKey = "pressure_test" | "visual" | "other" | "category_default";

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
  /**
   * Every work type the job covers (jobs.detected_work_types). Each mapped
   * template for these slugs is attached, so a "pressure test + remedial"
   * job gets both sheets.
   */
  workTypes?: string[];
  /**
   * When > 0, add a fallback bucket that attaches a single canonical job sheet
   * matched purely by `job_category` (used for categories like sprinkler /
   * wet riser / fire hydrant that don't drive attachments through qty fields).
   * Existing attachments are still respected — no duplicates.
   */
  categoryDefaultQty?: number;
  /**
   * When true and nothing else resolves, fall back to the platform-default
   * sheet mapped to `general` so a job never shows zero forms.
   */
  guaranteeOne?: boolean;
}

/**
 * Builds the attachment plan: figures out, for each non-zero category qty,
 * how many extra draft sheet responses are needed and which template
 * candidates apply.
 */
export async function buildAttachPlan(input: BuildPlanInput): Promise<AttachPlan> {
  const { jobId, jobCategory, qtys, otherServiceType, categoryDefaultQty = 0, workTypes = [], guaranteeOne = false } = input;

  const slugs = Array.from(new Set([jobCategory, ...workTypes].filter(Boolean))) as string[];
  const lookupSlugs = guaranteeOne ? Array.from(new Set([...slugs, "general"])) : slugs;

  // Pull all templates + existing responses + per-job template locks + explicit
  // job-type→template mapping in parallel.
  const [tplsRes, respsRes, locksRes, mapRes] = await Promise.all([
    supabase.from("job_sheet_templates").select("id, name, category, job_category, fields, locked").eq("status", "published"),
    supabase.from("job_sheet_responses").select("id, template_id").eq("job_id", jobId),
    supabase.from("job_template_locks").select("bucket, template_id").eq("job_id", jobId),
    lookupSlugs.length
      ? supabase
          .from("job_category_template_map" as any)
          .select("template_id, sort_order, org_id, job_category_slug")
          .in("job_category_slug", lookupSlugs)
      : Promise.resolve({ data: [] as any[] }),
  ]);


  const allTemplates = (tplsRes.data || []) as TemplateOption[];
  const existing = (respsRes.data || []) as { id: string; template_id: string | null }[];
  const locks = (locksRes.data || []) as { bucket: CategoryKey; template_id: string }[];
  const lockByBucket = new Map<CategoryKey, string>(locks.map((l) => [l.bucket, l.template_id]));

  // Explicit mapping: templates the admin has wired to each job type.
  // Prefer org-specific rows over platform defaults when both exist.
  // NOTE: platform defaults carry org_id = null and must NOT be filtered out.
  const mapRows = ((mapRes as any).data || []) as { template_id: string; sort_order: number; org_id: string | null; job_category_slug: string }[];
  const templatesForSlug = (slug: string): TemplateOption[] => {
    const rows = mapRows.filter((r) => r.job_category_slug === slug);
    if (rows.length === 0) return [];
    const hasOrgRows = rows.some((r) => r.org_id !== null);
    const use = hasOrgRows ? rows.filter((r) => r.org_id !== null) : rows;
    const seen = new Set<string>();
    const out: TemplateOption[] = [];
    for (const r of [...use].sort((a, b) => a.sort_order - b.sort_order)) {
      if (seen.has(r.template_id)) continue;
      const t = allTemplates.find((x) => x.id === r.template_id);
      if (t) { seen.add(r.template_id); out.push(t); }
    }
    return out;
  };
  const mappedIds = new Set<string>();
  const mappedTemplates: TemplateOption[] = [];
  for (const slug of slugs) {
    for (const t of templatesForSlug(slug)) {
      if (mappedIds.has(t.id)) continue;
      mappedIds.add(t.id);
      mappedTemplates.push(t);
    }
  }


  const plan: AttachPlan = { needsChoice: [], autoSlots: [], noMatches: [] };

  const buckets: { key: CategoryKey; target: number; matchCategory: string | null; preferJobCategory: string | null }[] = [
    { key: "pressure_test", target: qtys.pressure_test, matchCategory: "pressure_test", preferJobCategory: jobCategory },
    { key: "visual", target: qtys.visual, matchCategory: "visual", preferJobCategory: jobCategory },
    { key: "other", target: qtys.other, matchCategory: null, preferJobCategory: otherServiceType || jobCategory },
    { key: "category_default", target: categoryDefaultQty, matchCategory: null, preferJobCategory: jobCategory },
  ];


  for (const b of buckets) {
    if (!b.target || b.target <= 0) continue;

    // Candidate templates for this bucket.
    // Priority 1: explicit mapping table (job_category_template_map) — this is
    // what an admin has wired for this job type. Applies to category_default
    // AND to pressure_test/visual/other buckets whose job category matches.
    let candidates: TemplateOption[] = [];
    if (mappedTemplates.length > 0) {
      if (b.key === "category_default") {
        candidates = [...mappedTemplates];
      } else if (b.matchCategory) {
        // Narrow explicit mapping to templates whose category matches the bucket
        // (e.g. pressure_test bucket → only pressure-test templates from the map).
        candidates = mappedTemplates.filter((t) => t.category === b.matchCategory || (t.job_category || "").includes(b.matchCategory!));
        // If the map has no bucket-specific template, fall through to legacy logic below.
      } else if (b.preferJobCategory) {
        candidates = mappedTemplates.filter((t) => t.job_category === b.preferJobCategory);
      }
    }

    // Priority 2 (legacy fallback): match by template.category / job_category.
    if (candidates.length === 0) {
      candidates = allTemplates.filter((t) => {
        if (b.matchCategory) return t.category === b.matchCategory;
        if (b.preferJobCategory && t.job_category) return t.job_category === b.preferJobCategory;
        return false;
      });

      // Narrow further by job_category when possible (preferred match)
      if (b.preferJobCategory) {
        const narrowed = candidates.filter((t) => t.job_category === b.preferJobCategory);
        if (narrowed.length > 0) candidates = narrowed;
      }

      // Priority 3: pressure_test/visual buckets never match by literal category
      // (no template uses category='pressure_test'). Fall back to the job's own
      // slug so e.g. a dry_riser_pressure_test job with pt qty=2 still gets 2×
      // Dry Riser — Pressure Test drafts. (Bug fix.)
      if (candidates.length === 0 && b.matchCategory && b.preferJobCategory) {
        candidates = allTemplates.filter((t) => t.job_category === b.preferJobCategory);
      }
    }

    // 🔒 Per-job template lock overrides everything
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

  // Every detected work type must contribute its mapped sheet, so a
  // "pressure test + remedial" job ends up with both forms — not just the one
  // the primary category points at.
  const plannedIds = new Set<string>([
    ...existing.map((r) => r.template_id || ""),
    ...plan.autoSlots.map((s) => s.template.id),
    ...plan.needsChoice.flatMap((s) => s.candidates.map((c) => c.id)),
  ]);
  for (const slug of workTypes) {
    if (!slug || slug === jobCategory) continue;
    const tpls = templatesForSlug(slug);
    if (tpls.length === 0) continue;
    // One sheet per work type (the first mapped/canonical one).
    const pick = [...tpls].sort((a, b) => Number(!!b.locked) - Number(!!a.locked))[0];
    if (plannedIds.has(pick.id)) continue;
    plannedIds.add(pick.id);
    plan.autoSlots.push({ bucket: "category_default", index: plan.autoSlots.length + 1, template: pick });
  }

  // Last resort — never leave a job with zero sheets.
  if (guaranteeOne && plan.autoSlots.length === 0 && plan.needsChoice.length === 0 && existing.length === 0) {
    const fallback = templatesForSlug("general")[0];
    if (fallback) plan.autoSlots.push({ bucket: "category_default", index: 1, template: fallback });
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

/** Inserts draft job_sheet_responses for the given templates, with full job-detail prefill.
 *  Also ensures a matching `job_documents` row (document_type = 'blank_job_sheet')
 *  exists for each template so the sheet shows up in the Documents tab.
 */
export async function insertDraftResponses(input: InsertResponsesInput) {
  const { jobId, userId, prefill, slots } = input;
  if (slots.length === 0) return;

  // Fetch the full job context once so every attached draft is fully prefilled
  // with customer / site / engineer / schedule / category details.
  const { fetchJobPrefillContext, buildJobSheetPrefill } = await import("./jobSheetPrefill");
  const ctx = await fetchJobPrefillContext(supabase, jobId);
  const jobInfo = ctx
    ? { ...ctx, categoryLabel: prefill.categoryLabel ?? ctx.categoryLabel ?? null }
    : {
        name: null,
        customer: prefill.customerName ?? null,
        customers: prefill.customerName ? { name: prefill.customerName, logo_url: null } : null,
        reference_number: prefill.referenceNumber ?? null,
        categoryLabel: prefill.categoryLabel ?? null,
        site: prefill.siteName || prefill.siteAddress
          ? { name: prefill.siteName ?? "", address: prefill.siteAddress ?? null, postcode: null, contact_name: null, contact_phone: null, contact_email: null, riser_location: null }
          : null,
      };

  const rows = slots.map(({ template }) => {
    const fields = (typeof template.fields === "string" ? JSON.parse(template.fields) : template.fields) as any[] | null;
    const responses = buildJobSheetPrefill(fields || [], jobInfo as any, template.name);
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
    // Upsert on the partial unique index (job_id, document_type, label)
    // for blank_job_sheet docs so concurrent auto-attach passes can't
    // create duplicate "Blank Job Sheet" rows.
    const { error: docErr } = await supabase
      .from("job_documents" as any)
      .upsert(docRows as any, { onConflict: "job_id,document_type,label", ignoreDuplicates: true });
    // Engineers can create their own sheet drafts but may not write job
    // documents — never let that block the sheet itself.
    if (docErr) console.warn("blank_job_sheet document row skipped", docErr.message);

  }
}
