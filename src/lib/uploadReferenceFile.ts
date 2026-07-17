/**
 * Upload a manual "Reference" file to a job.
 *
 * Reference files are internal companion documents (e.g. last year's report
 * PDF an office admin wants side-by-side with a new sheet). They are stored
 * as `job_documents` with `document_type='reference'` and are surfaced in the
 * Previous-report comparison panel — but never auto-included in customer
 * report exports or Send-to-Customer bundles.
 */
import { supabase } from "@/integrations/supabase/client";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";

const SAFE = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "_");

export async function uploadReferenceFile(params: {
  jobId: string;
  file: File;
  userId?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { jobId, file, userId } = params;
  try {
    const path = `job-documents/${jobId}/refs/${Date.now()}-${SAFE(file.name)}`;
    const storagePath = await buildOrgPathAsync(path);
    const { error: upErr } = await supabase.storage
      .from("submissions")
      .upload(storagePath, file, { upsert: false, contentType: file.type || undefined });
    if (upErr) return { ok: false, error: upErr.message };
    const { data: urlData } = await supabase.storage
      .from("submissions")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 5);
    const { data, error: insErr } = await (supabase as any)
      .from("job_documents")
      .insert({
        job_id: jobId,
        document_type: "reference",
        label: file.name,
        file_url: urlData?.signedUrl || `storage://submissions/${storagePath}`,
        file_name: file.name,
        source: "manual",
        created_by: userId ?? null,
      })
      .select("id")
      .single();
    if (insErr) return { ok: false, error: insErr.message };
    return { ok: true, id: (data as any).id };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Upload failed" };
  }
}

export async function uploadReferenceFiles(params: {
  jobId: string;
  files: File[];
  userId?: string | null;
  onProgress?: (done: number, total: number, lastError?: string) => void;
}): Promise<{ succeeded: number; failed: number }> {
  const { jobId, files, userId, onProgress } = params;
  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < files.length; i++) {
    const r = await uploadReferenceFile({ jobId, file: files[i], userId });
    if (r.ok) succeeded++;
    else failed++;
    onProgress?.(i + 1, files.length, r.ok ? undefined : r.error);
  }
  return { succeeded, failed };
}
