# Consolidate full report entry

## Changes
- Remove “Write up full report” from completed-report rows and scanned-report cards, leaving their existing report actions unchanged.
- Add one **Extra** section after **Available Templates** in the shared reports list used by office and engineer views.
- Put the standalone “Write up full report” action and explanatory line in that section, and list existing Site Visit Reports there with their status so they can be continued.
- When submitted or scanned reports exist, open a simple optional checklist before creating the full report. Nothing is selected initially; selected reports contribute their comments beneath one “From the job sheet:” heading.
- Keep the Site Visit Report screens unchanged. Preserve the separate entry currently shown in office **Documents** and engineer **Site documents**, and report those locations back rather than removing them.
- Distinguish duplicate completed report names using each response’s system label, falling back to its riser-location answer where available.
- Update the existing Jobs & reports Help guide for the consolidated entry flow.

## Technical details
- Extend Site Visit Report prefill to accept multiple selected response IDs while keeping existing single-sheet links compatible.
- Keep one source response link for the existing “Check the sheet” behaviour; combine and de-duplicate comments and review warnings from all selected sheets.
- Reuse the shared reports component so office and engineer layouts stay aligned.

## Verification
- Check office and engineer report layouts at tablet width.
- Confirm the selector starts empty, can be skipped, and copies only chosen report comments.
- Confirm duplicate completed reports show their location/system labels and no row-level write-up action remains.
- Run focused tests and confirm the preview build is clean.
