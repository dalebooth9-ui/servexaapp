// Re-render an archived document's electronic report PDF from the answers we
// already hold — no OCR, no re-classification. Used after the office edits the
// customer summary so the printed report matches what they saved.
import { supabase } from "@/integrations/supabase/client";
import { generateAndUploadArchivePdf } from "@/lib/archivePdfBuilder";

export async function rerenderArchiveReport(archivedId: string): Promise<string | null> {
  const { data: doc, error } = await (supabase as any)
    .from("archived_documents")
    .select(
      "id, template_id, template_name, customer_id, site_id, site_name, site_address, document_date, file_paths, extracted, header_data",
    )
    .eq("id", archivedId)
    .maybeSingle();
  if (error) throw error;
  if (!doc?.template_id) return null;

  const { data: tpl } = await supabase
    .from("job_sheet_templates")
    .select("id, name, fields")
    .eq("id", doc.template_id)
    .maybeSingle();
  if (!tpl) return null;

  const header = (doc.header_data || {}) as Record<string, any>;
  const { path, pageCount } = await generateAndUploadArchivePdf({
    archivedId,
    template: {
      id: (tpl as any).id,
      name: (tpl as any).name,
      fields: Array.isArray((tpl as any).fields) ? ((tpl as any).fields as any[]) : [],
    },
    responses: (doc.extracted || {}) as Record<string, any>,
    header,
    sourcePaths: doc.file_paths || [],
    customerId: doc.customer_id,
    siteId: doc.site_id,
    siteName: doc.site_name,
    siteAddress: doc.site_address,
    documentDate: doc.document_date,
    technicianName: header.engineer || null,
    manualCustomerSignaturePath: header._manual_customer_signature_path || null,
    manualEngineerSignaturePath: header._manual_engineer_signature_path || null,
  });

  await (supabase as any)
    .from("archived_documents")
    .update({
      report_pdf_path: path,
      header_data: { ...header, _report_pdf_page_count: pageCount },
    })
    .eq("id", archivedId);

  return path;
}
