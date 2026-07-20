// Retroactively convert an image-only archived document into a proper
// electronic report by re-classifying against the org's templates,
// running OCR extraction, and rendering the filled PDF through the same
// pipeline job-mode uses. Used from the archive library "Convert" action
// for docs filed before archive-mode did full conversion (or where a
// template match wasn't available at file time).
import { supabase } from "@/integrations/supabase/client";
import { resolveSubmissionsSignedUrl } from "@/lib/resolveSubmissionsPath";
import { generateAndUploadArchivePdf } from "@/lib/archivePdfBuilder";

async function pathToPayload(
  path: string,
): Promise<{ image_base64: string; mime_type: string } | null> {
  const resolved = await resolveSubmissionsSignedUrl(path);
  if (!resolved) return null;
  try {
    const res = await fetch(resolved.signedUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(
        null,
        Array.from(bytes.subarray(i, i + 0x8000)) as any,
      );
    }
    const mime = blob.type || "image/jpeg";
    // We only classify/OCR image formats — PDFs need pre-splitting which
    // isn't in scope for retro-convert.
    if (!mime.startsWith("image/")) return null;
    return { image_base64: btoa(bin), mime_type: mime };
  } catch (e) {
    console.error("[convertArchivedDocument] fetch failed", path, e);
    return null;
  }
}

export type ConvertResult =
  | { ok: true; archivedId: string; reportPdfPath: string; templateName: string }
  | { ok: false; reason: string };

export async function convertArchivedDocument(
  archivedId: string,
): Promise<ConvertResult> {
  const { data: doc, error } = await (supabase as any)
    .from("archived_documents")
    .select(
      "id, org_id, customer_id, site_id, document_date, file_paths, report_pdf_path",
    )
    .eq("id", archivedId)
    .maybeSingle();
  if (error) throw error;
  if (!doc) return { ok: false, reason: "Archive not found" };

  const paths: string[] = (doc as any).file_paths || [];
  if (paths.length === 0) {
    return { ok: false, reason: "No source pages to convert" };
  }

  // Encode pages
  const payloads: { image_base64: string; mime_type: string }[] = [];
  for (const p of paths) {
    const enc = await pathToPayload(p);
    if (enc) payloads.push(enc);
  }
  if (payloads.length === 0) {
    return {
      ok: false,
      reason:
        "Couldn't read this document's pages — they may be PDFs (auto-split not supported for retro-convert) or unsupported formats.",
    };
  }

  // Reuse job-mode edge functions
  const { data: clsData, error: clsErr } = await supabase.functions.invoke(
    "classify-job-sheet-template",
    { body: { images: payloads } },
  );
  if (clsErr) return { ok: false, reason: `Classify failed: ${clsErr.message}` };
  const candidates: any[] = clsData?.candidates || [];
  if (candidates.length === 0) {
    return { ok: false, reason: "No matching template" };
  }
  const top = candidates[0];

  const { data: tpl } = await supabase
    .from("job_sheet_templates")
    .select("id, name, fields")
    .eq("id", top.template_id)
    .maybeSingle();
  if (!tpl) return { ok: false, reason: "Template not found" };

  const fields = Array.isArray((tpl as any).fields) ? (tpl as any).fields : [];
  const { data: ocrData, error: ocrErr } = await supabase.functions.invoke(
    "ocr-job-sheet",
    {
      body: {
        images: payloads,
        template_name: (tpl as any).name,
        fields: fields.map((f: any) => ({
          id: f.id,
          label: f.label,
          type: f.type,
          section: f.section,
          options: f.options,
        })),
      },
    },
  );
  if (ocrErr) return { ok: false, reason: `OCR failed: ${ocrErr.message}` };
  const extracted = ocrData?.extracted || {};
  const header = ocrData?.header || {};

  const { path } = await generateAndUploadArchivePdf({
    archivedId,
    template: {
      id: (tpl as any).id,
      name: (tpl as any).name,
      fields,
    },
    responses: extracted,
    customerId: (doc as any).customer_id,
    siteId: (doc as any).site_id,
    documentDate: (doc as any).document_date,
  });

  await (supabase as any)
    .from("archived_documents")
    .update({
      template_id: (tpl as any).id,
      template_name: (tpl as any).name,
      document_type: (doc as any).document_type || (tpl as any).name,
      extracted,
      header_data: header,
      report_pdf_path: path,
      status: "filed",
    })
    .eq("id", archivedId);

  return {
    ok: true,
    archivedId,
    reportPdfPath: path,
    templateName: (tpl as any).name,
  };
}
