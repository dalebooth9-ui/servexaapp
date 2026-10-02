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

/** Forms the engineer actually used: not skipped, and either submitted or a
 *  draft with at least one answer. Drafts are dropped when the same form has
 *  already been submitted. */
async function loadActive(jobId: string) {
  const { data, error } = await supabase
    .from("job_sheet_responses")
    .select("id, template_id, responses, submitted_at, status, skipped_at, created_at, updated_at, job_sheet_templates(id, name, fields, branding)")
    .eq("job_id", jobId)
    .is("skipped_at", null)
    .in("status", ["submitted", "draft"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data || []) as any[];
  const submittedTpl = new Set(rows.filter((r) => r.status === "submitted").map((r) => r.template_id));
  return rows.filter((r) =>
    r.status === "submitted" ||
    (!submittedTpl.has(r.template_id) && wasEdited(r) && isResponseStarted(r.responses, r.job_sheet_templates?.fields || [])),
  );
}
const loadSubmitted = loadActive;
// Drafts are pre-filled with job details when created, so "has answers" alone
// isn't enough — the engineer must have saved it after creation.
function wasEdited(r: any) {
  if (!r.updated_at || !r.created_at) return true;
  return new Date(r.updated_at).getTime() - new Date(r.created_at).getTime() > 5000;
}

/** Required fields left blank on forms the engineer has started. */
export async function findMissingRequired(jobId: string): Promise<{ hasReports: boolean; missing: MissingField[] }> {
  const rows = await loadActive(jobId);
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

/** Promote started drafts to submitted so the office gets them. */
async function submitStartedDrafts(rows: any[]) {
  const drafts = rows.filter((r) => r.status === "draft");
  if (!drafts.length) return;
  const now = new Date().toISOString();
  await supabase.from("job_sheet_responses").update({ status: "submitted", submitted_at: now }).in("id", drafts.map((d) => d.id));
  drafts.forEach((d) => { d.status = "submitted"; d.submitted_at = now; });
}

/** Generate a single merged PDF of every submitted report and upload it. */
export async function buildAndUploadReportPdf(jobId: string): Promise<string> {
  const [{ data: job }, rows] = await Promise.all([
    supabase.from("jobs").select("id, org_id, address, customer, reference_number, customers(name), sites(name, address)").eq("id", jobId).single(),
    loadSubmitted(jobId),
  ]);
  await submitStartedDrafts(rows);
  if (!job) throw new Error("Job not found");
  if (!rows.length) throw new Error("No submitted report on this job yet");

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
