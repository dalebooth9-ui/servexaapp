# Printable site-sheet upgrade

## Goal
A site-ready paper version of each of a job's relevant job sheets that mirrors the digital template 1:1, is pre-filled from the job, prints in the correct quantity per system, and is launchable both from the job page and immediately after a job is created.

## What already works
`BlankTemplatePdfExport` + `src/workers/blankTemplatePdf.worker.ts` already:
- Render the digital template's sections, field order, labels (incl. BS references) and repeating tables.
- Render field types as circleable YES/NO/N/A, P/F/N/A, ruled lines, and blank tables (Comments block, blank signature block with Date/Technician/Signature + Date/Customer/Signature).
- Force Viva Fire branding (blue heading + logo) on any Dry/Wet Riser template.
- Multiply pages by system quantity (`pressure_test_qty` / `visual_qty` / `other_qty`).
- Pre-fill Customer, Site, PO/REF, Riser location in the header when a `jobInfo` is passed.
- Use `resolveTemplateDisplayTitle` so the sheet title = the digital template's proper name.

## Gaps closed by this change

### 1. Header + title tweaks (worker)
- Add `scheduled_date` (from `jobs.due_date` — the office-set site date) to the header details block, printed as filled text.
- Add `assigned_engineer` (first engineer from `jobInfo.engineers`) to the header details block.
- When `systemQty > 1`, append `— System N of M` to the sheet title so each printed copy is unambiguously labelled.
- `JobInfo` type gets `due_date?: string | null` and keeps the existing `engineers` array; worker layout gains a fourth header row for date + engineer without shrinking existing rows.

### 2. `SiteSheetPrintDialog` component (new)
Reusable dialog invoked from both entry points. Given a `jobId` it:
- Loads the job with customer, site, engineers, qtys and `due_date`.
- Resolves the set of relevant templates the same way the post-create loop already does: category = job.category plus `pressure_test` / `visual` if the corresponding qty > 0, `status = published`.
- Renders one row per template with:
  - Template name (canonical display title).
  - A numeric "Copies" input, pre-set to the matching qty (pressure test → `pressure_test_qty`, visual → `visual_qty`, other/commissioning → `other_qty` else 1), min 1.
  - Preview / Download / Print buttons that call the headless `BlankTemplatePdfExport` ref with a `copiesOverride` that the worker uses instead of the auto-derived `systemQty`.
- One "Print all" button that fires each row's print in sequence.
- Small hint at the top: "Site sheets are printed with Customer / Site / PO / Date / Engineer pre-filled. Each copy is labelled System N of M."

The dialog re-uses the existing `BlankTemplatePdfExport` (headless mode) — no duplicate PDF code.

### 3. Entry point A — job page
On `JobDetail.tsx`, add a `Print for site` button next to the existing `Customer Sign-Off` button (same row, same styling), which opens `SiteSheetPrintDialog` for this job.

### 4. Entry point B — job creation success
In `Jobs.tsx` after a successful `insert` into `jobs`, once the existing prefill/notify work has kicked off, show a follow-up toast with a "Print site sheets" action button (using the existing `useToast` action pattern) that opens `SiteSheetPrintDialog` for the newly created job. Same toast copy on both normal and file-drop create paths. Skips silently for jobs whose category has no matching published templates.

## Files touched
- `src/workers/blankTemplatePdf.worker.ts` — header row for date + engineer, System N/M in title, respect `copiesOverride`, extend `JobInfo` and `WorkerPayload`.
- `src/components/BlankTemplatePdfExport.tsx` — pass `copiesOverride` through to worker; expose in `GenerateOpts`.
- `src/components/SiteSheetPrintDialog.tsx` — new.
- `src/pages/JobDetail.tsx` — new "Print for site" button + dialog mount.
- `src/pages/Jobs.tsx` — post-create toast with action; dialog mount at page root.

## Out of scope
- No new database columns; `due_date` and `job_assignments` are already there.
- No changes to the Word export, digital submission flow, or OCR classification.
- No customer-portal exposure — this is an internal office print.
- Backfill / bulk reprint tools.

## Verification
- `bunx vitest run src/test/wordPdfParity.test.ts src/test/wordSinglePage.test.ts` (existing parity + single-page tests must still pass — worker layout changes are additive).
- Manual: create a dry riser job with `pressure_test_qty=2, visual_qty=1, due_date=today, engineer assigned`; from the post-create toast open the dialog, print — expect three sheets (Pressure Test x2 labelled System 1 of 2 / 2 of 2, Visual x1 with no system suffix), each with Customer / Site / PO / Date / Engineer / Riser location filled; open the same dialog from the job page and confirm identical output.