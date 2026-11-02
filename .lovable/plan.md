# Stage 1: Dry riser register and history

Builds on the existing Assets page, defects, asset_service_history, asset_review_flags, the job-sheet sync trigger and the Import Wizard. No new riser tables. Report PDFs and job screens keep their look (the riser picker still saves the same riser location text, so PDFs print the same).

## 0. Bug fix first
- The sync now creates assets with status `operational` instead of `active`.
- If the sync fails, it no longer fails silently: a review flag (`sync_error`) is written with the error and the job/report, and the report submission still succeeds.
- A sheet with no riser location no longer attaches to whichever riser it finds; it gets a review flag instead.
- Matching order: the asset picked on the sheet first, then site + exact riser location.

## 1. Asset IDs
- Every new asset with no tag gets a unique 6-character ID from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I), including ones created by the sync. Existing assets: there are currently none, so no backfill is needed.

## 2. Import Wizard (assets)
- New mappable fields: asset type, riser location, outlets, last inspection date/type/result.
- Keeps the asset-tag duplicate check. Site matched on exact name, then postcode. Customers and sites that don't match are listed for you to confirm; nothing is duplicated.

## 3. Riser picker on dry riser sheets (pressure test + visual)
- "Riser Location" becomes a picker of that site's dry risers, plus "Other / new riser" with a text box.
- Picking one stores the asset link and its exact riser location text.

## 4. Asset review
- New "Asset review" page: asset, site, field, old value, new value, job. Buttons: Use new value, Keep current, Edit. Count badge in the menu (office only).

## 5. Settings > Import history (office only)
- **Report history CSV**: attaches to the asset by tag, else to the site only. Missing sites listed as "site not found" and skipped unless "Create missing sites" is ticked. Date text parsed ("OCT 2026" -> 2026-10-01) and original text kept. Skips same site + report file.
- **Remedial CSV**: one defect per row (title, "Imported from <file>", work done as resolution notes, severity from priority, default medium; "done" -> resolved, otherwise open; unclear status flagged for review). Dates from report_date; reported by you.
- Both show a preview with counts and problems first, then a "Done" summary.

## 6. Dry riser asset page and site page
- Asset page: riser location large at the top, then outlets, status, last inspection; a History tab (newest first, with report link) and Open defects.
- Site page: "Dry risers" list (location, outlets, last result) and site-level history in the existing Site history panel.

## 7. Office editing
- Edit riser location, outlets, status and notes; move a riser to another site; merge two duplicate risers (history, defects and review flags move to the kept one; the other is decommissioned and noted, not deleted).
- Dry risers table view with inline editing of location and outlets, plus "Blank outlets" and "Faulty" filters.

Help guides are updated for each new screen.

## Technical details
- Database changes (additive):
  - Replace `sync_asset_from_job_sheet` and its trigger wrapper; the `WHEN OTHERS` handler inserts an `asset_review_flags` row (field `sync_error`). `asset_review_flags.asset_id` becomes nullable for flags with no asset yet; `site_id` is added.
  - `generate_asset_tag()` + BEFORE INSERT trigger on `assets` (retry on collision); partial unique index on `(org_id, asset_tag)`.
  - `asset_service_history`: `asset_id` nullable; add `site_id`, `report_file`, `report_link`, `report_date_text`; unique `(site_id, report_file)` where report_file is set.
  - `defects`: no new columns (uses `source_kind = 'import'`).
  - Sheet answers store `riser_asset_id` next to `riser_location`.
  - RPCs `merge_assets(keep, remove)` and `move_asset_site(asset, site)`, security definer, admin + same org checks.
  - Every new or changed column/table carries `org_id` with org-scoped RLS via `get_user_org_id()`; no `USING (true)`.
- Frontend: `schemas.ts` + `ImportWizard.tsx`, the dry riser template field renderer (new picker field type, mapped by field key), `AssetDetail.tsx`, `Assets.tsx` (table view), new `AssetReview` page and `ImportHistory` settings section, site page panel, menu badge.
- Tests: tag alphabet/length, date-text parsing, priority -> severity and status mapping.

## What may not be testable
- Submitting real dry riser sheets as an engineer on a tablet against live jobs (I'd use a test job only if you're happy with that).
- Imports with your real CSVs until you upload them.
