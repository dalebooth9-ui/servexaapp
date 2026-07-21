// Bulk "Convert" for archive-mode paper_scan_batch_items in the review queue.
//
// The archive conversion queue operates on archived_documents rows, but
// queue items in "ready"/"low_confidence" haven't been filed yet. This
// helper auto-files each selected item as scan-only using its best-guess
// customer/site/date, then enqueues the resulting archived_document id
// for conversion so the AI extraction + electronic PDF is generated
// exactly as it would be from the archive library.
import { supabase } from "@/integrations/supabase/client";
import { archiveScanConfirm } from "@/lib/archiveScanConfirm";
import { archiveConversionQueue } from "@/lib/archiveConversionQueue";

export type BulkArchiveConvertItem = {
  id: string;
  batch_id: string;
  detected_template_id: string | null;
  extracted: any;
  header_data: any;
  guess_customer_id: string | null;
  guess_site_id: string | null;
  guess_date: string | null;
  image_paths: string[];
  template_name?: string | null;
};

export async function bulkFileAndConvertArchiveItems({
  items,
  userId,
  orgId,
}: {
  items: BulkArchiveConvertItem[];
  userId: string;
  orgId: string;
}): Promise<{ filed: number; failed: number }> {
  let filed = 0;
  let failed = 0;
  const archivedIds: string[] = [];

  for (const i of items) {
    try {
      const header = i.header_data || {};
      const { archivedId } = await archiveScanConfirm({
        userId,
        orgId,
        itemId: i.id,
        batchId: i.batch_id,
        templateId: i.detected_template_id,
        templateName: i.template_name ?? (header?.template_name as string) ?? null,
        documentType: (header?.document_type as string) || null,
        customerId: i.guess_customer_id,
        siteId: i.guess_site_id,
        documentDate: i.guess_date,
        title: (header?.title as string) || null,
        notes: null,
        siteName: (header?.site as string) || null,
        siteAddress: (header?.site as string) || null,
        extracted: i.extracted || {},
        header,
        storagePhotoPaths: i.image_paths || [],
        status: i.guess_customer_id ? "filed" : "unmatched",
        // No templateFields → filed as scan-only. Conversion queue will
        // run classification + OCR and generate the electronic report.
        templateFields: null,
      });
      archivedIds.push(archivedId);
      filed++;
    } catch (e) {
      console.error("[bulkFileAndConvertArchiveItems] file failed", i.id, e);
      failed++;
    }
  }

  if (archivedIds.length > 0) {
    archiveConversionQueue.enqueue(archivedIds);
  }
  void supabase;
  return { filed, failed };
}
