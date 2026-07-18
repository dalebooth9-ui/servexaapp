# Commercialisation Pack — Build Plan

Scope is large so I'm laying it out end-to-end before touching code. Sequenced so each block is independently verifiable and the security probe can run against real infrastructure at the end.

## 1. Routing changes

- `/` → public `LandingPage` for signed-out visitors; signed-in users get redirected to `/dashboard` (or their role's home).
- `/login` → the existing `Auth` page (keep `/auth` as an alias so any old links still work).
- `/signup` → new invite-gated signup flow (replaces the "create workspace" branch of `Auth.tsx`).
- `/pricing`, `/dpa`, `/aup`, `/sla`, `/cookies`, `/fire-liability`, `/privacy`, `/terms` remain public; cookie banner stays global.
- Wrap the app shell so authenticated navigation is unchanged — only the `/` route flips.

## 2. Stripe billing (sandbox → live-ready)

Provider: bring-your-own-key Stripe (owner will paste sandbox keys now, live later). No custom card UI — hosted **Checkout** for subscribe, hosted **Billing Portal** for manage.

### Secrets (owner adds in Project Settings → Secrets before webhook works)
- `STRIPE_SECRET_KEY` (sk_test_… now, sk_live_… later)
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_DEFAULT` (single monthly price; default plan)
- `APP_PUBLIC_URL` (used for Checkout success/cancel URLs)

### Schema (`organisation_billing` extended)
Columns added:
- `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`
- `plan_code` (default `'pro_monthly'`)
- `subscription_status` (`trialing|active|past_due|canceled|unpaid|incomplete`)
- `current_period_end`, `grace_period_ends_at`
- `last_webhook_event_id` (idempotency)

RLS: org admins can `select` their own row; only service role writes. Platform admins can select all.

### Edge functions
- `stripe-create-checkout-session` — org admin → returns hosted Checkout URL for `STRIPE_PRICE_ID_DEFAULT` (mode=subscription, customer created/reused by email, metadata `org_id`).
- `stripe-billing-portal` — org admin → returns hosted Billing Portal URL for the org's `stripe_customer_id`.
- `stripe-webhook` — public, verifies signature, idempotent on `event.id`. Handles:
  - `checkout.session.completed` → link customer+subscription to org, set status `active`, clear grace, call existing `reactivate_organisation`.
  - `invoice.payment_failed` → set status `past_due`, start 14-day grace (`grace_period_ends_at = now()+14d`) if not already set. Do NOT suspend yet.
  - `customer.subscription.deleted` → status `canceled`, call `suspend_organisation` with reason `subscription_cancelled`.
- Cron `enforce-billing-grace` (daily) — orgs where `subscription_status='past_due' AND grace_period_ends_at < now() AND status='active'` → `suspend_organisation` reason `payment_failed_grace_expired`.

### UI
- Org Settings → new "Billing" card showing plan, status, next renewal, "Manage billing" (Stripe portal) and, if no sub, "Subscribe" (Checkout).
- `PlatformOrganisations` list: add columns Plan / Billing status / Renewal.
- Existing `AccountPaused` page: if suspension reason is billing, show `Restart subscription` button routing to Checkout.
- `PastDueBanner` (in-app, dismissible per session) when `subscription_status='past_due'`, counting down `grace_period_ends_at`.

## 3. Invite-gated signup + org provisioning

### Schema
- `platform_invite_codes(code, note, created_by, expires_at, max_uses, uses, is_active)` — platform-admin managed.
- `signup_intents(email, code, requested_at, completed_at, org_id)` — audit trail.

### Platform admin UI
- New section in `PlatformOrganisations` for "Signup codes": create/copy/revoke, note (e.g. "Firetech"), optional expiry & max uses. Live usage counter.

### `/signup` flow
1. Enter company name, admin name/email/password, invite code, checkbox "Start with example fire protection templates".
2. Client validates code via new RPC `preview_signup_code(_code)` (SECURITY DEFINER, returns bool + note).
3. `supabase.auth.signUp({ options: { data: { signup_code, org_name, full_name, seed_templates } } })`.
4. New edge function `provision-new-org` invoked from post-confirm client bootstrap OR from an `on_auth_user_created` trigger. Trigger route is more reliable — do that. The DB trigger enqueues by calling function via `pg_net` OR the function is invoked once by the client on first sign-in. **Chosen: trigger + function via pg_net** to guarantee provisioning even if the tab closes.

### `provision-new-org` (service-role edge function) does, atomically:
1. Look up code, increment `uses`, deactivate if `uses >= max_uses`.
2. Insert `organisations` row: `status='active'`, generate unique `slug`, `scan_intake_email = <slug>-scan@intake.servexaapp.com`, `po_intake_email = <slug>-po@intake.servexaapp.com`. Add `org_intake_secrets` row.
3. Add `organisation_members`, `profiles.org_id`, `user_roles` (admin), primary owner.
4. If `seed_templates=true`, clone the canonical Viva templates **structure only** (`job_sheet_templates` where `org_id = viva_org AND is_seed_template = true`), stripping `org_id`, branding fields, signatures. New copies get the new `org_id`, `is_template_seed_copy=true`.
5. Record `signup_intents.completed_at`, `org_id`.
6. No sample jobs, no sample customers, no branding assets — clean slate.

### Isolation self-check (compile-time)
After provisioning, function runs an internal `probe_org_isolation(new_org_id)` RPC that: counts rows in `jobs, customers, sites, job_documents, job_sheet_responses` visible to a synthetic member of the new org — expects 0 rows from other orgs. Result logged.

## 4. Storage prefixing on fresh orgs

Already enforced by `buildOrgPath` + storage RLS using `storage_object_org_id`. Verify on the new org: every write goes to `<new_org_id>/…`. Add a test upload during provisioning to prove the prefix and RLS gate work.

## 5. Security probe — three personas

Run via shell Playwright + service-role SQL probes.

### Persona (a) — Test Fire Co regression
Log in as their admin, walk core pages, assert row counts match `has_role_in_org` scope. Cross-query for any Viva IDs leaking.

### Persona (b) — Customer portal scoping
Log in as a Test Fire Co portal customer, assert:
- Only their sites/reports/quotes/invoices visible.
- Storage signed URLs 404 for other-customer paths.
- Reminder edge functions refuse cross-customer `customer_id`.

### Persona (c) — Fresh throwaway org via invite
1. Platform admin creates invite code `PROBE-<ts>`.
2. Playwright signs up `probe-<ts>@servexaapp.test` at `/signup`.
3. Confirm auth (use service role to auto-confirm for test).
4. Isolation probes both ways vs Viva and vs Test Fire Co (SELECT counts through their respective sessions).
5. Sandbox Stripe Checkout: use Stripe test card `4242 4242 4242 4242` → assert `subscription_status='active'`.
6. Force `invoice.payment_failed` via Stripe CLI event replay against the deployed webhook → assert `past_due` + grace set.
7. Force `customer.subscription.deleted` → assert org suspended, `AccountPaused` page rendered.
8. Cleanup: delete auth user, org row, `organisation_members`, `profiles`, `user_roles`, storage prefix (`.list()` + bulk remove), intake secrets, invite code, `signup_intents` row, Stripe customer (test mode delete).

Report matrix: probe × persona × pass/fail with row-count evidence.

## 6. Reporting / non-goals

- Do NOT publish. Owner publishes on green.
- Owner-supplied real price + real Stripe keys are prerequisites for going live; sandbox works with placeholder price today.
- If any secret is missing at build time, functions return 503 via `requireEnv` — no silent failures.

## Technical notes

- Stripe library: `import Stripe from "npm:stripe@17"` inside edge functions.
- Webhook uses `stripe.webhooks.constructEventAsync` (Deno-compatible).
- All new tables get `GRANT` blocks per house rules; RLS on; no bare `has_role()`.
- Migrations are additive; no destructive changes to existing tables.
- Trigger for post-confirm provisioning uses `pg_net.http_post` to the edge function with an internal shared secret (`INTERNAL_PROVISION_SECRET`, auto-generated).
- Feature flag `commercialisation_enabled` in `app_settings` gates the new `/` and `/signup` behaviour so the owner can dark-launch.

Awaiting approval to start executing.
