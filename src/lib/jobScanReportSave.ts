// jobScanReportSave — confirm step for the job-scoped "Scan Paper Report" flow.
//
// The engineer is already standing on a known job, so there is no job matching,
// no customer/site guessing and no paper_scan_batches queue row. We only need
// the two outputs the flow promises:
//
//   A) the ORIGINAL scan pages, filed on the job as `submissions` rows so they
//      show up in the job's Documents section,
//   B) the EXTRACTED fields, written as a `job_sheet_responses` row so the scan
//      becomes a real digital report for the job (same table the electronic
//      forms and report PDFs read from).
//
// Nothing is invented here: whatever the reviewer confirmed in the review panel
// is exactly what gets stored.

import { supabase } from "@/integrations/supabase/client";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";
import { buildDurableRef } from "@/lib/durableStorageRef";

export type SaveJobScanReportInput = {
  jobId: string;
  templateId: string;
  templateName: string;
  userId: string;
  /** Original scan pages, in page order. */
  images: File[];
  /** Reviewer-confirmed template field values. */
  responses: Record<string, any>;
  /** Reviewer-confirmed header values (customer, site, date, engineer…). */
  header: Record<string, any>;
  /** Optional per-field reviewer notes from the review panel. */
  fieldNotes?: Record<string, string>;
};

export type SaveJobScanReportResult = {
  responseId: string | null;
  uploadedPages: number;
  failedPages: number;
  /** Set when the pages saved but the digital report insert failed. */
  responseError: string | null;
};

function safeSlug(s: string): string {
  return (s || "scan")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "scan";
}

export async function saveJobScanReport(
  input: SaveJobScanReportInput,
): Promise<SaveJobScanReportResult> {
  const {
    jobId,
    templateId,
    templateName,
    userId,
    images,
    responses,
    header,
    fieldNotes,
  } = input;

  const stamp = Date.now();
  const slug = safeSlug(templateName);
  let uploadedPages = 0;
  let failedPages = 0;
  const storedPaths: string[] = [];

  // ── A) original scan pages → submissions ───────────────────────────────
  for (let i = 0; i < images.length; i++) {
    const file = images[i];
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const fileName = `paper-report-${slug}-p${i + 1}-${stamp}.${ext}`;
    const relPath = `${jobId}/${fileName}`;
    try {
      const storagePath = await buildOrgPathAsync(relPath);
      const { error: upErr } = await supabase.storage
        .from("submissions")
        .upload(storagePath, file, {
          contentType: file.type || "image/jpeg",
        });
      if (upErr) throw upErr;

      const { error: subErr } = await supabase.from("submissions").insert({
        job_id: jobId,
        engineer_id: userId,
        type: "document",
        file_url: buildDurableRef("submissions", storagePath),
        file_name: fileName,
        content: `Scanned paper report — ${templateName} (page ${i + 1} of ${images.length})`,
      } as any);
      if (subErr) throw subErr;

      storedPaths.push(storagePath);
      uploadedPages++;
    } catch (err) {
      console.error("[jobScanReportSave] page upload failed", err);
      failedPages++;
    }
  }

  // ── B) extracted fields → job_sheet_responses ──────────────────────────
  const payload: Record<string, any> = {
    ...responses,
    _scan_source: "paper_scan_job_page",
    _scan_header: header || {},
    _scan_image_paths: storedPaths,
    _scan_captured_at: new Date().toISOString(),
  };
  const notes = Object.fromEntries(
    Object.entries(fieldNotes || {}).filter(([, v]) => String(v || "").trim()),
  );
  if (Object.keys(notes).length > 0) payload._scan_field_notes = notes;

  let responseId: string | null = null;
  let responseError: string | null = null;
  try {
    const { data, error } = await supabase
      .from("job_sheet_responses")
      .insert({
        job_id: jobId,
        template_id: templateId,
        responses: payload as any,
        submitted_by: userId,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      } as any)
      .select("id")
      .single();
    if (error) throw error;
    responseId = (data as any)?.id ?? null;
  } catch (err: any) {
    console.error("[jobScanReportSave] response insert failed", err);
    responseError = err?.message || "Could not save the digital report.";
  }

  return { responseId, uploadedPages, failedPages, responseError };
}
