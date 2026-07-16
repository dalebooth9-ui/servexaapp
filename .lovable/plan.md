## Org account suspension — implementation plan

Adds a full lifecycle (`active` / `suspended` / `cancelled`) to organisations with server-side enforcement, an audit trail, a platform-owner-only management console, and hooks a future Stripe webhook can call.

### 1. Database

Migration `add_org_lifecycle`:

- `organisations`
  - `status text NOT NULL DEFAULT 'active'` — CHECK IN `('active','suspended','cancelled')`
  - `suspension_reason text`
  - `suspension_message text` (shown on the paused screen, admin-configurable)
  - `suspended_at timestamptz`, `suspended_by uuid`
  - `reactivated_at timestamptz`
  - `grace_period_ends_at timestamptz` (for future billing hooks — nullable)
- New enum value on `app_role`: `platform_admin` (distinct from tenant `admin`).
- Backfill: all existing orgs → `active`. Seed `platform_admin` role for every existing `admin` user in org `11111111-1111-1111-1111-111111111111`.
- New table `org_status_log` (`org_id`, `old_status`, `new_status`, `reason`, `changed_by`, `changed_at`, `source` — `manual|billing|system`). GRANTs + RLS: platform admins select; service_role all.
- Security-definer helpers:
  - `public.is_org_active(_org_id uuid) returns boolean` — true when status = active.
  - `public.current_user_org_status() returns text` — status of caller's org (used by client to show paused screen without a round trip per query).
  - `public.is_platform_admin(_user_id uuid) returns boolean` — `has_role_in_org(_user_id, PLATFORM_ORG, 'platform_admin')`.
  - `public.suspend_organisation(_org_id, _reason, _message, _source)` and `public.reactivate_organisation(_org_id, _source)` — SECURITY DEFINER, callable by platform admins OR service_role (so the future Stripe webhook edge function can invoke them). Both write to `org_status_log`. `suspend_organisation` refuses to touch the platform org.
  - `public.cancel_organisation(_org_id, _reason)` — same authorisation, sets status to `cancelled`.
- Trigger `organisations_prevent_platform_suspend` — raises if anyone tries to UPDATE the platform org's status away from `active`.

### 2. Server-side enforcement (RLS deny-by-status)

Rather than rewriting every existing policy, add a single RESTRICTIVE policy per user-facing table that blocks writes when the caller's org is not active:

```sql
CREATE POLICY "block_when_org_suspended"
ON public.<table>
AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.is_org_active(get_user_org_id()))
WITH CHECK (public.is_org_active(get_user_org_id()));
```

Applied to the operational tables: `jobs`, `job_assignments`, `job_documents`, `job_emails`, `job_signatures`, `job_visits`, `job_sheet_responses`, `customers`, `sites`, `assets`, `invoices`, `quote_approval_tokens`, `submissions`, `defects`, `rams_documents`, `vehicle_checks`, `time_clock`, `notifications`, `job_messages`. Reads to `organisations`, `profiles`, `user_roles`, `organisation_members`, `app_settings`, `email_branding`, `org_status_log` remain allowed so the paused screen and the platform console keep working.

Client-side: `AuthProvider` fetches `current_user_org_status()` on session hydrate and subscribes to `organisations` row changes. When status ≠ `active`, `App.tsx` short-circuits routing to `<AccountPaused />` (full screen: org name, admin-configured message, support email link). Platform admins bypass this — they still see the console.

### 3. PO intake bounce

`supabase/functions/inbound-po-email/index.ts`: after `resolve_org_by_intake_email`, check status via new `resolve_org_by_intake_email_with_status` (extend the existing function to return status too). If `suspended`/`cancelled`, respond 200 with `{ status: 'rejected', reason: 'org_suspended' }` and skip job creation. Log to `po_intake_rate_limit` for observability (or a lightweight `intake_rejections` note in `job_activity_log` scoped to the org). Return a friendly bounce body so upstream mailbox forwarders can NDR if desired.

### 4. Platform admin console

New route `/platform/organisations` (added to `App.tsx`, gated by `is_platform_admin`; hidden from tenant admin sidebars). Component `src/pages/PlatformOrganisations.tsx`:

- Table: name, status badge, plan, created, active users (`organisation_members` count), jobs count, last activity (`greatest(max(jobs.updated_at), max(job_activity_log.created_at))`).
- Row actions:
  - **Suspend** — dialog with reason (required) + optional customer-facing message → calls `suspend_organisation`.
  - **Reactivate** — confirm → `reactivate_organisation`.
  - **View history** — reads `org_status_log`.
- Platform org row: actions disabled with "Platform owner — protected".

Data fetched through a new SECURITY DEFINER function `platform_list_organisations()` that returns the aggregated stats in one call and refuses non-platform-admins.

Sidebar: add "Platform" section shown only when `is_platform_admin` — single link "Organisations". No visibility change for tenant admins.

### 5. Billing hooks (structure only)

`suspend_organisation` / `reactivate_organisation` accept `_source` (`manual|billing|system`) so a future `stripe-webhook` edge function can call:

```ts
await supabase.rpc('suspend_organisation', {
  _org_id, _reason: 'payment_failed', _message: 'Payment failed — update billing to restore access.', _source: 'billing'
})
```

No Stripe code shipped now — just the callable surface + `grace_period_ends_at` column for a later cron to enforce.

### Files

- `supabase/migrations/<ts>_org_lifecycle.sql` — schema, RLS restrictive policies, functions, backfill.
- `src/hooks/useOrgStatus.ts` — subscribes to caller's org status.
- `src/components/AccountPaused.tsx` — full-screen paused UI.
- `src/pages/PlatformOrganisations.tsx` + `src/components/platform/OrgSuspendDialog.tsx`, `OrgStatusHistory.tsx`.
- Edits: `src/App.tsx` (guard + route), `src/components/AppSidebar.tsx` (platform section), `src/contexts/AuthProvider.tsx` (hydrate status + platform-admin flag), `supabase/functions/inbound-po-email/index.ts` (suspended bounce), `supabase/functions/_shared/threadDedup.ts` if it touches status resolution.

### Assumptions to confirm

- `platform_admin` role is bootstrapped for every current admin of the platform org. If you'd rather nominate specific users, say who and I'll seed only those.
- Reads are NOT blocked during suspension (only writes) so an admin can still export/see their data before reactivation. Say the word and I'll extend the restrictive policy to `FOR SELECT` too.
- "Cancelled" is treated the same as "suspended" for enforcement — the difference is intent (won't be reactivated). No data deletion.
