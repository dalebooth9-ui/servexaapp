# New dry-riser visits, paperwork and due reminders

## Scope
Build on the existing sites, dry-riser assets, job creation, Industry Templates, digital job sheets, QR helpers and Settings. Do not rebuild forms or change existing completed reports, customer exports, wet-riser behaviour or unrelated workflows.

The weekly email digest is excluded following your choice: reminders will be in the app only.

## 1. New visit on a site
- Add an office/admin-only **New visit** button on each site detail page.
- Step 1 lists that site's dry risers, all selected initially, with location/name, outlets, last inspection date/result and open remedial work from existing defects.
- Step 2 selects **Visual inspection (6-monthly)** or **Annual pressure test (12 bar)** per riser. Suggest visual when the last pressure test is under six months old; suggest pressure when it is over eleven months old. Between those points use the recorded service cycle. Where history is missing, show that clearly and require an explicit choice rather than inventing a date.
- Step 3 chooses planned date, engineer and optional notes. Optional PO entry remains admin-only. No prices or costs appear anywhere in this flow.
- Create one site job with one linked existing-template draft per selected riser, retaining per-riser type choices. Create the assignment and scheduled visit together, so the job appears on the engineer's schedule on the chosen date.
- Use the published Pressure Test and Visual Inspection templates, never retired duplicates. Mixed visual/pressure risers stay within the existing multi-report job model.
- If creation fails, show the failure without leaving a partially created job or duplicate sheets.

## 2. Matching paper and digital sheets
- Use one shared prefill source for the tablet sheets and paperwork: customer, site/address, riser name/location, outlets, sticker ID, last inspection date/result, open remedial notes from the previous visit, job number, planned date and QR.
- Keep previous inspection results clearly separate from the new visit's result fields. Leave new results, ticks, readings and signatures blank; do not copy engineer profile signatures into paperwork.
- Add **Print paperwork**, **Download PDF** and **Download Word** on the job, using existing blank-template PDF/Word builders and QR helpers.
- Output one page per selected riser, in sheet-list order, with explicit page breaks: seven risers means seven separate pages. Preserve the existing form sections and use Viva blue with the organisation's Viva logo in the header.
- Keep QR codes linked to the existing primary-domain scan page. Leave completed-report PDF rendering and signature safeguards unchanged.

## 3. Due visits — reminders, not bookings
- Add an office-only **Due visits** page and dashboard card, grouped by customer/site, with due date, visit type, affected risers and last done date.
- Compute each dry riser's cycle from recorded inspection history and the existing latest-inspection fields. The next visit is six calendar months after the last qualifying inspection; pressure testing is due twelve calendar months after the last pressure test. A pressure deadline takes precedence over a later visual visit so it cannot be pushed back by a visual inspection.
- Missing or ambiguous history is shown as **History not recorded / needs review**, not assigned a fabricated due date. Remedial-only work does not reset the inspection cycle.
- Filters: overdue, next 30/60/90 days and customer. Account for manually booked future visits so the same work is not suggested for booking twice; only actual completed inspections advance the cycle.
- **Create visit** opens the same New visit flow with the relevant risers/types selected. Reminders never create or schedule jobs automatically.
- **Snooze** for 30/60/90 days; **Not required / lost** requires a reason and hides the current reminder, with a way to restore it. New completed inspections start a fresh cycle rather than inheriting a prior lost/snoozed reminder.
- Office controls on sites and risers for **No longer serviced**, with restoration; either exclusion suppresses due reminders.
- Settings offers the reminder lead time, defaulting to six weeks. Dashboard attention uses that window, while the page can still list future due dates.

## Technical approach
- Reuse `assets`, `asset_service_history`, `defects`, `jobs`, `job_assignments`, `job_visits` and `job_sheet_responses`; keep `riser_asset_id` as the existing per-sheet link.
- Extend the existing job-sheet prefill and blank PDF/Word builders through opt-in inputs so unrelated exports remain unchanged.
- Use a server-validated, transactional office-only operation for visit creation, checking the selected assets belong to the site's organisation and preventing duplicate creation on retries.
- Prefer additive reminder state on existing assets/sites, with organisation settings stored using the existing settings mechanism. Keep reminder lifecycle keyed to the inspection cycle and separate from the site-wide renewal schedules, whose template-level grouping cannot represent independent per-riser alternation safely.
- Preserve `org_id` and organisation-scoped permissions on all changed objects. Office actions are enforced on the server, not only hidden in the interface; engineer access follows assigned jobs. Do not expose new reminder/sticker context through the customer portal.
- Use `fetchAllRows` for whole-table lookups so customers/sites/assets beyond 1,000 rows remain available.
- Update architecture guidance and Help & guides for New visit, paperwork, Due visits and settings in the same delivery.

## Verification
- Tests for six-month visual and twelve-month pressure deadlines, the under-six/over-eleven-month suggestions, missing history, and month-end/leap-year dates.
- Tests for reminder lead time, 30/60/90-day snoozes, lost/restored cycles, no-longer-serviced exclusions, and no automatic job creation.
- Verify one job with the selected risers, per-riser template choices, schedule/assignment, preserved blank answers and organisation/office restrictions.
- Exercise New visit as office, then open the created sheets as the assigned engineer on a tablet; verify the prefilled data reads back correctly.
- Inspect a seven-riser PDF and Word export for seven pages, blank results/signatures, branding and QR placement; check print opens the same paperwork.
- Run focused tests and check the preview for errors. Report any checks that cannot be completed without changing live customer records or an available test account.