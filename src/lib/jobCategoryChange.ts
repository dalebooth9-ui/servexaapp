import { supabase } from "@/integrations/supabase/client";
import { resolveJobPrintTemplate } from "@/lib/printTemplate";

/**
 * Changes a job's type within the job's own company. Updates the paperwork that
 * follows the type: swaps the auto-attached blank sheet for the new type's print
 * template (only when the old one was never started), sets the service interval
 * from that template, and logs the change. Never prints anything.
 * Returns whether reports had already been printed (so the caller can offer a reprint).
 */
export async function changeJobCategory(job: { id: string; org_id: string; category?: string | null; detected_work_types?: string[] | null }, newSlug: string, userId?: string | null) {
  const orgId = job.org_id;
  const { data: cats, error: catErr } = await supabase.from("job_categories").select("slug,name").eq("org_id", orgId).in("slug", [newSlug, job.category || ""]);
  if (catErr) throw catErr;
  const newCat = (cats || []).find((c: any) => c.slug === newSlug);
  if (!newCat) throw new Error("That job type isn't in your company's list.");
  const oldName = (cats || []).find((c: any) => c.slug === job.category)?.name || job.category || "None";

  const [oldTpl, newTpl] = await Promise.all([
    job.category ? resolveJobPrintTemplate({ org_id: orgId, category: job.category }) : Promise.resolve(null),
    resolveJobPrintTemplate({ org_id: orgId, category: newSlug }),
  ]);

  let interval: number | null = null;
  if (newTpl?.id) {
    const { data } = await supabase.from("service_intervals").select("interval_months").eq("org_id", orgId).eq("template_id", newTpl.id).eq("active", true).limit(1).maybeSingle();
    interval = (data as any)?.interval_months ?? null;
  }

  const update: Record<string, unknown> = { category: newSlug, category_suggestion: null, template_mismatch_reason: null };
  if (interval) update.recurrence_interval = interval;
  const { error } = await supabase.from("jobs").update(update as any).eq("id", job.id).eq("org_id", orgId);
  if (error) throw error;

  const notes: string[] = [];
  if (oldTpl?.id && oldTpl.id !== newTpl?.id) {
    const { count } = await supabase.from("job_sheet_responses").select("id", { count: "exact", head: true }).eq("job_id", job.id).eq("template_id", oldTpl.id);
    if (!count) {
      await supabase.from("job_documents").delete().eq("job_id", job.id).eq("org_id", orgId).eq("document_type", "blank_job_sheet").eq("source", "auto").eq("label", oldTpl.name || "");
      notes.push(`removed unused sheet "${oldTpl.name}"`);
    } else notes.push(`kept started sheet "${oldTpl.name}"`);
  }
  if (newTpl?.id && newTpl.id !== oldTpl?.id) {
    const { count } = await supabase.from("job_documents").select("id", { count: "exact", head: true }).eq("job_id", job.id).eq("document_type", "blank_job_sheet").eq("label", newTpl.name || "");
    if (!count) {
      await supabase.from("job_documents").insert({ job_id: job.id, org_id: orgId, document_type: "blank_job_sheet", label: newTpl.name, source: "auto", created_by: userId ?? null } as any);
      notes.push(`added sheet "${newTpl.name}"`);
    }
  }
  if (interval) notes.push(`service interval ${interval} months`);

  await supabase.from("job_activity_log").insert({
    job_id: job.id, org_id: orgId, user_id: userId ?? null, action: "category_changed",
    details: `Job type changed from ${oldName} to ${newCat.name}${notes.length ? ` (${notes.join(", ")})` : ""}`,
  } as any);

  const { count: printed } = await supabase.from("job_activity_log").select("id", { count: "exact", head: true }).eq("job_id", job.id).eq("action", "reports_printed");
  return { newName: newCat.name as string, printedBefore: (printed || 0) > 0 };
}

/** Records that Print reports was used, so a later type change can offer a reprint. */
export async function logReportsPrinted(jobId: string, userId?: string | null) {
  const { data: j } = await supabase.from("jobs").select("org_id").eq("id", jobId).maybeSingle();
  const orgId = (j as any)?.org_id;
  if (!orgId) return;
  await supabase.from("job_activity_log").insert({ job_id: jobId, org_id: orgId, user_id: userId ?? null, action: "reports_printed", details: "Engineer reports printed" } as any);
}
