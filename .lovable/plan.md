
# Stage B storage back-fill — build plan

Approved delivery for option (a). Nothing gets moved until Dale presses buttons in the new admin panel. Everything below is code + a schema migration; no live storage mutations happen in this build step.

## 1. New table: `storage_backfill_log`

Rollback + orchestration manifest. One row per planned unit of work.

Columns:
- `id uuid pk`
- `bucket text not null` — one of: signatures, engineer-documents, customer-paperwork, asset-documents, site-survey-media, submissions, blank-template-pdfs
- `old_name text` — current object name in bucket (null for pure-DB rewrite rows if any; here always set)
- `new_name text` — target org-prefixed name (null for `op = 'delete'` rows)
- `op text not null check (op in ('move','delete'))` — blank-template-pdfs entries are `delete`; everything else is `move`
- `org_id uuid not null` — attribution: Viva `11111111-1111-1111-1111-111111111111` unless a DB row ties the object to Test Fire Co
- `is_orphan boolean not null default false` — true when no DB ref found
- `db_rewrites jsonb not null default '[]'` — array of `{table, row_id, column, json_path?, old_value, new_value}` to apply atomically with the move
- `status text not null default 'pending' check (status in ('pending','in_progress','done','failed','skipped'))`
- `attempts int not null default 0`
- `last_error text`
- `dry_run_result jsonb` — last dry-run outcome per row
- `run_result jsonb` — final result
- `created_at`, `updated_at` (auto)
- Indexes on `(bucket, status)`, `(bucket, is_orphan)`

RLS: admin-only SELECT; INSERT/UPDATE/DELETE service_role only. Explicit GRANTs per house rules.

## 2. New-path scheme (must be deterministic)

For every `move` row:
```
new_name = "<org_id>/" + old_name        // when old_name doesn't already start with an org uuid
new_name = old_name                       // no-op skip (already org-prefixed → status='skipped' at prepare time)
```
Rationale: matches `buildOrgPath()` in `src/lib/orgStoragePath.ts` — the same scheme new uploads already use. Per-object storage RLS keys off the first path segment.

Special cases:
- `blank-template-pdfs` — single stale cache object → `op='delete'` (no new_name).
- Anything already prefixed with a valid org uuid → `status='skipped'` (no work).

## 3. DB ref-map (columns rewritten atomically with each move)

For every move, we scan these columns for the old reference and rewrite in place:

**Text columns holding storage refs / URLs**
- `submissions.file_url`
- `job_documents.file_url`
- `customer_documents.file_url`
- `customer_paperwork.file_url`
- `job_signatures.file_path`
- `engineer_signatures.file_path`
- `engineer_documents.file_url`
- `asset_documents.file_url`
- `rams_documents.pdf_url`, `rams_documents.word_url`, `rams_documents.file_url`
- `conformity_certificates.pdf_url`, `conformity_certificates.file_url`
- `site_survey_photos.photo_url`, `site_survey_photos.file_url`
- `job_site_survey_photos.photo_url`, `job_site_survey_photos.file_url`
- `paper_scan_batch_items.file_url`, `paper_scan_batch_items.pdf_url`
- `field_reports.content` (substring rewrite for embedded refs)
- `job_messages.content` (substring rewrite — confirmed 0 matches at pre-flight; still scanned)

**JSONB (path-walk rewrite)**
- `job_sheet_responses.responses`
- `paper_scan_batch_items.raw_ocr`

Each rewrite handles all three ref shapes: bare path, `storage://bucket/path`, and legacy `/object/(public|sign)/bucket/path` URLs (via `parseStorageRef`).

## 4. Edge function: `stage-b-backfill`

Deployed with `verify_jwt = false`, gated by `x-cron-secret` header matching the `CRON_SECRET` runtime secret. Uses `SUPABASE_SERVICE_ROLE_KEY` (available inside functions; never exposed to browser).

Endpoints (single function, action switch):
- `POST { action: 'prepare' }` — scans `storage.objects` for the 7 buckets, cross-joins the 21 ref-map columns, populates `storage_backfill_log` idempotently (upsert on `(bucket, old_name)`). Attribution rule: if any DB ref matches, take that row's owning org (via job → org / template → org / profile → org, following existing FKs); else Viva. Returns per-bucket counts.
- `POST { action: 'status' }` — returns per-bucket pending/done/failed/skipped tallies + which buckets are unlocked (order gate).
- `POST { action: 'dry_run', bucket }` — for each pending row in that bucket: verifies old object exists, verifies new path is free, verifies every db_rewrites target row still contains old_value. Writes result to `dry_run_result`. No mutations.
- `POST { action: 'run', bucket }` — enforces order gate (signatures → engineer-documents → customer-paperwork → asset-documents → site-survey-media → submissions → blank-template-pdfs). For each pending row:
  1. `update status='in_progress', attempts+=1`
  2. `storage.from(bucket).move(old, new)` (or `.remove([old])` for delete op)
  3. Apply every entry in `db_rewrites` in a single transaction via a security-definer RPC `apply_backfill_rewrites(row_id uuid)` (RPC reads its own manifest row → safer than passing arbitrary SQL from the function).
  4. On success: `status='done'`, `run_result` set. On failure: `status='failed'`, `last_error` set, STOP that bucket (don't process further rows).
- `POST { action: 'integrity_check', bucket }` — post-run: samples 20 done rows, verifies new object exists, verifies old is gone, verifies each rewritten DB cell now contains new ref and not old. Returns `{ pass: boolean, failures: [...] }`.
- `POST { action: 'rollback', bucket }` — reverses done rows using the manifest (move back + rewrite back). Manual, for emergencies.

The `apply_backfill_rewrites` RPC is a security-definer function created in the same migration; it takes only a manifest row id, reads `db_rewrites`, and applies each `UPDATE <table> SET <column> = <new_value> WHERE id = <row_id> AND <column> = <old_value>` (guard clause prevents clobbering concurrent edits). For JSONB entries it uses `jsonb_set` with the recorded json_path. Transactional.

## 5. Admin panel: Settings → Advanced → "Storage migration (one-off)"

New tab in `SettingsPage.tsx`, admin-only (gated by `userRole === 'admin'`).

Layout — one card per bucket in enforced order:

```text
┌─ signatures ──────────────────────────────┐
│ Pending: 23   Done: 0   Failed: 0         │
│ [ Dry run ]  [ Run ]                      │
│ Last result: —                            │
│ Integrity: —                              │
└───────────────────────────────────────────┘
```

Rules:
- Later buckets show "Locked — complete <previous bucket> first" and buttons disabled until the previous bucket is `done` with `pass` integrity.
- "Dry run" invokes `dry_run`; result line shows `Ready to move N / N` or `Blocked: <reasons>` with a details expander.
- "Run" invokes `run`; live-polls `status` every 2s while the bucket is `in_progress`; result line shows `Moved M · Rewrote R db rows · Failed F`.
- After a run, auto-fires `integrity_check` and shows a green PASS or red FAIL badge; on FAIL, lists the failing rows with `old_name`, `new_name`, `last_error`.
- Failures halt that bucket; the Run button label switches to "Retry failed" and only re-picks `failed` rows.
- Top of panel: "Refresh manifest" button (calls `prepare`) + a red "Danger: Rollback bucket" section collapsed by default.

Client → function calls use `supabase.functions.invoke('stage-b-backfill', { body })` — the cron-secret gating happens inside the function against the caller's JWT (admin check via `has_role`) OR the `x-cron-secret` header. For the panel path we authenticate the admin's JWT server-side inside the function; no secret leaves the server.

## 6. Delivery order (what I will do this turn)

1. Migration: create `storage_backfill_log`, indexes, RLS, GRANTs, and the `apply_backfill_rewrites` RPC.
2. Write the `stage-b-backfill` edge function with all 6 actions above.
3. Deploy the function.
4. Invoke `prepare` once (the panel's Refresh button also does this) so the log is populated with real pending counts — this is a read-only scan of storage + DB; no moves happen.
5. Add the admin panel tab.
6. Verify: query `storage_backfill_log` per-bucket counts and report back. No `run` is invoked; that's Dale.

## 7. What I explicitly do NOT do in this turn

- No `storage.from().move()` calls.
- No `storage.from().remove()` calls.
- No DB ref rewrites outside the manifest table itself.
- No invocation of `run` or `integrity_check` for any bucket.

## Ack items (one word each is fine)

- **Path scheme** `<org_id>/<old_name>` — OK?
- **Orphan attribution** to Viva under their existing paths (no `_orphaned/` quarantine prefix — that was my earlier suggestion, I'm dropping it since it complicates rollback and you didn't ask for it) — OK?
- **`prepare` runs automatically** at the end of this turn to populate real counts — OK?
