// reportReview — client side of the "Submit to office" / review workflow.
// Builds one merged PDF of a job's submitted reports, uploads it under the
// org-prefixed path, and calls the `report-review` edge function. Offline
// submissions are queued in localStorage and replayed on reconnect.
import { hiddenFieldIds } from "@/lib/reportModeSwitch";
import { PDFDocument } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { generateJobSheetPdf } from "@/components/JobSheetPdfExport";
import { isEmptyValue, isFieldRequired, isResponseStarted } from "@/lib/reportFieldRules";

const QUEUE_KEY = "reportReview:submitQueue:v1";

type QueuedSubmit = { jobId: string; clientRequestId: string; queuedAt: string };

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type MissingField = { responseId: string; templateId: string; templateName: string; fieldId: string; label: string };

type ReportRow = {
  id: string;
  status: string;
  responses: Record<string, any> | null;
  job_sheet_templates?: { fields?: any[] } | null;
};

export type ReportCompletionSummary = {
  total: number;
  completed: number;
  untouchedIds: string[];
  unfinishedIds: string[];
};

/** Classify reports by actual entered answers. Job-prefilled values are part
 * of the template response, so only real template input fields count. */
export function classifyReportsForCompletion(rows: ReportRow[]): ReportCompletionSummary {
  const active = rows.filter((r) => r.status !== "not_used");
  const drafts = active.filter((r) => r.status === "draft");
  const started = (r: ReportRow) => isResponseStarted(r.responses, r.job_sheet_templates?.fields || []);
  return {
    total: rows.length,
    completed: rows.filter((r) => r.status === "submitted").length,
    untouchedIds: drafts.filter((r) => !started(r)).map((r) => r.id),
    unfinishedIds: drafts.filter(started).map((r) => r.id),
  };
}

export async function getReportCompletionSummary(jobId: string): Promise<ReportCompletionSummary> {
  const { data, error } = await supabase
    .from("job_sheet_responses")
    .select("id, status, responses, job_sheet_templates(fields)")
    .eq("job_id", jobId)
    .is("archived_at", null);
  if (error) throw error;
  return classifyReportsForCompletion((data || []) as ReportRow[]);
}

export async function markUntouchedReportsNotUsed(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase
    .from("job_sheet_responses")
    .update({ status: "not_used", submitted_at: null } as any)
    .in("id", ids)
    .eq("status", "draft");
  if (error) throw error;
}

/** Submitted reports are the only reports included in office/customer PDFs. */
async function loadSubmitted(jobId: string) {
  const { data, error } = await supabase
    .from("job_sheet_responses")
    .select("id, template_id, responses, submitted_at, status, skipped_at, created_at, updated_at, job_sheet_templates(id, name, fields, branding)")
    .eq("job_id", jobId)
    .is("skipped_at", null)
    .eq("status", "submitted")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as any[];
}

/** Required fields left blank on forms the engineer has started. */
export async function findMissingRequired(jobId: string): Promise<{ hasReports: boolean; missing: MissingField[] }> {
  const rows = await loadSubmitted(jobId);
  const missing: MissingField[] = [];
  for (const r of rows) {
    const tpl = r.job_sheet_templates;
    const fields: any[] = tpl?.fields || [];
    const data = (r.responses || {}) as Record<string, any>;
    const omitted: string[] = Array.isArray(data.__omitted_sections__) ? data.__omitted_sections__ : [];
    for (const f of fields) {
      if (!isFieldRequired(f)) continue;
      if (omitted.includes(f.section || "General")) continue;
      if (hiddenFieldIds(data).includes(String(f.id))) continue;
      if (isEmptyValue(data[f.id])) missing.push({ responseId: r.id, templateId: r.template_id, templateName: tpl?.name || "Report", fieldId: f.id, label: f.label });
    }
  }
  return { hasReports: rows.length > 0, missing };
}

/** Generate a single merged PDF of every submitted report and upload it. */
export async function buildAndUploadReportPdf(jobId: string): Promise<string | null> {
  const [{ data: job }, rows] = await Promise.all([
    supabase.from("jobs").select("id, org_id, address, customer, reference_number, customers(name), sites(name, address)").eq("id", jobId).single(),
    loadSubmitted(jobId),
  ]);
  if (!job) throw new Error("Job not found");
  if (!rows.length) return null;

  const merged = await PDFDocument.create();
  for (const r of rows) {
    const tpl = r.job_sheet_templates;
    const { base64 } = await generateJobSheetPdf(
      { id: tpl.id, name: tpl.name, description: null, fields: tpl.fields || [], branding: tpl.branding || {} } as any,
      r.responses || {},
      { address: (job as any).address, customer: (job as any).customer, customers: (job as any).customers, reference_number: (job as any).reference_number, site: (job as any).sites } as any,
      jobId,
      undefined,
      r.submitted_at,
    );
    const src = await PDFDocument.load(b64ToBytes(base64), { ignoreEncryption: true });
    (await merged.copyPages(src, src.getPageIndices())).forEach((p) => merged.addPage(p));
  }
  const bytes = await merged.save();
  const path = `${(job as any).org_id}/review/${jobId}/report-${Date.now()}.pdf`;
  const { error } = await supabase.storage.from("submissions").upload(path, new Blob([bytes as BlobPart], { type: "application/pdf" }), { contentType: "application/pdf", upsert: true });
  if (error) throw error;
  return path;
}

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("report-review", { body });
  if (error) {
    let msg = error.message;
    try { const j = await (error as any).context?.json?.(); if (j?.error) msg = typeof j.error === "string" ? j.error : JSON.stringify(j.error); } catch { /* ignore */ }
    throw new Error(msg);
  }
  return data as any;
}

export async function submitToOffice(jobId: string, clientRequestId: string) {
  const pdfPath = await buildAndUploadReportPdf(jobId);
  return invoke({ action: "submit", jobId, pdfPath, clientRequestId });
}

export function queueSubmit(jobId: string, clientRequestId: string) {
  const q = readQueue().filter((x) => x.jobId !== jobId);
  q.push({ jobId, clientRequestId, queuedAt: new Date().toISOString() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}
export function readQueue(): QueuedSubmit[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
}
export function isQueued(jobId: string) {
  return readQueue().some((x) => x.jobId === jobId);
}

let draining = false;
export async function drainSubmitQueue(): Promise<number> {
  if (draining || !navigator.onLine) return 0;
  draining = true;
  let sent = 0;
  try {
    for (const item of readQueue()) {
      try {
        await submitToOffice(item.jobId, item.clientRequestId);
        localStorage.setItem(QUEUE_KEY, JSON.stringify(readQueue().filter((x) => x.clientRequestId !== item.clientRequestId)));
        sent++;
        window.dispatchEvent(new CustomEvent("report-review:submitted", { detail: { jobId: item.jobId } }));
      } catch (e) {
        console.warn("[reportReview] queued submit failed, will retry", e);
      }
    }
  } finally {
    draining = false;
  }
  return sent;
}

export async function messageOffice(jobId: string, text: string, photos: File[]) {
  const photoPaths: string[] = [];
  if (photos.length) {
    const { data: job } = await supabase.from("jobs").select("org_id").eq("id", jobId).single();
    for (const f of photos.slice(0, 6)) {
      const path = `${(job as any).org_id}/office-messages/${jobId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error } = await supabase.storage.from("submissions").upload(path, f, { contentType: f.type || "image/jpeg" });
      if (!error) photoPaths.push(path);
    }
  }
  return invoke({ action: "message", jobId, text, photoPaths });
}

export type CustomerChannel = "email" | "whatsapp" | "both";
export const officeSendToCustomer = (jobId: string, pdfPath: string, channel: CustomerChannel = "email") =>
  invoke({ action: "send_customer", jobId, pdfPath, channel });
export const officeUnlockForEdit = (jobId: string) => invoke({ action: "edit", jobId });
export const officeReturnToEngineer = (jobId: string, reason: string) => invoke({ action: "return", jobId, reason });
