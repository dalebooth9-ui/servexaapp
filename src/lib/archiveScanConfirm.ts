// File a paper-scan-batch item as a standalone archived document — NO job,
// NO visit, NO planner entry. Used by the digitise-only "Archive scan" flow.
import { supabase } from "@/integrations/supabase/client";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";
import { resolveSubmissionsSignedUrl } from "@/lib/resolveSubmissionsPath";

export type ArchiveScanConfirmInput = {
  userId: string;
  orgId: string;
  itemId: string;
  batchId: string | null;
  templateId: string | null;
  templateName: string | null;
  documentType: string | null;
  customerId: string | null;
  siteId: string | null;
  documentDate: string | null; // yyyy-mm-dd
  title: string | null;
  notes: string | null;
  extracted: Record<string, any>;
  header: Record<string, any>;
  storagePhotoPaths: string[]; // paths in 'submissions' bucket
  status?: "filed" | "unmatched";
};

export async function archiveScanConfirm(
  input: ArchiveScanConfirmInput,
): Promise<{ archivedId: string }> {
  const {
    userId,
    orgId,
    itemId,
    batchId,
    templateId,
    templateName,
    documentType,
    customerId,
    siteId,
    documentDate,
    title,
    notes,
    extracted,
    header,
    storagePhotoPaths,
    status = "filed",
  } = input;

  // Copy source-scan pages into an archive-scoped folder so deleting the
  // batch never orphans the filed document.
  const destPaths: string[] = [];
  const stamp = Date.now();
  for (let i = 0; i < storagePhotoPaths.length; i++) {
    const rawSrc = storagePhotoPaths[i];
    // Resolve the real object path first — legacy batch items may have stored
    // an un-prefixed path while the physical object lives under <orgId>/...
    const resolved = await resolveSubmissionsSignedUrl(rawSrc);
    const src = resolved?.path || rawSrc;
    const ext =
      src.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const relDest = `archive/${orgId}/${stamp}-${itemId}-page-${i + 1}.${ext}`;
    const dest = await buildOrgPathAsync(relDest);
    const { error: copyErr } = await supabase.storage
      .from("submissions")
      .copy(src, dest);
    if (copyErr) {
      // Fall back: keep the RESOLVED source path (verified readable) so the
      // archive row always previews, even if copy fails.
      console.error("archive copy failed", src, copyErr);
      destPaths.push(src);
    } else {
      destPaths.push(dest);
    }
  }

  const { data, error } = await supabase
    .from("archived_documents" as any)
    .insert({
      org_id: orgId,
      customer_id: customerId,
      site_id: siteId,
      document_date: documentDate,
      document_type: documentType,
      template_id: templateId,
      template_name: templateName,
      title,
      notes,
      extracted,
      header_data: header,
      file_paths: destPaths,
      page_count: destPaths.length,
      status,
      source_batch_id: batchId,
      source_item_id: itemId,
      filed_by: userId,
    } as any)
    .select("id")
    .single();
  if (error) throw error;
  const archivedId = (data as any).id as string;

  // Mark the queue item as confirmed and link back to the archive.
  await supabase
    .from("paper_scan_batch_items")
    .update({
      status: "confirmed",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      archived_document_id: archivedId,
    } as any)
    .eq("id", itemId);

  return { archivedId };
}
