# Engineer completion with unused reports

## What will change
- Use report answers, rather than timestamps, to distinguish untouched reports from started reports.
- Let untouched reports pass completion silently and mark them `Not used` without deleting them.
- Let unfinished started reports pass after one short confirmation: “This report isn't finished. Complete the job anyway?” with **Yes** and **Go back**.
- Keep unfinished reports as drafts. Only finished reports will be included in the office review PDF, customer email, and customer-facing document choices.
- Show the completed-report ratio on each item in **Reports to check**, including jobs with unused or unfinished reports.
- Preserve the existing engineer signature and remedial checks.

## Completion flow
1. Engineer taps **Complete & submit to office**.
2. Untouched reports are marked `Not used` automatically.
3. If any report was started but not finished, show one confirmation for the job.
4. Submit finished reports only and put the job in **Reports to check**.
5. Record the report count for the office; do not delete or lock unused/unfinished reports.

## Verification
- Test at tablet size as an engineer: 1 finished + 2 untouched completes without a report prompt.
- Test at tablet size as an engineer: 1 finished + 1 partly filled shows exactly one confirmation and completes after **Yes**.
- Confirm generated/customer email choices contain only finished reports.
- Confirm both jobs appear in **Reports to check** with the correct completed count.
- Update the existing Help guide for this completion behaviour.
