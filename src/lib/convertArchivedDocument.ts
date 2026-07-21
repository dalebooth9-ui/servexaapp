// Retroactively convert an image-only archived document into a proper
// electronic report by re-classifying against the org's templates,
// running OCR extraction, and rendering the filled PDF through the same
// pipeline job-mode uses. Used from the archive library "Convert" action
// for docs filed before archive-mode did full conversion (or where a
// template match wasn't available at file time).
import { supabase } from "@/integrations/supabase/client";
import { resolveSubmissionsSignedUrl } from "@/lib/resolveSubmissionsPath";
import { generateAndUploadArchivePdf } from "@/lib/archivePdfBuilder";
import { fuzzyMatchEngineer } from "@/lib/fuzzyEngineerMatch";

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

import { proposeDefectsFromExtraction, type ProposedDefect } from "@/lib/proposeArchiveDefects";

export type ConvertResult =
  | {
      ok: true;
      archivedId: string;
      reportPdfPath: string;
      templateName: string;
      /** Defect proposals derived from OCR — surfaced for office review. Never auto-created. */
      proposedDefects: ProposedDefect[];
      customerId: string | null;
      siteId: string | null;
      documentDate: string | null;
    }
  | { ok: false; reason: string };

export async function convertArchivedDocument(
  archivedId: string,
): Promise<ConvertResult> {
  const { data: doc, error } = await (supabase as any)
    .from("archived_documents")
    .select(
      "id, org_id, customer_id, site_id, site_name, site_address, document_date, file_paths, report_pdf_path",
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

  // Best-effort: match the OCR'd technician name against an org engineer
  // profile so their stored signature (profiles.signature_data) stamps
  // onto the electronic report. Retro-convert has no review step, so this
  // is silent — the office can re-run if the guess is wrong.
  let technicianName: string | null = null;
  const rawTech: string =
    (header as any)?.engineer ||
    (extracted as any)?.technician_name ||
    (extracted as any)?.engineer ||
    "";
  if (rawTech && (doc as any).org_id) {
    const { data: engs } = await supabase
      .from("profiles")
      .select("user_id, full_name, signature_data")
      .eq("org_id", (doc as any).org_id);
    const withSig = ((engs as any[]) || []).filter(
      (e) => e.full_name && e.signature_data,
    );
    if (withSig.length > 0) {
      const matched = fuzzyMatchEngineer(
        rawTech,
        withSig.map((e) => ({ user_id: e.user_id, full_name: e.full_name })),
      );
      if (matched && matched.toUpperCase() !== rawTech.trim().toUpperCase()) {
        technicianName = matched;
      } else if (
        withSig.some((e) => e.full_name.toUpperCase() === matched.toUpperCase())
      ) {
        technicianName = matched;
      }
    }
  }

  const { path } = await generateAndUploadArchivePdf({
    archivedId,
    template: {
      id: (tpl as any).id,
      name: (tpl as any).name,
      fields,
    },
    responses: extracted,
    header: header || null,
    sourcePaths: paths,
    customerId: (doc as any).customer_id,
    siteId: (doc as any).site_id,
    documentDate: (doc as any).document_date,
    technicianName,
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

  const proposedDefects = proposeDefectsFromExtraction(
    fields as any,
    extracted as any,
    (header || {}) as any,
  );

  return {
    ok: true,
    archivedId,
    reportPdfPath: path,
    templateName: (tpl as any).name,
    proposedDefects,
    customerId: (doc as any).customer_id ?? null,
    siteId: (doc as any).site_id ?? null,
    documentDate: (doc as any).document_date ?? null,
  };
}
