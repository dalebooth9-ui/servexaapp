# Fix "Submit to office" validation and merge with job completion

## What changes for engineers
1. **Only forms they've started are checked.** A form counts as "started" once any answer is entered (draft or submitted). Untouched forms never block.
2. **"Not done on this visit"** on every form card on the job, with a quick reason: Not required / No access / Office instructed / Other (Other asks for a short note). Skipped forms are left out of the checks and the PDF, can be un-skipped, and the reason appears on the job timeline.
3. **Always optional** on every template: Comments, Materials required, and any notes/free-text fields, whatever the template says.
4. **Duplicate questions:** remove the second "BS9990:2015 7.4.3.1 Outlet cabinets in good condition?" from Dry Riser Pressure Test (all org copies), then scan every template for other duplicates and remove only exact repeats within the same section. I'll list what was removed.
5. **One button: "Complete & submit to office".** One tap checks everything (started forms, engineer signature, blocking remedials — customer signature stays optional), saves the report, marks the job complete, builds the PDF and sends it to the office. The separate "Job complete" button goes from the engineer page. Works offline the same way ("Waiting for signal").
6. **"Fill these in first"** stays, grouped under each form name; tapping an item opens that form and scrolls to and highlights the field.

## Decision to confirm
The job will show as **Submitted for review** in the office's "Reports to check" until they send it to the customer, then **Completed** (as now). "Marks complete" here means the engineer's part is finished and they get the "Sent to office ✓" confirmation. Say if you'd rather the job show Completed straight away.

## Technical details
- `job_sheet_responses`: add `skipped_at`, `skipped_by`, `skip_reason`, `skip_note` (nullable). Skip/unskip logged to `job_activity_log`.
- `reportReview.ts`: `findMissingRequired` loads drafts + submitted, ignores skipped/empty rows, applies an optional-field rule (types textarea/notes, labels matching comments/materials required/notes), returns `{templateId, templateName, fieldId, label}[]`. PDF builder excludes skipped rows; auto-submits started drafts before building.
- Optional rule also applied in the form's own submit validation (JobSheet) so both paths agree.
- `SubmitToOfficeBar` absorbs the completion checks from `JobCompleteAction` (engineer sig, remedials); engineer view hides `JobCompleteAction`; `EngineerNextStepBar` "complete" step points at the merged button.
- Jump-to-field: dispatch existing `job-sheet:fill-online` with `focusFieldId`; form scrolls to `[data-field-id]` and highlights it.
- Template dedupe via data update on `job_sheet_templates.fields` (by normalised label + section).
- Help guide `reports-to-check` / engineer guide updated per ship rule.
