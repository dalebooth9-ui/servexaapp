/**
 * "Prefill from last visit" — copies only STABLE facts forward from the most
 * recent completed report for the same site + template (asset details, counts,
 * equipment info). Condition answers, pass/fail results, comments, dates,
 * photos and signatures are deliberately never copied: they must be observed
 * fresh on every visit.
 */

export type LastVisitField = { id: string; label: string; type: string; options?: string[] };

export type LastVisit = {
  responseId: string;
  jobId: string;
  jobReference?: string | null;
  date: string | null;
  answers: Record<string, any>;
};

/** Labels that describe something observed on the day — never carried forward. */
const VOLATILE_LABEL =
  /(sign|signature|comment|note|remark|observation|defect|fault|condition|result|pass|fail|satisfactor|date|time|photo|image|recommend|action|remedial|declaration|witness|weather|engineer|operative|attend|reading|pressure achieved|test)/i;

/** Field types that can never be copied forward. */
const VOLATILE_TYPE = /(signature|photo|file|image|checkbox|table|repeating)/i;

export function isStableField(field: LastVisitField): boolean {
  if (!field?.id || !field.id.trim()) return false;
  if (field.id.startsWith("_")) return false;
  if (VOLATILE_TYPE.test(field.type || "")) return false;
  // Multiple-choice answers are judgements about this visit.
  if (Array.isArray(field.options) && field.options.length > 0) return false;
  if (VOLATILE_LABEL.test(field.label || "")) return false;
  return true;
}

/** Values worth carrying forward from a previous report, keyed by field id. */
export function buildLastVisitPrefill(
  fields: LastVisitField[],
  previousAnswers: Record<string, any>,
  currentAnswers: Record<string, any>,
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of fields || []) {
    if (!isStableField(f)) continue;
    const prev = previousAnswers?.[f.id];
    if (prev === undefined || prev === null || prev === "" || typeof prev === "object") continue;
    const current = currentAnswers?.[f.id];
    if (current !== undefined && current !== null && current !== "") continue; // never overwrite
    out[f.id] = prev;
  }
  return out;
}

/**
 * Find the most recent submitted report for the same site and template on a
 * different job. Returns null when there is nothing to learn from.
 */
export async function findLastVisitReport(
  supabase: any,
  opts: { jobId: string; siteId?: string | null; templateId: string },
): Promise<LastVisit | null> {
  const { jobId, siteId, templateId } = opts;
  if (!siteId || !templateId) return null;

  const { data: siteJobs } = await supabase
    .from("jobs")
    .select("id, reference_number, completed_at")
    .eq("site_id", siteId)
    .neq("id", jobId);
  const jobIds = (siteJobs || []).map((j: any) => j.id);
  if (!jobIds.length) return null;

  const { data: rows } = await supabase
    .from("job_sheet_responses")
    .select("id, job_id, responses, submitted_at")
    .eq("template_id", templateId)
    .in("job_id", jobIds)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(1);

  const row: any = rows?.[0];
  if (!row) return null;

  let answers: Record<string, any> = {};
  const raw = row.responses;
  if (raw && typeof raw === "object") answers = raw as Record<string, any>;
  else if (typeof raw === "string") {
    try { answers = JSON.parse(raw); } catch { answers = {}; }
  }

  const job = (siteJobs || []).find((j: any) => j.id === row.job_id);
  return {
    responseId: row.id,
    jobId: row.job_id,
    jobReference: job?.reference_number ?? null,
    date: row.submitted_at || job?.completed_at || null,
    answers,
  };
}
