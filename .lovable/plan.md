## Part A — Audit of what's actually there today

### Xero backend (`supabase/functions/xero-*`)
- **`xero-auth`**: OAuth start (`?action=authorize`), status, disconnect. HMAC-signed state. Scopes = `openid profile email accounting.transactions accounting.contacts offline_access`. ✅ Works.
- **`xero-oauth-callback`**: Code exchange, picks first tenant, upserts `xero_connections` on `(user_id, tenant_id)`. Redirects to `/settings`. ✅ Works.
- **`xero-sync`**: `getValidToken` refreshes automatically; deletes stale row on refresh failure. Actions implemented:
  - `sync_invoice` — pushes invoice OR quote (based on `document_type`). Line items map `quantity/unit_price/description`. Contact lookup by name, creates if missing. Status map: local `draft→DRAFT`, `sent/paid/overdue→AUTHORISED`, `cancelled→VOIDED`. Updates local `xero_invoice_id` + `xero_synced_at`. ✅ Works.
  - `import_contacts` — pulls Xero customers, upserts into `customers` by `xero_contact_id`. ✅ Works.
- **`send-invoice-email`** — Resend-based, admin-only, attaches PDF. Not wired to Xero send.

### Invoicing UI
- `Invoices.tsx`, `InvoiceDetail.tsx`, `CreateInvoiceDialog.tsx` — full local CRUD, line items, PDF, mark-paid, "Sync to Xero" button. ✅ Works standalone.
- `XeroSettings.tsx` — Connect/disconnect/import contacts UI on Settings page. ✅ Works.

### Schema
- `xero_connections` — keyed by `user_id` (**global per user, not per-org** — flagged in step 4 audit, needs fixing).
- `customers.xero_contact_id` ✅ exists.
- `invoices.xero_invoice_id`, `xero_synced_at` ✅ exist.
- `xero_connections`: **0 rows**; `invoices`: **0 rows** — never used in production.

### Send-to-customer flow (`SendToCustomerMenu.tsx`)
- Already has an "Invoice" checkbox that lets you attach an **existing** invoice PDF to the report email. ✅
- **Missing**: no way to draft a new invoice from job parts inside that flow; no Xero push on send; no "invoice sent separately via Xero" mode; no contact-mapping confirm; no unconnected fallback prompt.

### Gaps to close
1. Draft-from-job step inside the send flow (prefill from `job_parts`, agreed price, manual lines).
2. On send: push to Xero as **Draft** or **Awaiting Approval** (org setting), then either attach PDF to report email OR send via Xero (org setting).
3. Contact mapping UX (first-use confirm; create-in-Xero confirm).
4. Unconnected graceful path — invoice recorded locally, PDF attached, banner to connect.
5. Per-org `xero_connections` (currently per-user global).

---

## Part B — Build plan

### B1. Migration (per-org Xero + org settings + customer mapping trust)
- `ALTER TABLE xero_connections ADD COLUMN org_id uuid REFERENCES organisations(id)`; backfill from `profiles.org_id` of `user_id`; make `org_id` NOT NULL; add unique `(org_id, tenant_id)`; keep `user_id` as "connected_by". Update RLS to org-scoped via `has_org_access(org_id)`.
- `app_settings` (JSON per org) additions: `xero_invoice_status` = `DRAFT` | `AUTHORISED` (default `DRAFT`), `xero_delivery` = `attach_pdf` | `xero_send` (default `attach_pdf`).
- `customers.xero_contact_confirmed_at timestamptz` — set when user confirms the mapping, so we don't re-ask.
- Update `xero-sync` + `xero-auth` to resolve connection by caller's `org_id` instead of `user_id`.

### B2. Extend `xero-sync` edge function
- Add `action: "draft_from_job"` — server builds invoice + line items from `job_parts` (qty × unit_price), `jobs.quoted_price` fallback, and any manual overrides passed in. Returns the new local `invoice_id` unpushed. (Or do this client-side; server keeps totals canonical.)
- Add `action: "find_or_create_contact"` — search Xero by name/email, return candidates for the UI to confirm; on confirm, either link existing `ContactID` to `customers.xero_contact_id` or create then link.
- Extend `sync_invoice` to honour the org's `xero_invoice_status` and, when `xero_delivery = xero_send`, call Xero `Invoices/{id}/Email` after push.

### B3. Send-to-customer review flow (`SendToCustomerMenu.tsx`)
Add a new "Invoice" step (only when job is completed):
- Radio: **None** / **Attach existing invoice** (current behaviour) / **Draft new invoice from job**.
- "Draft new" opens an inline editor pre-loaded with job parts → editable lines, VAT, notes, due date. Live totals.
- Contact mapping row: shows matched Xero contact (or "No match — will create 'ABCA Fire & Security'") with **Confirm** / **Choose different** / **Create new**. Persists to `customers.xero_contact_id` + `xero_contact_confirmed_at`.
- If Xero not connected: yellow banner "Xero not connected — invoice will be saved locally and PDF attached. [Connect Xero]". Flow continues.
- Send button becomes "Send report + invoice": one atomic action — save invoice locally, push to Xero (if connected), then send the customer email (attach PDF or note "sent separately via Xero" per org setting).

### B4. Settings → Integrations (`XeroSettings.tsx`)
- Add two selects backed by org `app_settings`: **Push invoices as** (Draft / Awaiting Approval) and **Invoice delivery** (Attach PDF to our email / Send via Xero).
- Make the Connect button visible from the send flow's banner too (route to `/settings?tab=integrations`).

### B5. Error handling
- Surface Xero API error body verbatim in a toast + append to invoice notes (audit trail).
- If Xero push fails, invoice stays local with a "Retry Xero push" action on `InvoiceDetail`; email still sends.

---

## What you need to do on the Xero side

1. **Create a Xero app** at https://developer.xero.com/app/manage → *New app* → **Web app**.
2. **Company / app name**: Servexa (or your trading name).
3. **Company URL**: `https://servexaapp.com`.
4. **OAuth 2.0 redirect URI** (must be exact):
   ```
   https://geyrqplwjzwdiaeqaeul.supabase.co/functions/v1/xero-oauth-callback
   ```
5. **Copy** the **Client ID** and generate a **Client secret**.
6. **Add to Lovable Cloud secrets** (Project Settings → Secrets):
   - `XERO_CLIENT_ID`
   - `XERO_CLIENT_SECRET`
   - `APP_URL` = `https://servexaapp.com` (already used by the callback for post-auth redirect)
7. **Scopes** requested by the app (nothing to configure Xero-side — Xero shows them on consent):
   - `openid profile email`
   - `accounting.transactions` (create/update invoices + quotes)
   - `accounting.contacts` (create/lookup contacts)
   - `offline_access` (refresh tokens)
8. **Certification**: not required for private/single-tenant use. If you later want more than 25 orgs on the same app, Xero requires app certification — not needed now.
9. **Connect**: Settings → Integrations → **Connect Xero** → sign in → pick the Servexa organisation → done. The tenant is stored and refreshed automatically.

Once those three secrets are in place I can ship B1–B5 in one batch. Confirm to proceed.