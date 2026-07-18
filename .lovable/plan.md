## Customer Portal — external customer contacts as a new user class

Because this introduces the first non-staff user class, everything is designed around the assumption that a customer_user is hostile-by-default: they get an authenticated login but must see **nothing** outside their own customer_id within one org.

---

### 1. Data model (one migration)

**`customer_portal_users`** — the join between an auth user and a single customer within one org.
Fields: `user_id`, `org_id`, `customer_id`, `email`, `invited_by`, `invited_at`, `accepted_at`, `is_active`, `role` (default `'customer_user'` for now — leaves room for `'customer_admin'` later).
Unique on `(user_id)` — a portal user belongs to exactly one customer. (Multi-customer portal users are out of scope for v1; if a person represents two customers they get two invites/two logins.)

**`app_role` enum** — add `'customer_user'`.

**`organisations`** — add `portal_enabled boolean default false`. Off by default per spec.

**`customer_portal_invites`** — token, org_id, customer_id, email, expires_at, used_at, invited_by. 7-day expiry.

**`portal_visit_requests`** — customer_id, site_id, requested_by, preferred_date, notes, status (`new`/`triaged`/`scheduled`/`dismissed`). Feeds the office as flagged enquiries.

**`shareable_with_customer boolean`** — add to `job_documents`, `customer_paperwork`, `rams_documents`, `historic_reports`. Default:
- `customer_paperwork` (reports/certificates generated for customer): **true**
- Everything else: **false**
Backfill existing customer-facing docs to `true` where `is_customer_facing` / equivalent flag exists; leave rest false.

**Helpers (SECURITY DEFINER, `SET search_path = public`):**
- `is_customer_user(_uid uuid) returns boolean`
- `customer_user_customer_id(_uid uuid) returns uuid` — the caller's bound customer, or null
- `customer_user_org_id(_uid uuid) returns uuid`
- `customer_user_can_see_site(_uid uuid, _site_id uuid) returns boolean` — site.customer_id matches
- `customer_user_can_see_job(_uid uuid, _job_id uuid) returns boolean` — job.customer_id matches AND job.status in ('completed','invoiced')

### 2. RLS — additive, never widening

For each of the tables below, add a **new** policy `"Customer users read own"` that adds `SELECT` on rows scoped to their customer_id within their org. Existing staff policies stay untouched (staff experience unchanged).

- `sites` — where `customer_id = customer_user_customer_id(auth.uid())` AND org matches
- `jobs` — same, AND `status in ('completed','invoiced')` (never drafts/pending/in-progress)
- `job_documents` — via job scope AND `shareable_with_customer = true`
- `customer_paperwork` — via customer_id AND `shareable_with_customer = true`
- `defects` — via job scope; expose only `title, severity, status, created_at, location_on_site` through a **view** `customer_defect_summary` (see below). Base table SELECT for customer_user = false.
- `invoices` — where `document_type='quote'` AND `customer_id` matches AND status in ('sent','accepted','declined')
- `invoice_line_items` — via parent quote
- `site_service_schedules` / `renewal_reminder_log` — via site scope, next-due only
- `historic_reports` — customer_id matches AND `shareable_with_customer = true`
- `customers` — the caller's OWN customer row only

For **every other** table (engineer_*, van_stock, parts_library, profiles, user_roles, org_status_log, po_intake_*, support_*, price_book_items, notifications, job_messages, submissions, etc.) — add a restrictive check to existing admin/engineer policies OR rely on the fact no customer_user policy is granted (default deny). We do a spot-audit to confirm no accidental `USING (true)` policies swallow customer_users.

**Views for field-hiding:**
- `customer_defect_summary` — hides internal_notes/recommendation/priority-cost fields
- `customer_job_summary` — hides internal notes, engineer names, costs

Both `WITH (security_invoker=on)` so the caller's RLS still applies.

### 3. Storage

All customer downloads use `createSignedUrl` with 5-min TTL from an Edge Function that first checks `customer_user_can_see_job` / paperwork ownership before minting the URL. No direct bucket policies added for `customer_user`.

Buckets touched: `customer-paperwork`, `job-documents` (only shareable rows), `historic-reports`.

### 4. Invite flow

**Admin side:** on Customers → contact card, new "Invite to portal" button (visible only if `organisations.portal_enabled`). Calls `invite-customer-portal-user` Edge Function:
1. Creates auth user via service role (or reuses if exists in same org)
2. Assigns `customer_user` role
3. Inserts `customer_portal_users` row
4. Sends invite email via existing `send-transactional-email` (`customer-portal-invite` template) with a one-time link

**Customer side:** invite link → `/portal/accept?token=...` → sets password → lands on `/portal`.

### 5. Portal UI (`/portal/*`)

Separate layout `PortalLayout.tsx` — no admin sidebar; only: My Sites, Documents, Quotes, Request Visit, org logo/branding pulled from `email_branding`.

Pages:
- `/portal` — dashboard: next 5 due, open quotes count, recent completed reports
- `/portal/sites` — list, click into per-site: service history (completed jobs table with "Download report" per row), next-due list, open defects (summary view)
- `/portal/documents` — flat list of shareable docs across their sites, filter by site/date
- `/portal/quotes` — list; click → view line items + Accept button (calls `accept-portal-quote` edge fn: sets `invoices.status='accepted'`, logs activity, notifies office)
- `/portal/request-visit` — form: site, preferred date, notes → `portal_visit_requests` insert

**Route guard:** `PortalRoute.tsx` — requires session + `is_customer_user(auth.uid()) = true`. Conversely, `AdminRoute`/`EngineerRoute` reject customer_users. Root `App.tsx` redirects customer_users away from `/` to `/portal`.

### 6. Org toggle

Settings → Organisation → "Customer Portal" card: switch bound to `organisations.portal_enabled`. When OFF: invite button hidden, existing portal users get a "Portal disabled by your provider" page, no login redirect to `/portal`.

Platform admin can force-disable (already covered by existing `PlatformOrganisations`).

### 7. Security probe suite (extend existing two-company probe)

Add persona C: `customer.a@probe.test`, portal user for Customer A in Viva org.
Matrix asserted:
| Check | Expected |
|---|---|
| Sees Customer A sites in Viva | ✅ |
| Sees Customer B sites in Viva | ❌ 0 rows |
| Sees Test Fire Co sites (other org) | ❌ 0 rows |
| Sees Customer A completed job reports | ✅ shareable ones only |
| Sees Customer A draft/in-progress jobs | ❌ |
| Sees Customer A internal reference docs | ❌ |
| Sees engineer_locations / van_stock / parts_library | ❌ |
| Sees defects.internal_notes | ❌ (view strips) |
| Can accept own quote | ✅ |
| Can accept Customer B quote | ❌ |
| Can `POST` to admin edge functions (create-user, update-user-details, etc.) | ❌ 403 |
| Can navigate to `/jobs`, `/planner`, `/settings` | ❌ redirected |
| Viva staff experience: any change to job counts, reports visible, planner rows | ❌ unchanged |

Probe runs against a seeded fixture and prints the matrix.

### 8. What's out of scope for v1

- Multi-customer portal users (one login → multiple customers)
- Portal-side messaging / comments
- Payment of quotes (Accept only)
- Custom portal domain (uses `/portal` under the main app)
- Push notifications to customers (email only)

---

### Implementation order (turns)

1. **Migration** — enum + all tables/columns/helpers/views/policies + `shareable_with_customer` backfill
2. **Edge functions** — `invite-customer-portal-user`, `accept-portal-quote`, `portal-download-document` (signed URL minter), `portal-request-visit` (or plain insert with RLS)
3. **Email template** — `customer-portal-invite` + deploy
4. **Portal UI** — layout, pages, route guards, App.tsx redirect
5. **Admin UI** — Invite button on customer contact, org toggle in Settings
6. **Probe suite extension** — persona C + matrix runner

Confirm this shape and I'll start with the migration.
