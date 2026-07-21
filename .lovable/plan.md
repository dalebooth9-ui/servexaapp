
# Microsoft 365 outbound for report emails

Send report emails from the org's real Outlook mailbox (default `service@vivafire.co.uk`) via Microsoft Graph, so mail lands in the mailbox's **Sent Items** and replies come back to that mailbox. Applies to both the new archive **Send to customer** flow and the existing job **Send to Customer** flow. `mailto:` is not used — attachments require Graph.

## 1. Connector choice

Use Lovable's **Microsoft Outlook standard connector** (App connector, gateway-backed). The connector OAuths one workspace-level Microsoft account — exactly the model the owner asked for (one shared `service@` mailbox per org, not per-app-user). Multi-tenant support for subscriber companies later = each subscriber links their own Microsoft connection; the org setting below records which mailbox to send from.

Scopes required on the Microsoft app registration:
- `Mail.Send` (send from the mailbox)
- `Mail.ReadWrite` (create + open draft — needed for the fallback path)
- `offline_access` (token refresh through the gateway)

If the connector isn't linked yet, or these scopes are missing, the UI surfaces a **Connect Microsoft 365** step (details in §5). Admin-consent errors from the tenant are surfaced verbatim rather than swallowed.

## 2. Org-level setting

Add columns to `organisations`:

- `ms_send_mailbox text` — the UPN/email to send **from** (default `service@vivafire.co.uk` for the Viva Fire org, `null` elsewhere).
- `ms_send_mode text` — `'send'` (default), `'draft'`, or `'off'`.

Admin-only edit UI in **Settings → Email** (new section "Send via Microsoft 365"): mailbox input, mode radio, connection status pill, **Connect Microsoft 365** button when unlinked, **Send test email** button, "last sent via Graph at …" indicator.

## 3. Edge Function: `send-via-graph`

New function that both send dialogs invoke. Inputs: `{ toEmail, toName?, subject, htmlBody, pdfPath, extraAttachments?, orgId, logContext }`. Steps:

1. Auth check: caller must be admin of `orgId`.
2. Load org → get `ms_send_mailbox`, `ms_send_mode`. Bail with a typed error if unset.
3. Download PDF from `submissions` bucket with service role, base64-encode. Same for optional extras (e.g. original scan).
4. Build Graph message JSON: `subject`, `body.contentType='HTML'`, `toRecipients`, `attachments: [{ '@odata.type':'#microsoft.graph.fileAttachment', name, contentType:'application/pdf', contentBytes }]`.
5. Route by mode:
   - **send**: `POST /users/{mailbox}/sendMail` with `{ message, saveToSentItems: true }`. Guarantees Sent Items entry.
   - **draft**: `POST /users/{mailbox}/messages` to create the draft, capture `webLink`, return it to the client so the dialog can open Outlook Web for review.
6. Relay Graph errors verbatim (status + provider body) so consent / permission failures are visible.
7. Insert into `customer_notification_log` and, for archive sends, append to `archived_documents.header_data._email_sends` — same shape as today, plus `channel: 'graph_send' | 'graph_draft' | 'app_mailer'`.

All Graph calls go through the connector gateway with `Authorization: Bearer $LOVABLE_API_KEY` + `X-Connection-Api-Key: $MICROSOFT_OUTLOOK_API_KEY`.

## 4. Send dialogs

Both `SendArchiveDialog` and the existing job `SendToCustomerMenu` gain a **Delivery route** picker with three options, driven by org config + live connection status:

1. **Microsoft 365 — send from `<mailbox>`** *(default when connected + mode `send`)*
2. **Microsoft 365 — create draft in Outlook** *(when mode `draft`, or when the user picks it)*
3. **App mailer (fallback)** — labeled "sends from Servexa on your behalf; won't appear in your Sent Items"

Behavior:
- Route 1: call `send-via-graph`, show success + "Opened in Sent Items" hint. Errors show the Graph message + a **Retry** and a **Switch to app mailer** button.
- Route 2: call `send-via-graph` (draft mode), then `window.open(webLink, '_blank')`. Toast says "Draft opened in Outlook — press Send there".
- Route 3: existing `send-customer-email` path, unchanged.

Every route writes the same log entry with its `channel`.

## 5. Connect Microsoft 365 flow

When `microsoft_outlook` isn't linked, or scope check fails, the dialog swaps the route picker for a plain-English panel:

> **Connect Microsoft 365 to send from `service@vivafire.co.uk`.** Your IT admin may need to approve the connection for your tenant. If you see a "needs admin approval" screen, forward it to your IT admin.

A **Connect Microsoft 365** button opens the workspace connector settings deep-link. After the popup closes, the dialog rechecks status. Admin-consent errors returned from Graph (`AADSTS65001`, `AADSTS900971`, etc.) are shown verbatim with a one-line explanation.

Route picker also exposes a **Send test to yourself** shortcut that invokes `send-via-graph` with a minimal payload — quickest way to prove the mailbox connection works.

## 6. Files

New:
- `supabase/functions/send-via-graph/index.ts`
- `src/components/settings/MicrosoftSendSettings.tsx` (org admin panel)
- `src/lib/graphMailSend.ts` (thin client wrapper: `sendViaGraph`, `getGraphSendStatus`)
- Migration adding `organisations.ms_send_mailbox`, `ms_send_mode`; seed Viva Fire's row with `service@vivafire.co.uk` + `send`.

Modified:
- `src/components/paper-scan/SendArchiveDialog.tsx` — route picker, Graph path, connect panel.
- `src/components/SendToCustomerMenu.tsx` — same route picker + Graph path for job sends.
- `src/pages/SettingsPage.tsx` — mount `MicrosoftSendSettings`.
- Log write sites — add `channel` field.

## 7. Out of scope

- Per-app-user Microsoft OAuth (each end user with their own Outlook) — not what the owner asked for.
- Inbound reply threading into the app — replies just land in the mailbox as normal for now.
- Marketing/bulk sends — remains unsupported.
- Removing the app-mailer route — kept as labelled fallback per requirement 6.

## 8. Technical notes

- Graph attachment size cap for the simple `sendMail` path is ~3 MB; PDFs above that need the large-attachment upload session. Report PDFs are well under this, but the function will detect oversized payloads and return a plain-English error asking the user to fall back to the draft route (which supports the upload session in a follow-up if it ever bites).
- `saveToSentItems: true` is set explicitly on `sendMail`.
- Gateway URL: `https://connector-gateway.lovable.dev/microsoft_outlook`; paths are relative to `https://graph.microsoft.com/v1.0/`. `/users/{mailbox}/…` is used (not `/me/…`) so a service account or admin can send on behalf of a shared mailbox.
- The Microsoft standard connector is gateway-backed and refreshes tokens automatically — no token handling in this app.
