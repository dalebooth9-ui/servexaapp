## Per-organisation email PO intake

**Provider:** Resend Inbound (project already uses Resend). Webhook verified via Svix signatures.

### Backend changes

1. **Migration**
   - `organisations.intake_email TEXT UNIQUE` — format `po-{slug}-{4rand}@intake.servexaapp.com`, backfilled for existing orgs, auto-set for new via trigger.
   - `po_intake_rate_limit(intake_email, window_start, count)` — rolling 1-hour window, 30 messages/hour cap.
   - RPC `resolve_org_by_intake_email(_email)` returning `{org_id, allowed}` after incrementing the counter (SECURITY DEFINER, service role only).

2. **Edge function `inbound-po-email`** (`verify_jwt = false`)
   - Verify Svix signature using `RESEND_INBOUND_WEBHOOK_SECRET` (fail closed).
   - Enforce 25 MB total payload cap.
   - Look up org via `resolve_org_by_intake_email`; drop silently (200 OK) if unknown or over-limit.
   - AI extract with `google/gemini-3-flash-preview` via Lovable AI gateway → `{customer_name, site_address, po_number, job_description, due_date}`.
   - Fuzzy-match customer within org (`find_similar_customer`), otherwise leave `customer_id` null with `customer` text stored.
   - Insert job: `status='pending_review'`, `source='email_po'`, `org_id`, extracted fields, subject as job name.
   - Save raw email as `job_documents` `.eml` + each attachment (PDFs especially) to storage bucket `po-intake` under `{org_id}/{job_id}/…`.
   - Reuse existing `notify_new_email_triage_job` trigger by matching source (already fires on 'Email Triage' — add 'email_po' too, or fire notification inline).

3. **Storage** — new private bucket `po-intake` with org-scoped RLS via `jobs.org_id`.

### Frontend

- In `SettingsPage` (Communications tab) add "Email your POs here" card with the org's intake email, copy button, and DNS/setup hint linking to docs.
- Keep existing `po-intake` webhook untouched.

### DNS + Resend steps returned after build

- MX record for `intake.servexaapp.com` → `feedback-smtp.<region>.amazonses.com` (or the exact host Resend shows for their inbound tenant) priority 10.
- TXT SPF for the subdomain: `v=spf1 include:amazonses.com ~all`.
- In Resend dashboard: add inbound domain `intake.servexaapp.com`, verify DNS, add inbound route `*@intake.servexaapp.com` → webhook `https://geyrqplwjzwdiaeqaeul.supabase.co/functions/v1/inbound-po-email`, copy signing secret into `RESEND_INBOUND_WEBHOOK_SECRET`.

### Non-goals

- No changes to existing `po-intake` HTTP endpoint.
- No changes to the Jobs-to-Approve UI (already shows `pending_review` items regardless of source).
