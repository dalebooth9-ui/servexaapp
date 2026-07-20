// Build the "electronic" filled report PDF for an archived (digitised-only)
// document. Reuses the same generator as job-mode sheets so branding,
// watermark, accreditations and layout are identical — the only difference
// is that there is no `jobs` row, so we pass a synthetic non-UUID jobId to
// skip the signatures / assignments / customer-branding lookups inside the
// generator and instead hand-feed customer + site + brand colour from the
// archive metadata.
import { supabase } from "@/integrations/supabase/client";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";
import { generateJobSheetPdf } from "@/components/JobSheetPdfExport";

export type ArchivePdfInput = {
  archivedId: string;
  template: {
    id: string;
    name: string;
    description?: string | null;
    fields: any[];
    footer_text?: string | null;
    branding?: any;
  };
  responses: Record<string, any>;
  customerId: string | null;
  siteId: string | null;
  documentDate: string | null; // yyyy-mm-dd
  /**
   * When set, forwarded as `submittedBy` so the shared job PDF generator
   * looks up this engineer's profile signature (`profiles.signature_data`)
   * and stamps it into the technician signature block. Used by the archive
   * flow to apply an engineer's stored signature on the basis that the
   * scanned original bears their handwritten signature.
   */
  technicianName?: string | null;
};

export async function generateAndUploadArchivePdf(
  input: ArchivePdfInput,
): Promise<{ path: string }> {
  const { archivedId, template, responses, customerId, siteId, documentDate, technicianName } =
    input;

  // Hydrate the same shape a job PDF would receive.
  let customer: any = null;
  if (customerId) {
    const { data } = await supabase
      .from("customers")
      .select("id, name, logo_url, brand_colour")
      .eq("id", customerId)
      .maybeSingle();
    customer = data;
  }
  let site: any = null;
  if (siteId) {
    const { data } = await (supabase as any)
      .from("sites")
      .select("id, name, address")
      .eq("id", siteId)
      .maybeSingle();
    site = data;
  }

  const jobInfo = {
    address: site?.address || null,
    customer: customer?.name || null,
    customers: customer
      ? {
          name: customer.name,
          logo_url: customer.logo_url,
          brand_colour: customer.brand_colour,
        }
      : null,
    reference_number: `ARCH-${archivedId.substring(0, 8).toUpperCase()}`,
    site: site ? { name: site.name, address: site.address } : null,
  } as any;

  const responsesWithDate = { ...responses };
  if (documentDate && !responsesWithDate.date) {
    // format as dd/mm/yyyy for the header renderer's fallback picker
    const m = documentDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    responsesWithDate.date = m ? `${m[3]}/${m[2]}/${m[1]}` : documentDate;
  }
  // Seed the technician name into the response payload so the job PDF
  // generator's tech-name resolution picks it up even when the template
  // has no explicit "technician name" field.
  if (technicianName && !responsesWithDate.technician_name) {
    responsesWithDate.technician_name = technicianName;
  }

  // Non-UUID jobId => generator skips DB-driven signature / assignment / job
  // lookups and relies purely on the jobInfo we pass in.
  const fakeJobId = `archive-${archivedId}`;

  const { base64 } = await generateJobSheetPdf(
    template as any,
    responsesWithDate,
    jobInfo,
    fakeJobId,
    // submittedBy → generator ilike-matches profiles.full_name and applies
    // the stored profile signature as the technician signature.
    technicianName || undefined,
    documentDate || null,
    undefined,
  );

  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });

  const rel = `archive/report/${archivedId}-${Date.now()}.pdf`;
  const fullPath = await buildOrgPathAsync(rel);
  const { error } = await supabase.storage
    .from("submissions")
    .upload(fullPath, blob, {
      upsert: true,
      contentType: "application/pdf",
    });
  if (error) throw error;
  return { path: fullPath };
}
