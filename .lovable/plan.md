
## Goal

One extraction pipeline and one review UI for every paper-scan door. The mode (job vs archive) only changes destination behaviour — not what gets extracted, prefilled, cropped, or shown to the reviewer.

## Audit — current divergence

Three entry points call `ocr-job-sheet` with different arguments and render different review dialogs:

| Entry point | Component | Review dialog | Notable divergences vs archive path |
|---|---|---|---|
| Scan Paper Report (job) — from `JobSheetTemplates`, `Jobs`, `AdminDashboard.QuickScan` | `ScanJobSheet`, `ScanCompletedJobDialog`, `QuickScanDialog` | inline in `ScanCompletedJobDialog` (~1800 lines) | template forced by user; no letterhead→customer match; no site auto-extract prefill; no per-field confidence flags; no manual "Select from photo" for customer sig; defect capture uses different path; different header-field set (no cabinet keys/riser location handling as in archive) |
| Paper Scan Queue — bulk email/upload intake | `BatchScanDialog` + `PaperScanQueue` | routes each item to either `ScanCompletedJobDialog` (job mode) or `ArchiveReviewDialog` (archive mode) | two different dialogs for the same underlying item — fixes to one miss the other |
| Archive Paper Backlog | `ArchiveScanDialog` → `ArchiveReviewDialog` | `ArchiveReviewDialog` (~1045 lines) | has all latest features: confidence flags, `PaperSignatureCropper`, customer guard, site fuzzy-match, defect proposals, manual sig override persistence |

Backend already has a shared function (`ocr-job-sheet`) but each caller passes different `mode`/`options` and post-processes results differently, so extraction results diverge in practice.

## Target architecture

```text
                    ┌──────────────────────────────┐
Job door ──┐        │  runScanPipeline()           │        ┌── job:    confirmScanAsJob()
Queue door ┼──────► │  (src/lib/scanPipeline.ts)   │ ─────► │
Archive dr ┘        │  split → identify → extract  │        └── archive: confirmScanAsArchive()
                    │  → match customer/site/sig   │
                    └──────────────────────────────┘
                                │
                                ▼
                    ┌──────────────────────────────┐
                    │  <ScanReviewDialog mode=…/>  │  one component, all three doors
                    └──────────────────────────────┘
```

### 1. Shared pipeline module — `src/lib/scanPipeline.ts` (new)

Single async function returning a normalised `ScanReviewState`:
- page split (calls `split-paper-scan-pdf` when needed)
- template detection (identify pass on `ocr-job-sheet`)
- letterhead → customer fuzzy match (extract from `matchSiteFromHeader` + `customerNameGuard`)
- site extract + prefill
- header fields: date, PO, riser location, cabinet keys, outlets, valve type
- full answer extraction with `field_confidence`
- comments line-integrity flag
- defect / remedial indicators
- technician name → `engineer_signatures` profile match
- customer signature auto-crop

Edge function stays `ocr-job-sheet`; a thin wrapper enforces one canonical request shape and one response schema. `process-paper-scan-batch` is updated to call the same wrapper server-side so queue items get identical output.

### 2. Shared review component — `src/components/paper-scan/ScanReviewDialog.tsx` (new)

Built by generalising `ArchiveReviewDialog` (which already has the richest UX). Props:

```ts
type Mode = "job" | "archive";
interface Props {
  mode: Mode;
  source: ScanReviewState;   // from runScanPipeline
  onConfirm: (result) => void;
}
```

Body is identical across modes: header fields, extracted answers with amber confidence flags, `PaperSignatureCropper` "Select from photo" for both customer + technician, customer/site pickers with guards, defect list.

A small `<DestinationSection mode={mode}/>` at the bottom renders **only** the mode-specific bit:
- `job`: job name, engineer, "backfill visit date" toggle, planner visibility rules → routes to `confirm_paper_scan_job` RPC / existing job flow
- `archive`: archive folder metadata → routes to `archiveScanConfirm`

### 3. Migration + deletion

Wire the three doors to the new component + pipeline, then delete divergent code:

- Delete `src/components/ScanCompletedJobDialog.tsx` (~1800 lines)
- Delete `src/components/QuickScanDialog.tsx` (~1427 lines) — replace with a thin launcher opening `ScanReviewDialog` in `mode="job"`
- Delete `src/components/paper-scan/ArchiveReviewDialog.tsx` (~1045 lines) after content is folded into the shared component
- Slim `src/components/ScanJobSheet.tsx` to a launcher
- Slim `BatchScanDialog` to just choose destination then hand off to shared pipeline
- Update `PaperScanQueue`, `Jobs`, `AdminDashboard`, `JobSheetTemplates`, `ArchivedDocuments` mount sites

Net removal: ~4000 lines of duplicated logic collapse into ~1200 lines shared.

### 4. Regression check

Run one representative paper sheet through each door and verify:
- identical extracted header fields, answers, confidences
- identical customer/site match suggestions
- identical signature crop suggestions and manual-crop override behaviour
- output filed correctly: job door → job created; queue door → whichever mode picked; archive door → archived document

## Out of scope

- No changes to the OCR prompt/quality (already unified last turn)
- No new features — this is purely convergence + deletion
- Historic already-processed items are not re-run

## Risk / callouts

- `ScanCompletedJobDialog` is the biggest surface (1800 lines) and is mounted from multiple pages — regressions here would break the primary job-completion flow. I will keep the old file untouched until the new component is wired and smoke-tested, then delete in the same commit.
- Server-side `process-paper-scan-batch` currently calls `ocr-job-sheet` directly; I will keep its HTTP contract identical and only change the response normalisation to match the client wrapper.

## Deliverables in build

1. `src/lib/scanPipeline.ts` — shared pipeline
2. `src/components/paper-scan/ScanReviewDialog.tsx` — shared review UI
3. Thin launchers replacing the three big dialogs
4. Deletions of the divergent files listed above
5. Written diff-report of behavioural differences found & eliminated, returned in the closing message
