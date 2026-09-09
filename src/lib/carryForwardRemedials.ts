/**
 * Carry forward remedial items from a source job's SUBMITTED job sheet
 * responses (and remedial-flavoured activity notes) onto a newly created
 * follow-up job as defects.
 *
 * Pure background logic — callers just await it after creating the new job.
 */
import { supabase } from "@/integrations/supabase/client";
import { parseRemedialItems, isRemedialItemsField } from "@/lib/remedialItems";

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

  // Structured remedial items always win where present; free-text lines are
  // still parsed so mixed templates (Comments + Remedial items) both carry.
  type Candidate = {
    description: string;
    severity: string;
    photo_ids: string[];
    responseId?: string | null;
  };
  const candidates: Candidate[] = [];

  for (const r of (responses || []) as any[]) {
    const fields = templateFields.get(r.template_id) || [];
    let answers: Record<string, any> = {};
    if (r.responses && typeof r.responses === "object") answers = r.responses;
    else if (typeof r.responses === "string") {
      try { answers = JSON.parse(r.responses); } catch { answers = {}; }
    }
    for (const f of fields) {
      if (!f?.id) continue;
      if (isRemedialItemsField(f)) {
        for (const item of parseRemedialItems(answers[f.id])) {
          if (!item.description) continue;
          candidates.push({
            description: item.description,
            // Verification items ("already completed, please check") are low.
            severity: item.already_completed ? "low" : item.severity,
            photo_ids: item.photo_ids,
            responseId: r.id,
          });
        }
        continue;
      }
      if (!isRemedialField(f)) continue;
      for (const line of splitRemedialLines(answers[f.id])) {
        candidates.push({
          description: line,
          severity: /already completed/i.test(line) ? "low" : "medium",
          photo_ids: [],
          responseId: r.id,
        });
      }
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
    for (const line of splitRemedialLines(detail).filter((l) => NOTE_HINTS.test(l))) {
      candidates.push({
        description: line,
        severity: /already completed/i.test(line) ? "low" : "medium",
        photo_ids: [],
      });
    }
  }

  if (!candidates.length) return 0;

  // Dedupe within the batch and against existing defects on the new job
  const { data: existing } = await supabase
    .from("defects")
    .select("description")
    .eq("job_id", newJobId);
  const seen = new Set((existing || []).map((d: any) => String(d.description || "").trim().toLowerCase()));

  const rows = [] as any[];
  for (const c of candidates) {
    const text = c.description.trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    rows.push({
      job_id: newJobId,
      org_id: orgId,
      site_id: siteId,
      title: text.slice(0, 80),
      description: text,
      severity: c.severity || "medium",
      status: "open",
      reported_by: userId,
      source_kind: "carried_forward",
      source_response_id: c.responseId || null,
      photos: c.photo_ids.length ? c.photo_ids : null,
      photo_url: c.photo_ids[0] || null,
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

