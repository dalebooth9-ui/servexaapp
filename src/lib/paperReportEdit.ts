// Edit / redo for converted paper reports (job documents side-by-side viewer).
// The original scan pages are never touched; every replaced version of the
// answers is kept in `_previous_versions` so nothing is permanently lost.
import { supabase } from "@/integrations/supabase/client";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";
import { parseSheetDate, paperDateText } from "@/lib/paperReportDate";
import { siteDetailLines } from "@/lib/siteDetailsPrint";
import { refreshPaperReportPdfs } from "@/lib/updatePaperReportDate";
import { cleanUnmapped, type UnmappedItem } from "@/lib/paperSheetItems";
export { cleanUnmapped, unmappedNotesText, type UnmappedItem } from "@/lib/paperSheetItems";

/** True for a report row that came from a paper scan. */
export function isConvertedPaperResponse(responses: Record<string, any> | null | undefined): boolean {
  const r = responses || {};
  return Boolean(r._scan_source || r._paper_completion_at || r._paper_pdf_input);
}

/** Scan page storage paths saved on a converted report. */
export function paperScanPaths(responses: Record<string, any>): string[] {
  const a = responses?._scan_image_paths;
  const b = responses?._paper_pdf_input?.sourcePaths;
  const list = Array.isArray(a) && a.length ? a : Array.isArray(b) ? b : [];
  return list.filter((p: any) => typeof p === "string" && p);
}

/** Keep the old answers (minus earlier history) as a version entry. */
export function withPreviousVersion(
  responses: Record<string, any>,
  meta: { at: string; byUserId: string; reason: string; templateId: string | null },
): Record<string, any>[] {
  const prev = Array.isArray(responses._previous_versions) ? responses._previous_versions : [];
  const { _previous_versions: _drop, ...snapshot } = responses;
  return [...prev, { at: meta.at, by_user_id: meta.byUserId, reason: meta.reason, template_id: meta.templateId, responses: snapshot }];
}

/** Customer/site wording printed on the report always follows the chosen records. */
export function applyRecordIdentity(
  answers: Record<string, any>,
  fields: any[],
  ids: { customerName?: string | null; siteName?: string | null; siteAddress?: string | null },
): Record<string, any> {
  const next = { ...answers };
  const cust = String(ids.customerName || "").trim();
  for (const f of fields || []) {
    const label = String(f?.label || "").toLowerCase().replace(/[:\s]+$/, "").trim();
    if (!cust) continue;
    if (label === "customer details") {
      next[f.id] = siteDetailLines({ customer: cust, siteName: ids.siteName, address: ids.siteAddress }).join("\n");
    } else if (label === "customer name" || label === "customer") {
      next[f.id] = cust;
    }
  }
  return next;
}

async function logActivity(jobId: string, userId: string, action: string, details: string) {
  const { error } = await supabase.from("job_activity_log").insert({ job_id: jobId, user_id: userId, action, details } as any);
  if (error) console.warn("[paperReportEdit] activity log failed", error);
}

async function uploadSignature(userId: string, jobId: string, dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const dest = await buildOrgPathAsync(`${userId}/job-${jobId}-customer-edit-${Date.now()}.png`);
  const { error } = await supabase.storage.from("signatures").upload(dest, blob, { contentType: "image/png", upsert: false });
  if (error) throw new Error(`Couldn't save the customer signature: ${error.message}`);
  return dest;
}

/** Make sure the job has an electronic report document, then rebuild it. */
async function rebuildPdf(jobId: string, responseId: string, templateName: string, userId: string) {
  const { data: row } = await supabase.from("job_sheet_responses").select("responses").eq("id", responseId).single();
  const answers = ((row as any)?.responses || {}) as Record<string, any>;
  const docId = answers._paper_pdf_input?.documentId;
  let exists = false;
  if (docId) {
    const { data } = await supabase.from("job_documents").select("id").eq("id", docId).maybeSingle();
    exists = !!data;
  }
  if (!exists) {
    const { data: byLabel } = await supabase.from("job_documents").select("id").eq("job_id", jobId).eq("document_type", "report").eq("label", `Electronic report — ${templateName}`).maybeSingle();
    if (!byLabel) {
      const { data: doc, error } = await supabase.from("job_documents" as any).insert({
        job_id: jobId, document_type: "report", label: `Electronic report — ${templateName}`,
        file_name: `${templateName.toLowerCase().replace(/[^\w\-. ]+/g, "-")}.pdf`, source: "manual", created_by: userId,
      }).select("id").single();
      if (error) throw error;
      const { error: upErr } = await supabase.from("job_sheet_responses").update({
        responses: { ...answers, _paper_pdf_input: { ...(answers._paper_pdf_input || {}), documentId: (doc as any).id } } as any,
      }).eq("id", responseId);
      if (upErr) throw upErr;
    }
  }
  await refreshPaperReportPdfs(jobId, responseId);
}

export type SavePaperEditInput = {
  responseId: string;
  jobId: string;
  userId: string;
  userName: string;
  answers: Record<string, any>;
  dateText: string;
  customerId: string | null;
  siteId: string | null;
  riserId: string | null;
  engineerName: string;
  additionalNotes: string;
  unmapped: UnmappedItem[];
  customerSignature: { action: "keep" } | { action: "remove" } | { action: "add"; dataUrl: string };
};

export async function savePaperReportEdit(input: SavePaperEditInput): Promise<void> {
  const day = parseSheetDate(input.dateText);
  if (!day) throw new Error(`"${input.dateText}" isn't a date we can read. Use dd/mm/yyyy, e.g. 17/11/2026.`);
  const { data: row, error } = await supabase.from("job_sheet_responses").select("id, template_id, responses").eq("id", input.responseId).single();
  if (error) throw error;
  const { data: tpl, error: tErr } = await supabase.from("job_sheet_templates").select("name, fields").eq("id", (row as any).template_id).single();
  if (tErr) throw tErr;
  const old = ((row as any).responses || {}) as Record<string, any>;

  let customerName: string | null = null;
  if (input.customerId) {
    const { data } = await supabase.from("customers").select("name").eq("id", input.customerId).maybeSingle();
    customerName = (data as any)?.name ?? null;
  }
  let site: { name: string | null; address: string | null } | null = null;
  if (input.siteId) {
    const { data } = await (supabase as any).from("sites").select("name, address").eq("id", input.siteId).maybeSingle();
    site = data || null;
  }

  // Job links first so the report's customer/site/riser checks see the new values.
  const jobPatch: Record<string, any> = { customer_id: input.customerId, site_id: input.siteId, asset_id: input.riserId };
  if (customerName) jobPatch.customer = customerName;
  const { error: jErr } = await supabase.from("jobs").update(jobPatch as any).eq("id", input.jobId);
  if (jErr) throw jErr;

  const pdfInput = { ...(old._paper_pdf_input || {}) };
  const engineer = input.engineerName.trim();
  if (input.customerSignature.action === "remove") pdfInput.manualCustomerSignaturePath = null;
  if (input.customerSignature.action === "add") pdfInput.manualCustomerSignaturePath = await uploadSignature(input.userId, input.jobId, input.customerSignature.dataUrl);
  if (engineer !== String(old.technician_name || pdfInput.header?.engineer || "").trim()) {
    const { data: prof } = await supabase.from("profiles").select("full_name, signature_data").ilike("full_name", engineer).limit(1);
    const p = (prof as any[])?.[0];
    pdfInput.technicianName = p?.signature_data ? p.full_name : null;
  }
  const answers = applyRecordIdentity({ ...input.answers }, (tpl as any).fields || [], { customerName, siteName: site?.name, siteAddress: site?.address });
  pdfInput.header = {
    ...(pdfInput.header || {}),
    engineer,
    additional_notes: input.additionalNotes.trim() || null,
    riser_location: answers.riser_location ?? pdfInput.header?.riser_location ?? null,
    number_of_outlets: answers.number_of_outlets ?? pdfInput.header?.number_of_outlets ?? null,
    customer: customerName ?? pdfInput.header?.customer ?? null,
    unmapped_items: cleanUnmapped(input.unmapped),
  };
  const next: Record<string, any> = {
    ...old,
    ...answers,
    technician_name: engineer || answers.technician_name || null,
    additional_notes: input.additionalNotes.trim() || null,
    _sheet_unmapped: cleanUnmapped(input.unmapped),
    _paper_pdf_input: pdfInput,
    _paper_completion_at: `${day}T12:00:00.000Z`,
    date: paperDateText(day),
    _previous_versions: withPreviousVersion(old, { at: new Date().toISOString(), byUserId: input.userId, reason: "edited", templateId: (row as any).template_id }),
  };
  delete next._additional_notes;
  if (input.riserId) next.riser_asset_id = input.riserId; else delete next.riser_asset_id;
  const { error: uErr } = await supabase.from("job_sheet_responses").update({ responses: next as any }).eq("id", input.responseId);
  if (uErr) throw uErr;
  const { error: dErr } = await supabase.rpc("set_paper_report_completion_date", { _response_id: input.responseId, _date: day });
  if (dErr) throw dErr;
  await rebuildPdf(input.jobId, input.responseId, (tpl as any).name, input.userId);
  await logActivity(input.jobId, input.userId, "paper_report_edited", `Converted paper report (${(tpl as any).name}) edited by ${input.userName || "office"}`);
}

async function pathToBase64(path: string): Promise<{ image_base64: string; mime_type: string }> {
  const { data, error } = await supabase.storage.from("submissions").download(path);
  if (error || !data) throw new Error(`Couldn't open the original scan page: ${error?.message || path}`);
  const buf = new Uint8Array(await data.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { image_base64: btoa(bin), mime_type: data.type || "image/jpeg" };
}

export type RedoInput = { responseId: string; jobId: string; templateId: string; keepCopy: boolean; userId: string; userName: string };

/** Re-read the original scan and rebuild the electronic report. Returns unmapped count. */
export async function redoPaperConversion(input: RedoInput): Promise<{ unmapped: number; dateFromSheet: boolean }> {
  const { data: row, error } = await supabase.from("job_sheet_responses").select("id, template_id, responses").eq("id", input.responseId).single();
  if (error) throw error;
  const old = ((row as any).responses || {}) as Record<string, any>;
  const paths = paperScanPaths(old);
  if (!paths.length) throw new Error("The original scan pages aren't attached to this report, so it can't be read again.");
  const { data: tpl, error: tErr } = await supabase.from("job_sheet_templates").select("id, name, fields").eq("id", input.templateId).single();
  if (tErr) throw tErr;
  const images = [];
  for (const p of paths) images.push(await pathToBase64(p));
  const fields = ((tpl as any).fields || []).map((f: any) => ({ id: f.id, label: f.label, type: f.type, section: f.section, options: f.options, columns: f.columns, allow_notes: f.allow_notes }));
  const { data: ocr, error: oErr } = await supabase.functions.invoke("ocr-job-sheet", { body: { images, template_name: (tpl as any).name, fields } });
  if (oErr) throw new Error(`The scan couldn't be read again: ${oErr.message}`);
  if ((ocr as any)?.error) throw new Error((ocr as any).error);
  const extracted = ((ocr as any)?.extracted || {}) as Record<string, any>;
  const header = { ...((ocr as any)?.header || {}), _field_confidence: (ocr as any)?.field_confidence || {} } as Record<string, any>;
  const sheetDay = parseSheetDate(header.date) || parseSheetDate(extracted.date);
  const day = sheetDay || String(old._paper_completion_at || new Date().toISOString()).slice(0, 10);

  // Old electronic PDF: keep a visible copy when asked (the old answers are always kept).
  const oldDocId = old._paper_pdf_input?.documentId;
  if (input.keepCopy && oldDocId) {
    const { data: doc } = await supabase.from("job_documents").select("file_url, file_name, label").eq("id", oldDocId).maybeSingle();
    if ((doc as any)?.file_url) {
      const { error: cErr } = await supabase.from("job_documents" as any).insert({
        job_id: input.jobId, document_type: "report_previous", label: `Previous ${(doc as any).label || "electronic report"} (replaced ${paperDateText(new Date().toISOString())})`,
        file_url: (doc as any).file_url, file_name: `previous-${(doc as any).file_name || "report.pdf"}`, source: "manual", created_by: input.userId,
      });
      if (cErr) throw cErr;
    }
  }
  const keep = (k: string) => (old[k] !== undefined ? { [k]: old[k] } : {});
  const engineer = String(header.engineer || old.technician_name || "").trim();
  const next: Record<string, any> = {
    ...extracted,
    ...keep("riser_asset_id"), ...keep("_site_unit_id"), ...keep("_system_label"),
    ...keep("_scan_source"), ...keep("_scan_image_paths"), ...keep("_scan_captured_at"), ...keep("_handwritten_transcription"),
    ...keep("_site_photo_excluded"),
    _scan_header: header,
    technician_name: engineer || null,
    additional_notes: header.additional_notes || null,
    _sheet_unmapped: cleanUnmapped(header.unmapped_items),
    _paper_review_defects: [],
    _paper_completion_at: `${day}T12:00:00.000Z`,
    date: paperDateText(day),
    _paper_pdf_input: {
      ...(old._paper_pdf_input || {}),
      header: { ...header, po_ref: header.po_ref || old._paper_pdf_input?.header?.po_ref || null },
      sourcePaths: paths,
    },
    _previous_versions: withPreviousVersion(old, { at: new Date().toISOString(), byUserId: input.userId, reason: "redo conversion", templateId: (row as any).template_id }),
  };
  const { error: uErr } = await supabase.from("job_sheet_responses").update({ template_id: input.templateId, responses: next as any }).eq("id", input.responseId);
  if (uErr) throw uErr;
  if (oldDocId) await supabase.from("job_documents").update({ label: `Electronic report — ${(tpl as any).name}` }).eq("id", oldDocId);
  const { error: dErr } = await supabase.rpc("set_paper_report_completion_date", { _response_id: input.responseId, _date: day });
  if (dErr) throw dErr;
  await rebuildPdf(input.jobId, input.responseId, (tpl as any).name, input.userId);
  await logActivity(input.jobId, input.userId, "paper_report_reconverted", `Paper report read again as ${(tpl as any).name} by ${input.userName || "office"}${input.keepCopy ? " (old version kept)" : ""}`);
  return { unmapped: next._sheet_unmapped.length, dateFromSheet: !!sheetDay };
}
