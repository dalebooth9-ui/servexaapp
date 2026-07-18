# Export dialog: photo picker + completed sheet inclusion

Two changes, applied consistently to **Export PDF Report** (`JobPdfReport`), **Export to Word** (`JobWordReport`) and **Send to Customer → Job Report** (`SendToCustomerMenu` → `CustomerReportPdf`).

## 1. Shared bundling logic — one place, three exports

Add a small shared module `src/lib/exportBundleSelection.ts` that owns:

- Photo-source classification. Given a `JobPhoto` (from `jobPhotos.ts`) return one of:
  - `evidence` — `source: "submission" | "site_response" | "checklist" | "defect"` where the storage path lives under evidence-style prefixes (`photos/`, `submissions/photos/…`, `whatsapp/…`, `checklist/…`). Default **ticked**.
  - `scanned_sheet` — `source: "document"` with path/label markers `paper-scan`, `paper_scans`, `batch-scan`, `scan_batch`, `ocr-source`, or filename starting with `scan_page_`. Default **unticked**, badge "scanned sheet".
  - `email_leftover` — `source: "document"` with `email/`, `inbound/`, or MIME-only names like `image001.png`, `image002.jpg`, tiny signature-strip aspect ratios detected at load time. Default **unticked**, badge "email attachment".
  - Everything else → `other`, default **ticked**.
- Per-job preference persistence keyed as `job-export-prefs:${jobId}` in `localStorage`, versioned with a `v: 1` field. Shape:
  ```ts
  { photoIds: string[] /* explicit picks */, photoMode: "auto" | "custom",
    sheetIds: string[], includeFilledSheets: boolean,
    includeCerts: boolean, includePhotos: boolean, includeFieldReports: boolean, includeJobSheets: boolean }
  ```
  `photoMode: "auto"` (default) means "let smart defaults decide" — recomputed each open so newly-uploaded photos are ticked immediately. As soon as the user toggles anything, we snapshot to `"custom"` and freeze `photoIds` to the exact selection.

## 2. New `ExportBundlePickerDialog` component

`src/components/exports/ExportBundlePickerDialog.tsx`. Reusable dialog opened from all three call sites. Sections:

- **Completed job sheet report(s)** — top block, default ON.
  - Master toggle "Include filled-in report".
  - When more than one submitted `job_sheet_response` exists on the job, list each with its own checkbox: "<Template name> — submitted <date> by <engineer>". Single-response jobs skip the sub-list.
- **Photos** — master toggle "Include photos".
  - 3-column thumbnail grid using signed URLs, checkbox top-left of each tile, thumbnails 96×96, aspect-fit letterboxed.
  - Subtle badge on tiles: "Scanned sheet" (amber) or "Email attachment" (slate). No badge on evidence.
  - Sticky toolbar: "Select all", "Select none", counter "N of M selected".
- **Other includes** — the existing switches (Servexa reports, Job Sheet answers, Engineer certificates) so PDF Report stays feature-parity.
- Actions: Cancel, "Generate PDF" / "Generate Word" / "Attach to email" — label passed by caller.

The dialog fetches photo meta via `fetchJobPhotoMeta(jobId)` and sheet responses via `job_sheet_responses`. Returns a typed `ExportBundleSelection` on confirm.

## 3. Wire into the three call sites

- **`JobPdfReport.tsx`** — replace the current dialog body with `<ExportBundlePickerDialog mode="pdf" />`. On confirm, pass `selection.photoIds` down through `loadJobPhotosForPdf` (add an `includeIds?: Set<string>` filter to `jobPhotos.ts`). Render the **filled-in report** at the top of the PDF (before certs & photos) by reusing the same rendering path `CustomerReportPdf` uses for a single submitted response; extract that block into `src/lib/pdfFilledSheet.ts` and call it once per selected `sheetId`.
- **`JobWordReport.tsx`** — same dialog, same selection object, same filtered photo list. Add a filled-sheet section builder that mirrors the PDF's answers/signatures/footer, reusing the existing Word helpers.
- **`SendToCustomerMenu.tsx`** — when the "Report" doc option is ticked, open the picker before generation. The resulting selection is passed into `CustomerReportPdf` via new props `photoIds?: Set<string>`, `sheetIds?: Set<string>`, `includeFilledSheets?: boolean`. `CustomerReportPdf` gains the same filled-sheet leading section.

## 4. Photo loader change

`src/lib/jobPhotos.ts`:

- `loadJobPhotosForPdf` gains `includeIds?: Set<string>`. When provided, filter `meta` down to that set before download/compression. `excludePaths` still applies.
- Add exported helper `classifyJobPhoto(photo: JobPhoto): "evidence" | "scanned_sheet" | "email_leftover" | "other"` used by both the picker and the smart defaults.

## 5. Filled-sheet rendering extraction

Currently `CustomerReportPdf` inlines the answers/signatures/footer of a submitted response. Move that into `src/lib/pdfFilledSheet.ts` exporting `renderFilledSheetSection(doc, { response, template, jobInfo, signatures, sigImages, watermark, accentColor })`. `CustomerReportPdf`, `JobPdfReport` and any future exporter call it identically. Word gets a parallel `src/lib/wordFilledSheet.ts` using the same field/answer/signature order.

## Notes / assumptions

- "Scanned sheet" detection: primary signal is `source === "document"` + storage path segment matching the scan pipeline (`paper-scans/`, `batch-scans/`, `scan_page_*`) or a document label starting with "Scan". This is exactly what the scan pipeline writes today, so the badge is reliable without new metadata.
- Email-leftover detection is best-effort (path fragments `email/`, `inbound/`, `image00\d.png`). False positives just default a real photo unticked — the user can re-tick, and their pick is remembered.
- Preferences live in `localStorage` per job so re-exports feel instant. No DB migration.
- No behaviour change for jobs with zero submitted job-sheet responses: the "filled report" block is hidden and nothing is added to the PDF.
