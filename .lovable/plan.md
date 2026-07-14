# Bulk Scan Paper Reports

Extend the existing "Scan Paper Report" flow with a bulk mode that turns a stack of photos into a review queue, one paper form at a time, feeding the same single-form review UI already built.

## User flow

1. **Open dialog** → new tab **"Bulk scan"** alongside the existing "Single scan" tab in `ScanCompletedJobDialog`.
2. **Upload & group** (step 1)
   - Drop 20–40 photos.
   - Default grouping: 1 photo = 1 form.
   - Grouping UI: thumbnails in a grid; select 2+ and click "Group as one form (front/back)" to bundle them. Bundle shows as a small stack with a badge (e.g. "2 pages"). "Ungroup" reverses it.
   - Show `N forms detected` counter.
3. **Start batch** (step 2)
   - Client uploads each photo to `submissions` bucket under `paper-batches/<batch_id>/…` (reusing existing storage patterns — admin-only path).
   - Creates a `paper_scan_batches` row + one `paper_scan_batch_items` row per form (with the list of image paths).
   - Fires background edge function `process-paper-scan-batch` (fire-and-forget via `supabase.functions.invoke` with no await on completion; function iterates items).
   - Dialog shows live progress (Realtime channel or polling every 3s on the batch row).
4. **Review queue** (step 3, and also reachable from Jobs page)
   - New page `/paper-scan-queue` (admin-only) that lists all items across recent batches with columns: thumbnail, detected template, customer/site guess, date guess, status badge (`ready` / `low_confidence` / `failed` / `confirmed` / `rejected`), age.
   - Badge count in the Jobs page (like Jobs-to-Approve badge) showing pending items.
5. **Per-item review** → reuses the existing single-scan review step (extracted body + customer/site pickers + create-site inline). Confirm = same insert path as single flow (job + response + `job_documents`). Reject = mark item `rejected`, keep photos.

## Files

**New**
- `supabase/migrations/<ts>_paper_scan_batches.sql` — two tables + RLS.
- `supabase/functions/process-paper-scan-batch/index.ts` — background orchestrator. For each `pending` item: fetch photos, call the shared classification + OCR helpers (same code path as `classify-job-sheet-template` and `ocr-job-sheet`), store result on the item row, set status. Continues on per-item error (sets item to `failed` with `error` text).
- `src/pages/PaperScanQueue.tsx` — queue list page.
- `src/components/paper-scan/BulkScanTab.tsx` — upload + grouping UI inside dialog.
- `src/components/paper-scan/PhotoGrouper.tsx` — small grid + group/ungroup controls.
- `src/components/paper-scan/BatchProgress.tsx` — realtime/polled progress bar.
- `src/components/paper-scan/PaperScanQueueBadge.tsx` — count badge for Jobs page.
- `src/hooks/usePaperScanQueue.ts` — realtime subscribe + counts.

**Edited**
- `src/components/ScanCompletedJobDialog.tsx` — wrap existing steps in a Tabs (`Single` | `Bulk`); when opened from a queue item, jump straight to the review step with the item's extracted payload pre-loaded.
- `src/pages/Jobs.tsx` — add "Paper scan queue" button + badge next to the existing "Scan Paper Report" trigger.
- `src/App.tsx` — register `/paper-scan-queue` route (admin-only, matches existing admin route pattern).

## Data model

```sql
-- Header: one row per uploaded batch
create table public.paper_scan_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  created_by uuid not null,
  status text not null default 'processing', -- processing | complete
  total_items int not null default 0,
  processed_items int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per form (may reference N photos)
create table public.paper_scan_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.paper_scan_batches(id) on delete cascade,
  org_id uuid not null,
  image_paths text[] not null,                    -- storage paths in `submissions`
  status text not null default 'pending',         -- pending | processing | ready | low_confidence | failed | confirmed | rejected
  confidence numeric,
  detected_template_id uuid,
  candidate_matches jsonb,
  extracted jsonb,                                -- { header, responses, ... } same shape single-scan returns
  guess_customer_id uuid,
  guess_site_id uuid,
  guess_date date,
  error text,
  created_job_id uuid,                            -- set on confirm
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Grants + RLS: authenticated can select/insert/update rows scoped to their org via existing `get_user_org_id()` helper; admin-only enforced at the edge function AND in policies via `has_role_in_org(auth.uid(), org_id, 'admin')`. `service_role` full access for the background function.

Status thresholds: `confidence >= 0.7` → `ready`; `< 0.7` → `low_confidence`; parse error → `failed`.

## Background processing

- `process-paper-scan-batch` accepts `{ batch_id }`, verifies caller is admin in the batch's org, then iterates items marked `pending`.
- For each item: download signed URLs → classify → OCR against chosen template → attempt to guess customer/site by matching extracted "site name/address" against `sites` table (fuzzy, best effort — falls back to null; guess is a hint only).
- Writes result + status back to `paper_scan_batch_items`; increments `paper_scan_batches.processed_items`.
- Chunked (max 5 items per invocation loop; if more remain, re-invokes itself) to stay well under edge function CPU limits.
- Shared logic from existing `classify-job-sheet-template` and `ocr-job-sheet` extracted into `supabase/functions/_shared/paperScan.ts` (pure refactor).

## Confirm path

On confirm from queue: call the same insert routine currently in `ScanCompletedJobDialog` (extract into `src/lib/paperScanConfirm.ts` helper so both single and bulk flows reuse it). Copies photos from `paper-batches/…` into the job's `job-documents` path, sets item status to `confirmed`, stores `created_job_id`.

## Out of scope (v1)

- No cross-batch dedupe.
- No auto-assign customer/site — always human confirm.
- No mobile-optimised review; desktop table + existing dialog.
- No CSV export of batch results.
