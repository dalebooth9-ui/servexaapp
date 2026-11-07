# Multi-riser visits and safe job merging

## Confirmed example
- The site has four active risers, but VFP-00267 currently links only Sprayton Way Block 1. That explains the single printed sheet.
- VFP-00265 and VFP-00266 link the same Moberly Core 1 riser and both use Dry Riser Visual. VFP-00267 links a different riser and uses Dry Riser Pressure Test, so it should not be flagged as their duplicate.

## Job page and printing
1. Add a persistent job riser list, initially populated for existing jobs from their current asset and report links, without silently adding every site riser to existing visits.
2. Show **Risers on this job** with saved tick boxes and **Other risers on this site** greyed out with **Add to this job**. Show each riser's location and tag so records are distinguishable. Unticking excludes it from this visit's service/print selection without deleting its reports or history.
3. Both top-row and Documents **Print reports (N risers)** buttons use the same saved selection. Produce one engineer sheet per ticked riser, retaining that riser's existing visual/pressure template when applicable. If any selected riser cannot print, show a clear error instead of silently producing fewer sheets. Keep any separate job Visual Inspection document in the report flow; never include stickers.
4. Job sticker packs start with the selected job risers and allow ticking other site risers without changing visit membership. Include each inlet and every fitted outlet, using existing permanent codes and current label layout.
5. Newly created site jobs include all active, non-merged dry/wet risers on that site by default. Explicit per-riser scan starts remain targeted to the scanned riser, preserving the existing scan workflow. No retrospective expansion of existing jobs.

## Duplicate review and Merge jobs
1. Replace broad site/PO matching in the job-page warning with the same company, site, shared riser and job type. Show the matching riser's location and tag beside each reference.
2. Provide an office/admin **Merge jobs** picker for same-site jobs, allowing selection of VFP-00265, VFP-00266 and VFP-00267 even though not all are true duplicates. Choose which job to keep.
3. Preview risers, reports, defects, history, schedules, assignments, documents and other linked records. Clearly warn about differing job types; retain the kept job's type and preserve existing report types, results and signatures.
4. Require explicit confirmation. Combine riser memberships, move linked records transactionally and archive source jobs, never delete them. Preserve original references and merge provenance in history. Block unresolved conflicts rather than discard data.
5. Do not merge these example jobs automatically during implementation.

## Technical safeguards
- Add an org-scoped job–riser association with selection state and uniqueness per job/asset. Server-side validation enforces company and site ownership; field users retain required read access, membership changes remain office/admin-only.
- Inventory live job foreign keys, non-FK references, uniqueness constraints and triggers before implementing merge. Use protected preview/confirm RPCs with locks and stale-preview checks, archive pointers and immutable audit records. Preserve historical storage references and existing QR identities.
- Use one shared selected-riser loader for counts, report generation, sticker defaults and duplicate matching. Preserve tenant-scoped template and branding resolution.
- Update Help articles, assistant destinations and architecture rules alongside the feature.

## Verification
- Test four selected risers produce four riser sheets and the count agrees in both print locations; test one, unticking, missing-template errors and dry/wet cases.
- Test duplicate matching: 00265/00266 qualify, 00267 does not merely because it shares the site.
- Test merge preservation, archive behavior, rollback on conflicts, stale previews, cross-company and non-admin rejection using isolated fixtures; leave real example jobs untouched.
- Check the example page and selection on desktop/phone, sticker inlet/outlet coverage and new-site-job defaults. Report the verified build time and any physical-print limitation.