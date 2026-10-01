# Automatic site photos on the online report

## Outcome
Every photo filed to the job shows up by itself in a "Site photos" section on the engineer's online report and on the report PDF. The engineer chooses which photos go on the report, and empty before/after slots fill themselves.

## Build
- **Site photos section** on the online report: every photo on the job (uploaded in the app, sent by WhatsApp, scanned in), oldest first, each showing the time it was taken. New photos appear by themselves while the report is open.
- **Choosing photos for the report**: each photo has an "Include on report" switch (on by default), plus "Select all" / "Clear all" and a count such as "8 of 12 on report". Switched-off photos stay on the job for the office but are left off the customer PDF. The choice is saved with that report.
- **Scanned paper pages** are listed for the engineer but are off and locked out of the customer report, because of the existing rule that customers never see scanned sheets.
- **Auto-filled before/after**: for each report, any empty Before slot gets the first photo of the visit and any empty After slot gets the latest one. A slot the engineer filled by hand is never overwritten. Auto-filled slots show a small "Auto" tag and keep the existing Replace and Remove options. Removing an auto photo stops that slot from being filled again. Only the report's own before/after slots are filled; defect photo slots are left alone.
- **Report PDF**: site photos laid out 2 per row with the date and time taken (DD/MM/YYYY HH:MM). They always start on their own photo page(s) after the main sheet, so one-page reports like the Dry Riser Pressure Test keep the main sheet on one page.
- The Help guide for the job page is updated.

## Technical details
- Source list: `fetchJobPhotoMeta()` (already merges submissions, WhatsApp, documents, checklist, defects), filtered to images, sorted by `createdAt` ascending. "Visit" = photos on the report's visit date, falling back to all job photos.
- Selection is stored in the report response JSON as `_site_photo_excluded: string[]` (photo ids), so no new table is needed. Scanned sheets are excluded through `classifyJobPhoto` in `exportBundleSelection.ts`.
- Auto-fill writes the durable ref into the empty `before_photo_url` / `after_photo_url` and records the slot in `_auto_slots` (or an `auto_filled` flag column on `job_photo_checklist_responses`, added with a migration) so the "Auto" tag shows and manual slots are never touched.
- Live updates come from a realtime subscription on `submissions`, `job_documents` and `job_photo_checklist_responses` for the job.
- PDF: `JobSheetPdfExport.tsx` site-photo block is replaced by an `addPage()` grid of 2 columns with timestamp captions. Existing single-page tests (dry riser) are rerun to confirm the main sheet stays on one page.
