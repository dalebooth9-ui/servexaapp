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
import { parseSheetDate } from "@/lib/paperReportDate";

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
  /** Riser/asset chosen by the office in the review screen. Never guessed. */
  assetId?: string | null;
  documentDate: string | null; // yyyy-mm-dd
  title: string | null;
  notes: string | null;
  /** Free-text site name (used when siteId is null, or as the display fallback). */
  siteName?: string | null;
  /** Free-text site address (persisted so the electronic PDF can render it). */
  siteAddress?: string | null;
  extracted: Record<string, any>;
  header: Record<string, any>;
  storagePhotoPaths: string[]; // paths in 'submissions' bucket
  status?: "filed" | "unmatched";
  /** Bulk conversion is not office approval. Keep it in the review queue. */
  needsReview?: boolean;
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
  /**
   * Storage paths (signatures bucket) of manually-cropped signatures picked
   * by the office via "Select from photo" on the archive review dialog.
   * When set, override the auto-crop / profile-stamped signatures on the
   * generated electronic report. Persisted on header_data so re-converts
   * never re-derive over a human's choice.
   */
  manualCustomerSignaturePath?: string | null;
  manualEngineerSignaturePath?: string | null;
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
    assetId = null,
    documentDate: rawDocumentDate,
    title,
    notes,
    siteName,
    siteAddress,
    extracted,
    header,
    storagePhotoPaths,
    status = "filed",
    templateFields,
    technicianName,
    manualCustomerSignaturePath,
    manualEngineerSignaturePath,
    needsReview = false,
  } = input;
  // Always store ISO yyyy-mm-dd; a dd/mm/yyyy string would be misread by the database.
  const documentDate = parseSheetDate(rawDocumentDate);

  // Preserve manual signatures in header_data so a later re-convert can
  // pick them up and never re-derive over the office's choice.
  const headerWithManualSigs: Record<string, any> = { ...(header || {}) };
  headerWithManualSigs._needs_review = needsReview;
  if (manualCustomerSignaturePath) {
    headerWithManualSigs._manual_customer_signature_path = manualCustomerSignaturePath;
  }
  if (manualEngineerSignaturePath) {
    headerWithManualSigs._manual_engineer_signature_path = manualEngineerSignaturePath;
  }

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
  const { data: existing, error: lookupError } = await supabase.from("archived_documents" as any)
    .select("id").eq("source_item_id", itemId).eq("org_id", orgId).maybeSingle();
  if (lookupError) throw lookupError;
  const row = {
      org_id: orgId,
      customer_id: customerId,
      site_id: needsReview ? null : siteId,
      asset_id: !needsReview && status === "filed" && siteId ? assetId : null,
      site_name: siteName ?? (header as any)?.site ?? null,
      site_address: siteAddress ?? (header as any)?.site ?? null,
      document_date: documentDate,
      document_type: documentType,
      template_id: templateId,
      template_name: templateName,
      title,
      notes: notesWithSigTrail,
      extracted,
      header_data: headerWithManualSigs,
      file_paths: destPaths,
      page_count: destPaths.length,
      status,
      source_batch_id: batchId,
      source_item_id: itemId,
      filed_by: userId,
    };
  const write = existing
    ? supabase.from("archived_documents" as any).update(row as any).eq("id", (existing as any).id).eq("org_id", orgId)
    : supabase.from("archived_documents" as any).insert(row as any);
  const { data, error } = await write.select("id").single();
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
      const { path, pageCount } = await generateAndUploadArchivePdf({
        archivedId,
        template: {
          id: templateId,
          name: templateName,
          fields: templateFields,
        },
        responses: extracted || {},
        header: headerWithManualSigs,
        sourcePaths: destPaths,
        customerId,
        siteId,
        siteName: siteName ?? (header as any)?.site ?? null,
        siteAddress: siteAddress ?? (header as any)?.site ?? null,
        documentDate,
        technicianName,
        manualCustomerSignaturePath,
        manualEngineerSignaturePath,
      });
      reportPdfPath = path;
      await (supabase as any)
        .from("archived_documents")
        .update({
          report_pdf_path: path,
          header_data: {
            ...headerWithManualSigs,
            _report_pdf_page_count: pageCount,
            ...(pageCount > 1 ? { _report_pdf_page_warning: `Electronic report rendered as ${pageCount} pages` } : {}),
          },
        })
        .eq("id", archivedId);
    } catch (e) {
      console.error(
        "[archiveScanConfirm] electronic report generation failed — filed as scan-only",
        e,
      );
    }
  }

  // 3b. Add the filed report to the chosen riser's History, like in-app reports.
  if (status === "filed" && siteId && assetId) {
    await addArchiveToRiserHistory({
      archivedId, orgId, siteId, assetId, templateId, templateName,
      documentType, documentDate, extracted, originalPath: destPaths[0] || null,
    });
  }

  // 4. Mark the queue item as confirmed and link back to the archive.
  const { error: queueError } = await supabase
    .from("paper_scan_batch_items")
    .update({
      status: needsReview ? "ready" : "confirmed",
      reviewed_by: needsReview ? null : userId,
      reviewed_at: needsReview ? null : new Date().toISOString(),
      ...(needsReview ? { guess_site_id: null, header_data: headerWithManualSigs } : {}),
      archived_document_id: archivedId,
    } as any)
    .eq("id", itemId);
  if (queueError) throw queueError;

  return { archivedId, reportPdfPath };
}

/** Visit type, using the same values as reports from in-app jobs. */
export function archiveInspectionType(name: string | null | undefined): string | null {
  const n = (name || "").toLowerCase();
  if (n.includes("pressure")) return "pressure_test";
  if (n.includes("visual")) return "visual";
  if (n.includes("commission") || n.includes("install")) return "commissioning";
  if (n.includes("remedial") || n.includes("repair")) return "remedial";
  return null;
}

/** Result, read from the same answers as reports from in-app jobs. */
export function archiveResultSummary(extracted: Record<string, any> | null | undefined): string | null {
  for (const k of ["overall_result", "result", "pass_fail", "test_result"]) {
    const v = extracted?.[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

async function addArchiveToRiserHistory(a: {
  archivedId: string; orgId: string; siteId: string; assetId: string;
  templateId: string | null; templateName: string | null; documentType: string | null;
  documentDate: string | null; extracted: Record<string, any>; originalPath: string | null;
}) {
  const outlets = Number.parseInt(String(a.extracted?.number_of_outlets ?? a.extracted?.no_of_outlets ?? ""), 10);
  const { error } = await (supabase as any).from("asset_service_history").insert({
    asset_id: a.assetId,
    site_id: a.siteId,
    org_id: a.orgId,
    archived_document_id: a.archivedId,
    template_id: a.templateId,
    template_name: a.templateName || a.documentType,
    inspection_type: archiveInspectionType(a.templateName || a.documentType),
    inspection_date: a.documentDate ? `${a.documentDate}T12:00:00Z` : null,
    result_summary: archiveResultSummary(a.extracted),
    outlets_count: Number.isFinite(outlets) ? outlets : null,
    riser_location: a.extracted?.riser_location ? String(a.extracted.riser_location) : null,
    report_file: a.originalPath ? `storage://submissions/${a.originalPath}` : null,
  });
  if (error && error.code !== "23505") console.error("[archiveScanConfirm] riser history insert failed", error);
}
