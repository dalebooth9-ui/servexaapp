import { supabase } from "@/integrations/supabase/client";

const INTERNAL_KEY = /^_/; // ignore internal keys like _site_photo_urls

function normalise(v: unknown): unknown {
  if (v === undefined || v === "") return null;
  return v;
}

function equal(a: unknown, b: unknown): boolean {
  const na = normalise(a);
  const nb = normalise(b);
  if (na === nb) return true;
  try {
    return JSON.stringify(na) === JSON.stringify(nb);
  } catch {
    return false;
  }
}

export type FieldMeta = { id: string; label: string };

export type LogReportEditsInput = {
  responseId: string;
  jobId: string;
  editorId: string;
  fields: FieldMeta[];
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  hasSignatures: boolean;
};

/**
 * Diff the previous response payload against the amended payload and persist
 * a per-field audit trail for office edits made to a submitted report.
 *
 * Also stamps `last_amended_at` / `last_amended_by` on the response row and
 * writes a summary entry to `job_activity_log` so the amendment appears in the
 * job history timeline alongside signatures and status changes.
 */
export async function logReportEdits(input: LogReportEditsInput): Promise<number> {
  const { responseId, jobId, editorId, fields, oldValues, newValues, hasSignatures } = input;
  const labelById = new Map(fields.map((f) => [f.id, f.label] as const));

  const keys = new Set<string>([
    ...Object.keys(oldValues || {}),
    ...Object.keys(newValues || {}),
  ]);

  const rows: Array<Record<string, unknown>> = [];
  for (const key of keys) {
    if (INTERNAL_KEY.test(key)) continue;
    const before = (oldValues || {})[key];
    const after = (newValues || {})[key];
    if (equal(before, after)) continue;
    rows.push({
      response_id: responseId,
      job_id: jobId,
      editor_id: editorId,
      field_id: key,
      field_label: labelById.get(key) ?? null,
      old_value: before === undefined ? null : before,
      new_value: after === undefined ? null : after,
      was_signed_at_time: hasSignatures,
    });
  }

  if (rows.length === 0) return 0;

  const { error: insErr } = await supabase
    .from("job_sheet_response_edits" as any)
    .insert(rows as any);
  if (insErr) {
    console.error("[logReportEdits] insert failed", insErr);
    throw insErr;
  }

  const now = new Date().toISOString();
  await supabase
    .from("job_sheet_responses")
    .update({ last_amended_at: now, last_amended_by: editorId } as any)
    .eq("id", responseId);

  const changedLabels = rows
    .map((r) => (r.field_label as string) || (r.field_id as string))
    .slice(0, 6)
    .join(", ");
  const suffix = rows.length > 6 ? ` (+${rows.length - 6} more)` : "";
  await supabase.from("job_activity_log" as any).insert({
    job_id: jobId,
    user_id: editorId,
    action: "report_amended",
    details: {
      response_id: responseId,
      changed_count: rows.length,
      changed_fields: changedLabels + suffix,
      after_signature: hasSignatures,
    },
  } as any);

  return rows.length;
}

export async function jobHasSignatures(jobId: string): Promise<boolean> {
  const { count } = await supabase
    .from("job_signatures" as any)
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);
  return (count ?? 0) > 0;
}
