# Submit to office, Message office, and Reports to check

## What engineers see (job page, bottom of report area)
Two buttons only, no new screens:
- **Submit to office**: checks required fields on the submitted report(s). If any are missing, it lists them. Otherwise it locks the report, makes the PDF, sets the job to "Submitted for review" and emails the office. Then it shows a clear "Sent to office ✓" card. If the phone is offline, the card says "Queued – will send when back online", and the submission goes out on its own once signal returns.
- **Message office**: a small pop-up with a text box and optional photos. The message is added to the job's email chain/timeline and emailed to the office.

Once a report is submitted, it opens read-only for the engineer until the office returns it.

## What office users see
- **Settings → Organisation**: a new "Office email" field. Engineer submissions and messages go to this address.
- A **"Reports to check"** item in the navigation and a card on the dashboard showing how many reports are waiting.
- **Reports to check page**: a list of submitted reports, oldest first (PO/job ref, site, engineer, time submitted). Tapping one opens the PDF in the browser with three buttons:
  - **Send to customer**: emails the PDF to the site/customer contact, using the PO-first reference rule, and marks the job as sent.
  - **Edit**: unlocks the report for office edits.
  - **Return to engineer**: asks for a reason, unlocks the report for the engineer, and sends them an in-app notification plus an email.
- Every action (submitted, message, sent to customer, edited, returned) is logged on the job timeline.

## Email subject
`[PO or job ref] – [Site] – Report submitted by [Engineer]`. The email body links to the job and has the PDF attached.

## Technical details
- **Database changes** (additive only):
  - Add `organisations.office_email` (nullable).
  - Add `'submitted_for_review'` to the allowed job statuses, if a constraint or trigger restricts them.
  - Add to `job_sheet_responses`: `locked_at`, `locked_by`, `returned_reason`, `returned_at`.
  - Add a new table, `report_review_events`, keyed by `org_id` and `job_id`. It has GRANTs and RLS using `get_user_org_id()` / `is_org_admin`. Engineers can insert rows for jobs assigned to them; admins can read and write all rows for their org.
  - Add a lock rule: a trigger blocks engineer updates to a locked response, while admins can still edit.
- **New edge function `report-review`**: actions `submit`, `message`, `send_customer`, `return`.
  - It checks the caller's login token and their org/assignment.
  - It loads the PDF from storage (the client generates it with the existing electronic report PDF builder and uploads it under the org-prefixed path) and sends it through the existing `sendViaResend` helper in `_shared/customerEmail.ts`, which already handles branded customer emails with attachments.
  - It writes to `job_emails`, `job_activity_log` and `notifications`.
- **Offline**: the submit request (PDF blob and payload) is kept in IndexedDB and sent by the existing reconnect drainer. The status change runs inside the function, so nothing is applied twice.
- **Files**:
  - New: `SubmitToOfficeBar` and `MessageOfficeDialog` (used in EngineerJobView), `pages/ReportsToCheck.tsx`, and a dashboard card.
  - Edited: nav config, the org settings form, and the read-only check in JobSheetTemplates.
- Help Centre articles, plus the route rule in `helpArticles.ts`, are updated in the same change.

## Open point
The emails are sent from the existing customer-email sender, which is already set up for this org. If no office email is set, submitting still locks the report and puts it in the "Reports to check" list, and the engineer is told the office wasn't emailed.
