/**
 * External RAMS — risk assessments / method statements produced outside
 * Servexa (a client's, a principal contractor's, or one written in Word).
 *
 * They are stored as ordinary `rams_documents` rows flagged `is_external`, so
 * every existing RAMS check (completion gate, engineer preview, customer job
 * pack, "RAMS present/approved" indicators) counts them exactly like a
 * generated RAMS. The file itself lives in the `submissions` bucket under the
 * job, and is mirrored into `job_documents` (document_type 'external_rams')
 * so engineers get it in their normal job-document list and offline cache.
 */
import { supabase } from "@/integrations/supabase/client";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";

const SAFE = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "_");
const FIVE_YEARS = 60 * 60 * 24 * 365 * 5;

export const EXTERNAL_RAMS_ACCEPT =
  ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.heic,application/pdf,image/*";

export const EXTERNAL_RAMS_APPROVAL_STATUSES = [
  { value: "approved", label: "Approved" },
  { value: "pending", label: "Pending approval" },
  { value: "for_information", label: "For information only" },
] as const;

export interface ExternalRamsInput {
  jobId: string;
  file: File;
  /** Document title shown in the RAMS list. Defaults to the file name. */
  title?: string;
  /** Company that issued the RAMS (client, principal contractor…). */
  issuedBy?: string | null;
  approvalStatus?: string | null;
  /** ISO yyyy-mm-dd. */
  validUntil?: string | null;
  userId: string;
}

export async function uploadExternalRams(
  input: ExternalRamsInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { jobId, file, userId } = input;
  const title = (input.title || "").trim() || file.name;
  try {
    const storagePath = await buildOrgPathAsync(
      `job-documents/${jobId}/external-rams/${Date.now()}-${SAFE(file.name)}`,
    );
    const { error: upErr } = await supabase.storage
      .from("submissions")
      .upload(storagePath, file, { upsert: false, contentType: file.type || undefined });
    if (upErr) return { ok: false, error: upErr.message };

    const { data: urlData } = await supabase.storage
      .from("submissions")
      .createSignedUrl(storagePath, FIVE_YEARS);
    const fileUrl = urlData?.signedUrl || "";

    const { data, error } = await (supabase.from("rams_documents" as any) as any)
      .insert({
        job_id: jobId,
        rams_type: "external",
        created_by: userId,
        uploaded_by: userId,
        contract_job_name: title,
        is_external: true,
        external_file_path: storagePath,
        external_file_url: fileUrl,
        external_file_name: file.name,
        external_mime: file.type || null,
        issued_by: (input.issuedBy || "").trim() || null,
        external_approval_status: input.approvalStatus || null,
        valid_until: input.validUntil || null,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };

    // Mirror into job documents so engineers see and cache it like any other
    // job file. A failure here must not lose the RAMS itself.
    try {
      await (supabase as any).from("job_documents").insert({
        job_id: jobId,
        document_type: "external_rams",
        label: title,
        file_url: fileUrl || `storage://submissions/${storagePath}`,
        file_name: file.name,
        source: "manual",
        created_by: userId,
      });
    } catch (e) {
      console.warn("external RAMS job_documents mirror failed", e);
    }

    return { ok: true, id: (data as any).id };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Upload failed" };
  }
}

/** Fresh signed URL for an external RAMS file (stored links eventually expire). */
export async function externalRamsUrl(
  path: string | null | undefined,
  fallback?: string | null,
): Promise<string | null> {
  if (path) {
    const { data } = await supabase.storage.from("submissions").createSignedUrl(path, 60 * 60);
    if (data?.signedUrl) return data.signedUrl;
  }
  return fallback || null;
}

/** Remove an external RAMS: the file, the RAMS row and the mirrored document. */
export async function deleteExternalRams(params: {
  id: string;
  jobId: string;
  filePath?: string | null;
  fileName?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { id, jobId, filePath, fileName } = params;
  const { error } = await supabase.from("rams_documents" as any).delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (filePath) {
    try {
      await supabase.storage.from("submissions").remove([filePath]);
    } catch (e) {
      console.warn("external RAMS file remove failed", e);
    }
  }
  if (fileName) {
    try {
      await (supabase as any)
        .from("job_documents")
        .delete()
        .eq("job_id", jobId)
        .eq("document_type", "external_rams")
        .eq("file_name", fileName);
    } catch (e) {
      console.warn("external RAMS document mirror remove failed", e);
    }
  }
  return { ok: true };
}
