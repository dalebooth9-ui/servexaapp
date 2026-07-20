// File a paper-scan-batch item as a standalone archived document — NO job,
// NO visit, NO planner entry. Used by the digitise-only "Archive scan" flow.
//
// When the sheet was matched to a template we ALSO generate the filled
// electronic report through the normal job PDF pipeline and attach it as
// the archive's primary artifact (report_pdf_path). The original scan
// pages remain attached as source reference (file_paths).
import { supabase } from "@/integrations/supabase/client";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";
import { resolveSubmissionsSignedUrl } from "@/lib/resolveSubmissionsPath";
import { generateAndUploadArchivePdf } from "@/lib/archivePdfBuilder";

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
  /**
   * Full template fields — when supplied and status === "filed", the
   * electronic PDF report is rendered and attached.
   */
  templateFields?: any[] | null;
  /**
   * Full name of the org engineer whose stored profile signature should be
   * stamped as the technician signature on the generated electronic report.
   * Set when the office confirms (via the review dialog) that the scanned
   * original bears this engineer's handwritten signature.
   */
  technicianName?: string | null;
};

export async function archiveScanConfirm(
  input: ArchiveScanConfirmInput,
): Promise<{ archivedId: string; reportPdfPath: string | null }> {
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
    templateFields,
    technicianName,
  } = input;

  // Append an auditable trail to notes when a signature is being applied
  // from an engineer's profile on the basis of the signed original scan.
  const notesWithSigTrail = technicianName
    ? [
        notes,
        `Technician signature applied from ${technicianName}'s employee profile on the basis of the signed original scan.`,
      ]
        .filter(Boolean)
        .join("\n\n")
    : notes;

  // 1. Copy the source scan pages into an archive-scoped folder so deleting
  //    the batch never orphans the filed document.
  const destPaths: string[] = [];
  const stamp = Date.now();
  for (let i = 0; i < storagePhotoPaths.length; i++) {
    const rawSrc = storagePhotoPaths[i];
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
      console.error("archive copy failed", src, copyErr);
      destPaths.push(src);
    } else {
      destPaths.push(dest);
    }
  }

  // 2. Insert the archive row first so we have an id to name the PDF with.
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
      notes: notesWithSigTrail,
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

  // 3. Generate + attach the electronic report when we have a template.
  //    Skips silently (image-only fallback) if generation fails so the
  //    user still gets a filed archive record instead of a hard error.
  let reportPdfPath: string | null = null;
  if (
    status === "filed" &&
    templateId &&
    templateName &&
    Array.isArray(templateFields) &&
    templateFields.length > 0
  ) {
    try {
      const { path } = await generateAndUploadArchivePdf({
        archivedId,
        template: {
          id: templateId,
          name: templateName,
          fields: templateFields,
        },
        responses: extracted || {},
        header: header || null,
        sourcePaths: destPaths,
        customerId,
        siteId,
        documentDate,
        technicianName,
      });
      reportPdfPath = path;
      await (supabase as any)
        .from("archived_documents")
        .update({ report_pdf_path: path })
        .eq("id", archivedId);
    } catch (e) {
      console.error(
        "[archiveScanConfirm] electronic report generation failed — filed as scan-only",
        e,
      );
    }
  }

  // 4. Mark the queue item as confirmed and link back to the archive.
  await supabase
    .from("paper_scan_batch_items")
    .update({
      status: "confirmed",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      archived_document_id: archivedId,
    } as any)
    .eq("id", itemId);

  return { archivedId, reportPdfPath };
}
