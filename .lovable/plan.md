
# One "Paper scans" section

Today the same activity — "digitise these sheets" — is split across three screens: the "Scan paper report" launcher (job intake), the Paper Scan Queue (`/paper-scan-queue`, job-mode review), and the Archive backlog (`/archive`, archive-mode intake + filed archive list). The pipeline underneath is already shared (`paper_scan_batches` / `paper_scan_batch_items` carry a `mode` column, `ScanReviewDialog` already renders both modes, `scanPipeline.ts` is common). So this is a UX / routing consolidation, not a rewrite.

## The new shape

One sidebar item: **Paper scans**, at `/paper-scans`, with three tabs:

1. **Upload** — single entry point. Drag/drop or pick files, optional camera capture, existing multi-sheet PDF splitting, existing letterhead/customer/template detection. No mode picked here.
2. **Review queue** — every unreviewed sheet from every source (upload, scan-to-email, WhatsApp intake) in one list. Each row shows the AI's suggested outcome as a pill (`Suggested: File as job` / `Suggested: Archive only`) with a one-line reason. Opening a row launches the shared review dialog; the reviewer confirms or flips the outcome there.
3. **History** — one list of everything already processed. Filters: outcome (Job / Archive), customer, site, template, date range, source (upload / email / WhatsApp). Rows link out to the job or the archived document.

Review dialog gains a single **Outcome** toggle at the top:
- **File as job** — current job flow, including the attach-to-existing-job prompt (same customer + site + date, or same PO).
- **Archive only** — current archive flow: electronic PDF built via `archivePdfBuilder`, filed against customer/site, defects pushed into the defects system via `proposeArchiveDefects`, no job created.

The AI suggestion is a default, not a gate. Heuristic (already partially in place): recent date + PO present ⇒ suggest Job; document older than ~60 days, or no PO and template looks like a service record ⇒ suggest Archive. Reviewer can always flip.

## What gets merged

- Sidebar: "Paper Scan Queue" and "Archive" entries collapse to one **Paper scans** entry. Customer-detail archived-documents card stays (it's a customer view, not navigation).
- Routes: `/paper-scan-queue` and `/archive` both redirect to `/paper-scans` (queue tab and history tab respectively) so existing bookmarks and deep links keep working.
- Launchers: the "Scan paper report" button on Jobs and the "Archive scan" button both open the same Upload tab. The mode is decided at review, not at upload.
- Dialogs: `ArchiveScanDialog` and the job-mode intake dialog fold into the single Upload tab (they already share `BulkScanTab` / `scanPipeline`). `ScanReviewDialog` stays as the one review UI, with the new Outcome toggle exposed at the top instead of being fixed by the launcher.
- Badges: `PaperScanQueueBadge` becomes the single unread-review badge on the Paper scans nav item, counting all `pending`/`ready` items regardless of `mode`.

## What gets removed

- The separate "Archive" top-level nav item.
- The separate "Paper Scan Queue" top-level nav item.
- Any "Convert to electronic report" action buried on already-filed archive rows moves into the History tab row menu (same code path).
- Help-article entries pointing at the old routes are updated to the new one (per the "ship rule" for `helpArticles.ts`).

## What is explicitly preserved

Template matching, letterhead/customer detection, site auto-create, `PaperSignatureCropper` capture, PO extraction and PO-first job reference, defect extraction on archive sheets, batch splitting via `split-paper-scan-pdf`, scan-to-email intake, WhatsApp intake, duplicate-job prompt, low-confidence amber flagging, manual signature override persistence, admin-only delete, bulk actions. All the underlying libs (`scanPipeline`, `paperScanConfirm`, `archiveScanConfirm`, `archivePdfBuilder`, `confirmScanQueueAsJob`, `bulkFileAndConvertArchiveItems`) stay as-is — only the shell around them changes.

## Risks and how they're handled

- **In-flight scans.** Any `paper_scan_batch_items` currently `pending` or errored keep their `mode` value and continue to work — the review dialog already reads `mode` per item, so an item mid-review isn't disturbed. The Outcome toggle simply pre-selects that stored `mode`.
- **Already-filed data.** Nothing moves in the database. Existing jobs stay jobs, existing `archived_documents` stay archived. The History tab is a read-only union view over `jobs` (where `source = paper_scan`) and `archived_documents`, filtered by org.
- **Deep links / external bookmarks.** Handled by the two redirects above. Scan-to-email and WhatsApp intake keep writing into the same tables, so no inbound integration changes.
- **RLS.** No schema change, no policy change — same tables, same `has_role_in_org` guards.
- **Suggestion accuracy.** The AI outcome is advisory; the reviewer always confirms. Wrong suggestions cost one click, not data loss.

## Data migration

None required. The `mode` column and `archived_document_id` / `created_job_id` fields on `paper_scan_batch_items` already model the two outcomes, and the History tab is a query, not a new store. Only follow-up: a small backfill query is unnecessary — existing rows already have `mode` set correctly by whichever launcher created them.

## Technical notes

- New page: `src/pages/PaperScans.tsx` with `?tab=upload|review|history` (default `review` if there are pending items, else `upload`).
- Redirects added in `src/App.tsx` for `/paper-scan-queue` and `/archive`.
- `AppLayout.tsx` sidebar: replace the two entries with one `Paper scans` entry using the existing `ClipboardCheck` icon; badge wired to the combined pending count.
- `ScanReviewDialog.tsx`: add an `outcome` state initialised from `item.mode`, render a segmented control at the top, and route the confirm action to `confirmScanQueueAsJob` or `archiveScanConfirm` based on the current toggle rather than a prop. All existing sub-flows (duplicate prompt, signature capture, PO field, low-confidence flagging) are outcome-agnostic and stay put.
- History tab: single `useQuery` returning `{ jobs_from_scans, archived_documents }` merged, sorted by filed date, with client-side filters. No new endpoint.
- `helpArticles.ts`: retire the two old route entries, add one `/paper-scans` entry covering upload, review, outcomes, and history.

## Out of scope (intentionally)

- No changes to the scan pipeline, extraction prompts, or PDF builders.
- No changes to how jobs or archived documents are stored or rendered.
- No new roles, no schema migration.
