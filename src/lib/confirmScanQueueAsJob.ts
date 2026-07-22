// confirmScanQueueAsJob.ts — extracted from ScanCompletedJobDialog so the
// shared ScanReviewDialog (queue door, archive door — everything) can file a
// queue item as a job without pulling in the entire 1800-line dialog. The
// server-side logic is unchanged: `confirm_paper_scan_job` RPC + storage copy
// of the queue-item's page images into job_documents.
//
// The reviewer's job-mode confirm path calls this after the same UI edits
// (customer/site/date/answers/signatures) that the archive path uses.

import { supabase } from "@/integrations/supabase/client";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";

export type ConfirmScanAsJobInput = {
  userId: string;
  itemId: string;
  batchId: string | null;
  templateId: string;
  category: string;
  customerId: string;
  siteId: string;
  overrideJobName: string | null;
  existingJobId: string | null; // when appending scan to an existing job
  completionDate: string | null; // dd/mm/yyyy or ISO — we parse both
  dateKnown: boolean;
  responses: Record<string, any>;
  header: Record<string, any>;
  imagePaths: string[];
  // Optional captured signatures (customer/engineer manual crop, same as
  // archive door). Uploaded to `signatures` bucket and rowed into
  // job_signatures.
  customerSignatureBlob?: Blob | null;
  engineerSignatureBlob?: Blob | null;
};

export type ConfirmScanAsJobResult = {
  jobId: string;
  jobRef: string;
};

function parseCompletionToIso(raw: string | null, dateKnown: boolean): string {
  if (raw) {
    const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) {
      return new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00Z`).toISOString();
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return new Date(`${raw}T12:00:00Z`).toISOString();
    }
  }
  return new Date().toISOString();
}

export async function confirmScanQueueAsJob(
  input: ConfirmScanAsJobInput,
): Promise<ConfirmScanAsJobResult> {
  const {
    userId,
    itemId,
    templateId,
    category,
    customerId,
    siteId,
    overrideJobName,
    existingJobId,
    completionDate,
    dateKnown,
    responses,
    header,
    imagePaths,
    customerSignatureBlob,
    engineerSignatureBlob,
  } = input;

  const completedAt = parseCompletionToIso(completionDate, dateKnown);

  const fullResponses: Record<string, any> = {};
  for (const [k, v] of Object.entries(responses)) {
    if (v === undefined || v === null || v === "") continue;
    fullResponses[k] = v;
  }
  if (header.po_ref && !fullResponses["po_number"]) {
    fullResponses.po_number = String(header.po_ref);
  }
  if (completionDate && !fullResponses["date"]) {
    fullResponses.date = completionDate;
  }
  if (header.engineer && !fullResponses["technician_name"]) {
    fullResponses.technician_name = header.engineer;
  }

  const poFromPaper =
    (header.po_ref ? String(header.po_ref) : "") ||
    (header.job_ref ? String(header.job_ref) : "");

  const { data: confirmRes, error: confirmErr } = await supabase.rpc(
    "confirm_paper_scan_job" as any,
    {
      _template_id: templateId,
      _customer_id: customerId,
      _site_id: siteId,
      _completed_at: completedAt,
      _date_known: dateKnown,
      _category: category,
      _responses: fullResponses,
      _customer_po: poFromPaper || null,
      _existing_job_id: existingJobId,
      _batch_item_id: itemId,
      _override_name: overrideJobName,
    },
  );
  if (confirmErr) throw confirmErr;
  const row = Array.isArray(confirmRes) ? confirmRes[0] : confirmRes;
  if (!row?.job_id) throw new Error("Confirm did not return a job id");
  const jobId: string = row.job_id;
  const jobRef: string = row.reference_number;

  // Copy the queue-item's original page images onto the job so they render
  // in job documents as the source scan.
  for (let i = 0; i < imagePaths.length; i++) {
    const src = imagePaths[i];
    const ext =
      src.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const safeName = `paper-scan-${i + 1}-${Date.now()}.${ext}`;
    const dest = `job-documents/${jobId}/${safeName}`;
    const { error: copyErr } = await supabase.storage
      .from("submissions")
      .copy(src, dest);
    if (copyErr) {
      console.error("[scan-confirm] copy failed", src, copyErr);
      continue;
    }
    const { data: urlData } = await supabase.storage
      .from("submissions")
      .createSignedUrl(dest, 60 * 60 * 24 * 365 * 5);
    await supabase.from("job_documents" as any).insert({
      job_id: jobId,
      document_type: "source_scan",
      label: `Original paper form (page ${i + 1})`,
      file_url: urlData?.signedUrl || null,
      file_name: safeName,
      source: "manual",
      created_by: userId,
    });
  }

  // Manually captured signatures — same bucket + row shape as normal in-app
  // sign-off. Optional; only fired when the reviewer used the cropper.
  const uploadSig = async (blob: Blob, role: "engineer" | "customer") => {
    const rel = `${userId}/${jobId}-${role}-paper-${Date.now()}.png`;
    const path = await buildOrgPathAsync(rel);
    const { error: upErr } = await supabase.storage
      .from("signatures")
      .upload(path, blob, { contentType: "image/png" });
    if (upErr) {
      console.error("[scan-confirm] signature upload failed", role, upErr);
      return;
    }
    const signerName = role === "customer"
      ? String(header.customer_signed_name || "").trim()
      : String(header.engineer || "Engineer").trim();
    await supabase.from("job_signatures" as any).insert({
      job_id: jobId,
      signer_id: userId,
      signer_name: signerName,
      signer_role: role,
      file_path: rel,
    });
  };
  if (customerSignatureBlob) await uploadSig(customerSignatureBlob, "customer");
  if (engineerSignatureBlob) await uploadSig(engineerSignatureBlob, "engineer");

  return { jobId, jobRef };
}
