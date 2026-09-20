# Scan Paper Report from the job page

Let engineers photograph a completed paper report while standing on the job, run it through the existing OCR pipeline, and get back both the original scan filed against the job and a digital job sheet they can correct and confirm.

## What the engineer will see

1. On a job's Documents area (office page and the engineer job view) a new **Scan Paper Report** button sits next to the existing Scan Document button. Visible to engineers and office staff alike.
2. Tapping it opens a dialog: take a photo, or pick images/PDF pages from the device. Multiple pages supported, shown as thumbnails that can be reordered or removed.
3. **Process** runs two steps with a visible progress state: work out which report type it is, then read the fields off the page.
4. A review screen shows the scan images beside the fields that were read, with low-confidence values flagged. The engineer corrects anything wrong.
5. **Confirm** saves two things and closes with a success toast linking to the job's documents:
   - the original photos, filed on the job as attachments
   - a completed digital report for the job, listed with the other job sheets
6. Failures are explicit, never guessed: if no report type can be matched the engineer picks one from a list; if reading fails, the scan images can still be saved on their own with a "fields not read" message.

## Technical plan

Everything reuses the existing pipeline; no new edge functions, no schema changes.

**New file `src/components/paper-scan/JobScanReportDialog.tsx`**
- Props: `jobId`, `jobInfo`, trigger button.
- Capture: `<input type="file" accept="image/*,application/pdf" capture="environment" multiple>`; PDFs split client-side with the same pdf.js conversion already used in `ScanJobSheet`.
- Classify: `supabase.functions.invoke("classify-job-sheet-template", …)` with the first page, mirroring the call in `ScanCompletedJobDialog` (line ~608). Result list is offered as a manual picker when confidence is low or empty.
- Extract: `runScanExtraction` from `src/lib/scanPipeline.ts` with the chosen template's fields (images via `fileToScanBase64`). Date/letterhead/confidence guards come for free.
- Review: render the existing `ScanReviewPanel` (`imagePreviews`, `extractedFields`, `extractedHeader`, `templateFields`, `templateName`, `jobId`, `templateId`), so the side-by-side original-vs-extracted behaviour matches the admin flow.

**New file `src/lib/jobScanReportSave.ts`** — confirm step, one function `saveJobScanReport({ jobId, templateId, images, responses, header, userId })`:
- uploads each original image to the `submissions` bucket under the org path (`buildOrgPathAsync`) and inserts a `submissions` row per page (`job_id`, document type, signed URL) — same pattern as `ScanJobSheet` lines ~514-560, so they appear in the job's documents list.
- inserts one `job_sheet_responses` row for the job with the corrected `responses` plus header, marked as scanned-from-paper in its metadata so the UI can badge it.
- returns inserted ids; all-or-nothing messaging on partial failure (images saved, fields not).

Note on wording in the request: in this codebase the "digital submission" for a report is a `job_sheet_responses` row (that is what the job sheet list and report PDFs read), while `submissions` holds file attachments. The plan writes to both accordingly.

**Wiring**
- `src/pages/JobDetail.tsx` (~line 1136) and `src/components/engineer/EngineerJobView.tsx` (~line 130): add the lazy-loaded dialog trigger beside `ScanDocumentButton`. No role gate.
- Since the job is known, no job matching, no customer/site guessing, no `paper_scan_batches` rows — the queue path is bypassed entirely.

**Also updated**
- Help Centre: new article plus `is_guide`/category/audience/order, and the route rule in `src/lib/helpArticles.ts` for the jobs detail route.
- `roadmap.md` entry.
