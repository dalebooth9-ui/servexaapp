
# Universal Import Wizard

A single entry-point wizard that lets a new company drop in a CSV/XLSX export from Uptick, simPRO, Joblogic, Tradify, or a spreadsheet and get it into Servexa without reformatting. Reuses existing plumbing where possible.

## Scope (this build)

Three record types: **customers**, **sites**, **assets**. Deliberately excluded (can follow later): jobs, engineers, parts, PPM schedules.

## Entry points

- Settings → new **"Import Data"** card (admin only).
- New route `/settings/import` opening the wizard.
- Deep link from the Getting Started / Setup guide on the Customers and Sites steps ("Import from spreadsheet →").

## Wizard flow (5 steps)

```text
1. Choose type   →   2. Upload file   →   3. AI column mapping
                                                 ↓
                        5. Result summary   ←   4. Preview & validate
                        (+ Undo batch)
```

### Step 1 — Choose record type
Cards: Customers / Sites / Assets. Each shows the target fields and a "download example template" link (reuses existing example generators from BulkImport dialogs).

### Step 2 — Upload
- Accept `.csv`, `.xlsx`, `.xls`, one file, up to ~10MB.
- Parse client-side with existing `readExcelFile` (already in `src/lib/excelUtils.ts`) and a small CSV parser (Papa Parse — add dep) into `{ headers: string[], rows: string[][] }`.
- Cap to 5,000 data rows per import; over that, show a friendly message asking the user to split.

### Step 3 — AI column mapping
- New edge function `suggest-import-mapping` calls Lovable AI (`google/gemini-2.5-flash`) with the source headers + 5 sample rows + the target schema for the chosen type. Returns `{ mapping: { targetField: sourceHeader|null }, confidence, notes }`.
- UI: two-column table — target field on the left, dropdown of source columns on the right, sample values shown beneath. User can override any mapping. Required fields are marked; the Next button disables until they're mapped.
- Fallback: heuristic name-match (lowercased, punctuation stripped, common aliases like "company" → name, "postcode/zip" → postcode) runs first so AI is only needed for ambiguous columns; if AI call fails, mapping still works.

### Step 4 — Preview & validate
Client-side transform rows using the confirmed mapping, then validate:
- **Required missing** → flagged red, row excluded unless fixed inline.
- **Duplicate against existing** — customers by lowercased name, sites by name+postcode, assets by asset_tag or (name+site). Query in batches with `.in()`.
- **Unmatched parent** (sites → customer, assets → site): fuzzy match against existing records using `src/lib/fuzzyMatch.ts`. Show best match with a confidence badge; user can accept, pick a different one, or mark "create new".
- **Within-file duplicates** collapsed.
- Row-level actions: **Skip**, **Fix** (inline edit), **Merge with existing** (writes to existing row, keeps id).
- Summary counters at the top: `X to create · Y to merge · Z skipped · N problems`.

### Step 5 — Commit
- New edge function `commit-import` (service-role, admin-only). Receives resolved rows + type + `import_batch_id` (uuid generated client-side).
- Inserts in chunks of 500 with progress reported back via a simple polling record in a new `import_batches` table (status, processed, total, errors).
- Every created row gets `import_batch_id` and `imported_at` columns.
- Merges do a targeted UPDATE on the existing row for empty fields only (non-destructive fill).
- On completion: summary screen with counts + **"Undo this import"** button that deletes all rows tagged with the batch id (only rows still untouched since insert — checked via `updated_at = created_at`).

## Data model changes

New migration:

- `import_batches` table — org_id, created_by, entity_type, source_filename, row_count, created_count, merged_count, skipped_count, status (`pending|running|complete|failed|undone`), error_summary jsonb. RLS: org-scoped read/write for admins; service_role all.
- Add nullable columns `import_batch_id uuid` and `imported_at timestamptz` to `customers`, `sites`, `assets` (indexed on `import_batch_id`).
- Grants + RLS in the same migration per project rules.

## Reused plumbing

- `src/lib/excelUtils.ts` for XLSX parsing.
- `src/lib/fuzzyMatch.ts` for parent matching.
- Pattern from `BulkImportCustomersDialog` / `BulkImportSitesDialog` / `BulkImportAssetsDialog` for validation and insert shape — the wizard replaces the per-entity dialogs' AI step but keeps their target schemas.
- `parse-import-generic` stays as-is for the existing document-drop flow; the new mapping function is separate because it's header→field, not full extraction.

## Files

New:
- `supabase/migrations/<ts>_import_wizard.sql`
- `supabase/functions/suggest-import-mapping/index.ts`
- `supabase/functions/commit-import/index.ts`
- `src/pages/ImportWizard.tsx` (route `/settings/import`)
- `src/components/import-wizard/StepChooseType.tsx`
- `src/components/import-wizard/StepUpload.tsx`
- `src/components/import-wizard/StepMapping.tsx`
- `src/components/import-wizard/StepReview.tsx`
- `src/components/import-wizard/StepResult.tsx`
- `src/components/import-wizard/schemas.ts` (target field defs per entity)
- `src/lib/importMapping.ts` (heuristic mapper + row transform + validators)

Edited:
- `src/App.tsx` — route.
- `src/pages/SettingsPage.tsx` — Import Data card.
- `src/pages/SetupGuide.tsx` — "Import from spreadsheet" link on customers/sites steps.
- `package.json` — add `papaparse` + `@types/papaparse`.

## Multi-tenancy

Everything writes with the acting user's `org_id` (resolved via `get_user_org_id()` in the commit function). No cross-org reads. Undo is scoped to the batch's org_id + admin role check.

## Out of scope

- Jobs / PPM / engineers / parts import.
- Direct API connectors to Uptick/simPRO/etc. (CSV export is the interop layer.)
- Background/async import for >5,000 rows — synchronous chunked commit is enough for the stated scale.
