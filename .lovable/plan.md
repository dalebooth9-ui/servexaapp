# Stage 5: wet risers

Wet risers get the same register, stickers, scanning, history and report QR that dry risers have. Nothing else changes.

## What you'll see
1. **Assets > Risers tab** (this was the Dry risers tab). It has an All / Dry / Wet filter, a Type column, and the same Sticker column and filters. The riser page, History, Open defects, Edit, Move site and Merge duplicate all work for wet risers too. Merging only works between two risers of the same type.
2. **Wet Riser — Annual Service & Test**: a "Riser" picker shows **above the form**. It lists the site's wet risers, plus "Other / new riser". The form and its PDF layout stay the same. When the report is submitted it creates or links a Wet Riser asset. A wet riser report never links to a dry riser, and a dry riser report never links to a wet riser. If no riser is picked, the report goes to Asset review, the same as dry risers. Your system has no wet riser inspection report, so there's nothing else to change.
3. **Sticker pack and the site's sticker list** include both dry and wet risers, with the same labels and the same "already placed" tick box.
4. **Scan page /r/ID** works for wet risers. "Start service" creates a wet riser annual service job.
5. **Wet riser report PDFs** that are linked to a riser print the same 20 mm QR and Riser ID in the top-right corner. The same customer-branding rule applies.
6. **Import Wizard and Settings > Import history** accept "Wet Riser" and match it by asset_tag, the same as dry risers.
7. **Lists that load a whole table** of sites, customers or assets will load 1,000 rows at a time until every row is in. This covers the riser register, the riser-related pages, and the historic import page's site-to-customer links.
8. **Help guides**: the Assets, Asset review, Import history and sticker/scan guides now cover wet risers.

## Technical details
- `src/lib/dryRisers.ts`: add `isWetRiserAsset`, `isRiserAsset`, `riserTypeOf()`. Existing dry helpers stay unchanged.
- `siteRisers.ts`: `fetchSiteRisers(siteId, type?)`. The type is optional; the picker passes it and the sticker pack doesn't. Results also return `asset_type`.
- `DryRisersTable.tsx` gets the type filter and Type column. `Assets.tsx` renames the tab. `AssetDetail.tsx` shows `DryRiserPanel` for any riser, with its title taken from the riser type. `SiteDryRisers` lists both types.
- `JobSheetTemplates.tsx`: add `isWetRiserTemplate` (`wet_riser_*` job category or "wet riser" in the name). For wet sheets, show `RiserLocationPicker` above the form. It writes `riser_asset_id` and `riser_location` into the answers but doesn't render them as fields. The site sticker list shows on wet sheets too.
- One database migration replaces `sync_asset_from_job_sheet`:
  - Detect the riser type from the template's category or job_category.
  - Match the chosen asset only if its asset_type matches. Otherwise match on site + asset_type + lower(riser_location). Otherwise insert a new asset with asset_type/category "Wet Riser" and status operational.
  - The flags (missing location, outlet disagreement, sync_error) work as before.
  - `merge_assets` refuses to merge risers of different types.
  - No new tables or columns. Org checks stay as they are.
- `RiserScan.tsx`: "Start service" picks the wet riser annual service category and template for wet risers. The asset lookup RPC already returns any asset by tag. Only the dry-riser check in the page is widened.
- `JobSheetPdfExport.tsx`: the QR block runs for dry or wet riser templates when `riser_asset_id` is set. The dry riser layout constants stay dry-only.
- `commit-import/index.ts` and `ImportHistory.tsx`/`StepReview.tsx`: detect "wet riser" the same way as dry and set asset_type/category to "Wet Riser". The commit-import function is redeployed.
- Switch the whole-table loaders in the touched riser and import files to `fetchAllRows`.
- Tests: extend `dryRisers.test.ts` with riser type detection, plus a database dry run (rolled back) checking that wet riser reports never link to dry risers.
- Help articles and `AGENTS.md` (riser rule) get updated.
