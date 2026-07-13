
# Step 3 — RLS policy rewrite (org-scoped)

Goal: rewrite every tenant-data policy so cross-org access is impossible at the database layer, without changing any behaviour for Viva Fire's current users (admin, office, engineer).

Non-negotiable: Viva Fire is live right now. Every batch is verified with a two-org fixture before moving on; if any batch shows behaviour drift for Viva, I stop and report instead of continuing.

## Approach (applies to every batch)

For each table, policies are rewritten to the pattern:

```text
USING  (org_id = public.get_user_org_id()
        AND public.has_role_in_org(auth.uid(), org_id, <role>))
WITH CHECK (org_id = public.get_user_org_id()
        AND public.has_role_in_org(auth.uid(), org_id, <role>))
```

- `has_role` compatibility shim stays in place the entire step so any policy we haven't migrated yet keeps working. It becomes safe to remove only after: (a) zero policies reference bare `has_role`, and (b) app code no longer calls it. I'll flag when both are true — removal is its own later step.
- Child tables without their own `org_id` (rare after step 2) route through their parent via a `SECURITY DEFINER` helper, never a subquery that itself hits RLS.
- Policies that only check `authenticated` with no org scope get rewritten to require org membership.
- Existing role semantics preserved exactly: admins keep full org access, engineers keep the same subset (assigned jobs, own submissions, own vehicle checks, etc.), office keeps read/write where they had it.
- Every batch = one migration file, reviewable independently, followed by the fixture test.

## Fixture test (run after every batch)

Two orgs seeded (Viva + a throwaway `test_org_b`), one admin + one engineer per org. For each table in the batch:

1. Viva admin can SELECT/INSERT/UPDATE/DELETE Viva rows (all previously-working paths).
2. Viva engineer can do exactly what they could before (assigned-job scope etc.).
3. Cross-org attempts (Viva user reading/writing org B rows, and vice versa) all return zero rows / permission errors.
4. Anonymous access unchanged (portal tokens, public sign-off routes still work via `SECURITY DEFINER` RPCs).

Fixture data is cleaned up at the end of each batch. If any assertion fails, batch is rolled back and reported.

## Batches (in order)

1. **Jobs & scheduling** — `jobs`, `job_visits`, `job_assignments`, `job_activity_log`, `job_schedule`, `job_messages`, `job_templates`, `job_template_locks`, `planner_adhoc_entries`, `notifications`.
2. **Customers & sites** — `customers`, `customer_sites`, `sites`, `customer_documents`, `customer_paperwork`, `customer_merge_suggestions`, `customer_notification_log`, `customer_portal_tokens`, `customer_sign_off_tokens`.
3. **Documents & submissions** — `job_documents`, `submissions`, `submission_comments`, `job_sheet_templates`, `job_sheet_responses`, `job_photo_checklists`, `job_photo_checklist_responses`, `photo_checklist_templates`, `photo_checklist_items`, `field_reports`, `pre_completion_checklist_items`, `rams`, `rams_documents`, `generic_rams`, `site_surveys`, `site_survey_photos`, `job_site_surveys`, `job_site_survey_photos`.
4. **Assets & compliance** — `assets`, `asset_documents`, `asset_sensors`, `sensor_readings`, `compliance_records`, `defects`, `audits`, `audit_responses`, `audit_template_items`, `audit_templates`, `fire_log_entries`, `fire_log_tokens`, `ppm_schedules`, `conformity_certificates`, `digital_twin_health`, `installation_projects`, `installation_issues`, `installation_issue_history`, `installation_issue_photos`, `installation_handover_tokens`, `handover_tokens`.
5. **Finance & parts** — `invoices`, `invoice_line_items`, `quote_approval_tokens`, `parts_library`, `job_parts`, `van_stock`, `stock_transactions`.
6. **Engineer / HR / config** — `profiles`, `engineer_documents`, `engineer_leave`, `engineer_locations`, `engineer_onboarding_logs`, `engineer_page_access`, `time_clock`, `vehicle_checks`, `vehicles`, `bank_holidays`, `email_from_settings`, `email_send_log`, `email_send_state`, `email_unsubscribe_tokens`, `suppressed_emails`, `import_batches`, `client_errors`, `pending_whatsapp_scans`, `support_tickets`, `ai_wizard_conversations`, `app_settings`, `category_document_templates`, `xero_connections`.

Global reference tables (`job_categories`, `asset_categories`, `audit_categories`, `fault_codes`, etc. — the 16 left global in step 2) keep their existing read-to-all-authenticated policies.

## Special attention items (flagged, not silently changed)

- **`storage.objects` bucket policies.** I will audit each bucket's current policy but will NOT change storage paths in this step — object keys are currently un-prefixed with `org_id`, so retroactive path enforcement would break existing links. I'll list every bucket, its current policy, and whether it's already effectively org-scoped via the parent row (e.g. `job_documents` row check). Any bucket that isn't → flagged for **step 6 (storage repathing)** with a concrete recommendation. No object moves in this step.
- **`SECURITY DEFINER` functions.** I'll enumerate every existing `SECURITY DEFINER` function that touches tenant tables (`admin_*`, `get_portal_*`, `sign_handover_token`, `create_customer_sign_off_token`, `resolve_org_by_intake_email`, `notify_*`, `auto_create_fire_log_entry`, `email_queue_*`, etc.) and confirm each one either (a) already scopes by `org_id`/token, or (b) is admin-gated. Any that would let a caller read/write across orgs is flagged and fixed in the same batch as its table.
- **Policies without org scope** (e.g. `Authenticated can read app_settings` on `app_settings` — `USING (true)`): rewritten to `org_id = get_user_org_id()` where the row has an org, or explicitly documented as intentionally global (config/reference tables).
- **`ai_wizard_conversations`, `notifications`, `profiles`** — currently scoped by `user_id`. I'll add `AND org_id = get_user_org_id()` as belt-and-braces without narrowing existing access.

## What I will report after each batch

- Tables covered, policy diffs (dropped → created), migration file path.
- Fixture test output: pass/fail per assertion.
- Any flagged items for later steps (storage repathing, definer function tightening).
- Explicit "Viva unaffected" confirmation based on the Viva-role fixture assertions.

## What I will NOT do in this step

- No storage object moves or path rewrites (deferred to step 6).
- No removal of the `has_role` shim (deferred to a later step once nothing references it).
- No changes to RLS-exempt system schemas (`auth`, `storage`, `realtime`, `supabase_functions`, `vault`).
- No app/UI code changes. If a policy rewrite would require an app change to stay working, I stop and report instead of pushing through.

## Stop conditions

Any of the following → stop and report, do not continue to next batch:
- A fixture assertion for Viva's existing access fails.
- A policy rewrite requires an app-code change to preserve current behaviour.
- A `SECURITY DEFINER` function's current implementation cannot be safely tightened without a code change.

On completion of batch 6 with all fixtures green: full report, then wait for your go-ahead before step 4.
