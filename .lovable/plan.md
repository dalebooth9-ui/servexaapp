# Paper Scans — North Star: photo in, PDF out. Fast.

Owner's line: *"I just want it straightforward: scan the paper copy of a handwritten report and get the PDF copy. Fast."*

Everything below is scoped to that one outcome. Job filing, PO matching, attach-to-existing prompts and defect capture still happen — but they happen **around** the PDF, never in front of it.

## The happy path — count the clicks

```text
1. Tap "Scan paper report"      → file picker opens
2. Pick photo / PDF             → auto-extraction runs (progress shown)
3. Tap "Looks good"             → PDF is built + opened
                                  (Send to customer button right there)
```

**3 taps from photo to PDF.** No mode selector, no site picker gate, no "job vs archive" fork in the user's face.

## Design rules (non-negotiable)

1. **PDF is the product.** Every scan run ends with a viewable electronic PDF. Filing to a job or to the archive is a side effect of that same run, not a prerequisite.
2. **The review screen never blocks the PDF.** Missing site, missing customer, low-confidence answers, unmatched signature — all become soft warnings. "Looks good" is always enabled. Nothing on review may throw an error that prevents PDF generation.
3. **One review screen, one primary button.** No mode toggle in the header. The reviewer sees the extracted sheet, corrects what they want, taps one green button.
4. **Everything else runs in the background** after the PDF is produced: PO-match / attach-to-existing job prompt, defect proposals, signature crop retries, customer enrichment. Each surfaces as a dismissible follow-up card on the same result screen — never a modal that gates the PDF.
5. **Failure has a floor.** If extraction fails or is very low-confidence, we still produce a PDF (raw scan pages + whatever fields we got) so the user is never empty-handed. A "Re-run extraction" action is offered on the result screen.

## What changes

### A. Entry point — single button
- `/paper-scans` Upload tab keeps one primary CTA: **"Scan paper report"**. Remove the job-vs-archive mode chooser from the user surface; mode is inferred after review (see D).
- Drag-drop and camera input both funnel into the same pipeline.

### B. Extraction — same as today, just visible
- Reuse `scanPipeline.ts` (`ocr-job-sheet` → normalize → template match).
- Show a single progress bar with sheet-by-sheet ticks. No intermediate dialogs.
- On completion, jump straight to the review screen — do not stop at the queue.

### C. Review screen — one screen, soft signals
`ScanReviewDialog` becomes the *only* review UI, with these tightenings:
- Header: sheet thumbnail + template name + confidence pill. No mode tabs.
- Body: fields inline-editable. Low-confidence rows keep the amber flag (already built) but never disable submit.
- Site / customer / PO: shown as **editable chips with suggested match**, not required fields. Blank is allowed.
- Signature slots: auto-crop preview + "Select from photo" fallback (already built). Both optional.
- Footer: **one** primary button — **"Looks good → build PDF"**. Secondary link: "Re-run extraction".
- Remove every current guard that returns early on missing site/customer/template. Replace with a small "We'll file this as archive-only until you set a site" banner.

### D. Filing decision — inferred, not asked
After the reviewer taps "Looks good":
1. Build the electronic PDF immediately via the shared builder (extract the current `archivePdfBuilder` core into `src/lib/electronicReportPdf.ts` so both flows call the same function).
2. Decide destination **from the data**:
   - Customer + site + PO/date match an open job → attach to that job (silent).
   - Customer + site present, no job match → create a new job (silent) with the PDF as its completed report.
   - Customer/site missing → file as archived document.
3. Show the result screen (see E). The user never had to pick.

### E. Result screen — PDF front and centre
Replaces the current post-confirm toast + navigate-away behaviour.
- Big PDF preview (reuse `PdfPreviewDialog` renderer inline).
- Primary actions: **Download**, **Send to customer**, **Open job / archive entry**.
- Secondary cards, all dismissible, none blocking:
  - "Attach to existing job VFP-00226? (PO match)" — one-click accept.
  - "3 potential defects detected — review" — opens defect drawer.
  - "Signature not captured — add one now" — opens cropper.
- "Scan another" button loops back to step 1.

### F. Background follow-ups
- PO-match / attach-to-existing runs against the same rules already in `confirm_paper_scan_job` RPC; result is surfaced as the card in E, not a modal.
- Defect proposals (`proposeArchiveDefects`) run async after PDF build; card appears when ready.
- Customer/site auto-create logic stays but is silent unless it fails.

### G. Review queue — becomes a safety net, not the main road
- The queue tab still exists for sheets that failed extraction, batch scan-to-email intake, or were explicitly left for later.
- Successful single-sheet uploads should never require a visit to the queue — they go straight from upload → review → PDF.
- Queue rows link into the same unified review screen.

## Guardrails against past blockers

Explicitly forbidden in the review/confirm path:
- Throwing on missing site (the Slate Yard / 201 Deansgate class of bug).
- Throwing on signature crop failure (canvas tainting, no ink bounds).
- Throwing on template mismatch — fall back to generic layout.
- Any "please fix X before continuing" modal.

Every one of these becomes a warning on the result screen with a one-click fix action.

## Technical notes

- New shared entry: `src/lib/electronicReportPdf.ts` — extracted from `archivePdfBuilder.ts`, called by both job-fill and archive-fill paths so the PDF is identical regardless of destination.
- `ScanReviewDialog` submit handler is refactored to: `buildPdf() → decideDestination() → persist()` in that order. PDF build must not depend on destination.
- New result view: `src/components/paper-scan/ScanResultView.tsx` (replaces the toast-and-redirect ending).
- Upload tab primary CTA simplified; mode prop dropped from `BulkScanTab` public surface (kept internally with default "auto").
- Queue tab (`PaperScanQueue`) keeps current behaviour; only the entry paths change.
- No schema changes required. `confirm_paper_scan_job` RPC unchanged — it's just called after PDF build instead of before.

## What we are NOT changing

- The extraction prompts, confidence flags, and amber highlighting shipped previously.
- The archive vs job data models — only how the user reaches them.
- Batch scan-to-email intake — it still lands in the queue tab.
- Existing PO-first display, duplicate-job merge behaviour, or RLS.
