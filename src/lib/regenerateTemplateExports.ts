/**
 * Single-source regeneration helper for blank template exports.
 *
 * Generates the PDF and Word (.docx) outputs from the SAME in-memory
 * template object so the two artifacts always reflect the identical
 * template version. The Word + PDF generators consume the same shared
 * helpers (`buildSkipIds`, `getSections`, `getSectionFields`,
 * `getDefaultFooterText`) — see `src/test/wordPdfFullParity.test.ts` for
 * the parity contract this helper depends on.
 *
 * Use cases:
 *   • "Download both" UI action (BlankTemplateActions)
 *   • Server-side / scripted regeneration after a template edit
 *   • Bulk re-export when the parity contract changes
 */
import { Packer } from "docx";
import jsPDF from "jspdf";
import {
  buildBlankTemplateDoc,
  blankTemplateFileSlug,
  type WordTemplateInput,
} from "@/lib/wordTemplateBuilder";

export type RegenerateTemplateInput = WordTemplateInput & {
  /** Optional jsPDF builder. When omitted, the helper returns only the .docx. */
  buildPdf?: (template: WordTemplateInput) => Promise<jsPDF> | jsPDF;
};

export type RegeneratedTemplate = {
  /** Slug shared by both artifacts (e.g. "dry-riser-visual-inspection-blank"). */
  slug: string;
  /** Word document blob. */
  docx: Blob;
  /** PDF blob (only present when `buildPdf` was supplied). */
  pdf?: Blob;
};

/**
 * Regenerate both artifacts from a single template version.
 *
 * The Word doc is always built from the shared `buildBlankTemplateDoc`. The
 * PDF must be supplied via `buildPdf` (typically a thin wrapper around the
 * existing `BlankTemplatePdfExport.getBlob` flow) — that lets this helper
 * stay decoupled from the React component surface while still guaranteeing
 * both outputs come from the SAME template object.
 */
export async function regenerateTemplateExports(
  input: RegenerateTemplateInput,
): Promise<RegeneratedTemplate> {
  const slug = blankTemplateFileSlug(input.name);

  const [doc, pdf] = await Promise.all([
    buildBlankTemplateDoc(input),
    input.buildPdf ? Promise.resolve(input.buildPdf(input)) : Promise.resolve(null),
  ]);

  const docx = await Packer.toBlob(doc);
  const pdfBlob = pdf
    ? new Blob([pdf.output("arraybuffer")], { type: "application/pdf" })
    : undefined;

  return { slug, docx, pdf: pdfBlob };
}

/**
 * Trigger a browser download for a Blob using a synthesized anchor.
 * Centralised so PDF + Word downloads share the same lifecycle.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Convenience: regenerate AND download both files. Used by the
 * "Download both (PDF + Word)" action in BlankTemplateActions.
 */
export async function regenerateAndDownloadBoth(
  input: RegenerateTemplateInput,
): Promise<RegeneratedTemplate> {
  const out = await regenerateTemplateExports(input);
  if (out.pdf) downloadBlob(out.pdf, `${out.slug}-blank.pdf`);
  downloadBlob(out.docx, `${out.slug}-blank.docx`);
  return out;
}
