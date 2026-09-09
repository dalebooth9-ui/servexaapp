/**
 * Carry forward remedial items from a source job's SUBMITTED job sheet
 * responses (and remedial-flavoured activity notes) onto a newly created
 * follow-up job as defects.
 *
 * Pure background logic — callers just await it after creating the new job.
 */
import { supabase } from "@/integrations/supabase/client";

const LABEL_HINTS = [
  "comment", "remedial", "defect", "recommendation",
  "observation", "finding", "action required", "further work",
];
const SECTION_HINTS = [
  "comment", "remedial", "defect", "recommendation", "observation", "finding",
];

const NON_REMEDIAL_LINE = /^(yes|no|n\/?a|na|pass|fail|ok|okay|none|nil|good|-+|comments?:?)$/i;

const NOTE_HINTS = /(remedial|defect|replace|repair|fix|faulty|damaged|missing|required|supply and fit)/i;

type TemplateField = { id?: string; label?: string; section?: string; type?: string };

function hits(value: unknown, hintList: string[]): boolean {
  const s = String(value || "").toLowerCase();
  if (!s) return false;
  return hintList.some((h) => s.includes(h));
}

/** Split a free-text remedial blob into individual work items. */
export function splitRemedialLines(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[-•*\u2022]\s*/, "").trim())
    .filter((l) => l.length > 2 && !NON_REMEDIAL_LINE.test(l));
}

export function isRemedialField(field: TemplateField): boolean {
  if (/signature|photo|file|image/i.test(String(field.type || ""))) return false;
  return hits(field.label, LABEL_HINTS) || hits(field.section, SECTION_HINTS);
}

export async function carryForwardRemedials(opts: {
  sourceJobId: string;
  newJobId: string;
  orgId?: string | null;
  siteId?: string | null;
  userId?: string | null;
}): Promise<number> {
  const { sourceJobId, newJobId } = opts;
  let orgId = opts.orgId ?? null;
  let siteId = opts.siteId ?? null;
  let userId = opts.userId ?? null;

  if (!orgId || !siteId) {
    const { data: job } = await supabase
      .from("jobs")
      .select("org_id, site_id")
      .eq("id", sourceJobId)
      .maybeSingle();
    orgId = orgId || (job as any)?.org_id || null;
    siteId = siteId || (job as any)?.site_id || null;
  }
  if (!userId) {
    const { data: auth } = await supabase.auth.getUser();
    userId = auth?.user?.id ?? null;
  }
  if (!orgId || !userId) return 0;

  const texts: string[] = [];

  // 1–4. Submitted job sheet responses → remedial comment lines
  const { data: responses } = await supabase
    .from("job_sheet_responses")
    .select("id, template_id, responses, status")
    .eq("job_id", sourceJobId)
    .eq("status", "submitted");

  const templateIds = Array.from(new Set((responses || []).map((r: any) => r.template_id).filter(Boolean)));
  const templateFields = new Map<string, TemplateField[]>();
  if (templateIds.length) {
    const { data: templates } = await supabase
      .from("job_sheet_templates")
      .select("id, fields")
      .in("id", templateIds);
    for (const t of templates || []) {
      const raw = (t as any).fields;
      const arr = Array.isArray(raw) ? raw : [];
      templateFields.set((t as any).id, arr as TemplateField[]);
    }
  }

  for (const r of (responses || []) as any[]) {
    const fields = templateFields.get(r.template_id) || [];
    let answers: Record<string, any> = {};
    if (r.responses && typeof r.responses === "object") answers = r.responses;
    else if (typeof r.responses === "string") {
      try { answers = JSON.parse(r.responses); } catch { answers = {}; }
    }
    for (const f of fields) {
      if (!f?.id || !isRemedialField(f)) continue;
      texts.push(...splitRemedialLines(answers[f.id]));
    }
  }

  // 6. Remedial-flavoured activity notes on the source job
  const { data: notes } = await supabase
    .from("job_activity_log")
    .select("action, details")
    .eq("job_id", sourceJobId)
    .eq("action", "note");
  for (const n of (notes || []) as any[]) {
    const detail = String(n.details || "");
    if (!NOTE_HINTS.test(detail)) continue;
    texts.push(...splitRemedialLines(detail).filter((l) => NOTE_HINTS.test(l)));
  }

  if (!texts.length) return 0;

  // Dedupe within the batch and against existing defects on the new job
  const { data: existing } = await supabase
    .from("defects")
    .select("description")
    .eq("job_id", newJobId);
  const seen = new Set((existing || []).map((d: any) => String(d.description || "").trim()));

  const rows = [] as any[];
  for (const text of texts) {
    const key = text.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push({
      job_id: newJobId,
      org_id: orgId,
      site_id: siteId,
      title: key.slice(0, 80),
      description: key,
      severity: /already completed/i.test(key) ? "low" : "medium",
      status: "open",
      reported_by: userId,
      source_kind: "job",
    });
  }

  if (!rows.length) return 0;
  const { error } = await supabase.from("defects").insert(rows as any);
  if (error) {
    console.error("carryForwardRemedials insert failed", error);
    return 0;
  }
  return rows.length;
}
