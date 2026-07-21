// electronicReportPdf.ts — the ONE entry both paper-scan flows call to
// produce a filled electronic report PDF from an OCR'd sheet.
//
// Historical drift risk: archive-mode had `generateAndUploadArchivePdf`,
// while job-mode relied on the job's own PDF renderer running later (or not
// at all if the user never opened the report). The unified "photo → PDF"
// north star requires that every scan run *always* ends with a PDF the user
// can view/download/send immediately, regardless of destination. This shim
// centralises that guarantee — both the job filing path and the archive
// filing path call `buildElectronicReportPdf` and get back a submissions-
// bucket path that renders exactly the same clean electronic report.
//
// Internally we delegate to the existing `generateAndUploadArchivePdf`
// which already does the heavy lifting (branding, signatures, seed-header,
// customer-guard). This module gives us a stable name/place to grow shared
// logic without breaking the archive flow.

import {
  generateAndUploadArchivePdf,
  type ArchivePdfInput,
} from "@/lib/archivePdfBuilder";

export type ElectronicReportInput = ArchivePdfInput;
export type ElectronicReportResult = { path: string };

export async function buildElectronicReportPdf(
  input: ElectronicReportInput,
): Promise<ElectronicReportResult> {
  return generateAndUploadArchivePdf(input);
}
