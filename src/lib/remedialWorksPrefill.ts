/**
 * Prefill for the generic "Remedial Works Report" sheet.
 *
 * Fills the works repeating-table from the job's remedial checklist items
 * (description, completed status, comments) and pairs in any Before/After
 * photos captured against each item, so the report mirrors what the engineer
 * ticked off on site. Never clobbers rows the engineer has already entered.
 */
import { supabase } from "@/integrations/supabase/client";

export type WorksRow = Record<string, any>;

function genId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {}
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** True when a template field is the remedial works table. */
export function isRemedialWorksField(field: { id: string; type: string; label: string }): boolean {
  if (field.type !== "repeating_table") return false;
  const l = (field.label || "").toLowerCase();
  return field.id === "works_table" || l.includes("remedial works") || l.includes("works carried out");
}

export async function buildRemedialWorksRows(jobId: string): Promise<WorksRow[]> {
  const [itemsRes, photosRes] = await Promise.all([
    supabase
      .from("job_remedial_items" as any)
      .select("id, seq, description, status, comment")
      .eq("job_id", jobId)
      .order("seq", { ascending: true }),
    supabase
      .from("job_photo_checklist_responses" as any)
      .select("remedial_item_id, before_photo_url, after_photo_url")
      .eq("job_id", jobId)
      .not("remedial_item_id", "is", null),
  ]);

  const items = ((itemsRes.data || []) as any[]) as { id: string; description: string; status: string; comment: string | null }[];
  if (items.length === 0) return [];

  const photos = new Map<string, { before?: string | null; after?: string | null }>();
  for (const p of ((photosRes.data || []) as any[])) {
    if (!p?.remedial_item_id) continue;
    photos.set(p.remedial_item_id, { before: p.before_photo_url, after: p.after_photo_url });
  }

  return items.map((it) => {
    const ph = photos.get(it.id) || {};
    return {
      id: genId(),
      description: it.description || "",
      completed: it.status === "done" ? "Y" : it.status === "na" ? "N/A" : "",
      photo_before: ph.before || "",
      photo_after: ph.after || "",
      comments: it.comment || "",
    } as WorksRow;
  });
}

/**
 * Returns a patch to merge into form data — only for works-table fields that
 * are currently empty.
 */
export async function buildRemedialWorksPrefill(
  fields: Array<{ id: string; type: string; label: string }>,
  jobId: string,
  current: Record<string, any>,
): Promise<Record<string, any>> {
  const targets = fields.filter(isRemedialWorksField);
  if (targets.length === 0) return {};
  const isEmpty = targets.every((f) => {
    const v = current?.[f.id];
    if (!v) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === "string") return v.trim() === "" || v.trim() === "[]";
    return false;
  });
  if (!isEmpty) return {};

  const rows = await buildRemedialWorksRows(jobId);
  if (rows.length === 0) return {};
  const patch: Record<string, any> = {};
  for (const f of targets) {
    const v = current?.[f.id];
    const empty = !v || (typeof v === "string" && (v.trim() === "" || v.trim() === "[]")) || (Array.isArray(v) && v.length === 0);
    if (empty) patch[f.id] = JSON.stringify(rows);
  }
  return patch;
}
