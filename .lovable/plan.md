
# WhatsApp Audit — what's there, why nothing has landed, and what to do

## 1. Which functions handle WhatsApp, and which provider

- **Inbound webhook:** `supabase/functions/whatsapp-webhook/index.ts` (public, `verify_jwt = false`).
- **Outbound sender:** `supabase/functions/send-whatsapp/index.ts` (used by staff to reply from the app).
- **Provider:** **Twilio WhatsApp** (not Meta Cloud API). The webhook parses Twilio's `application/x-www-form-urlencoded` fields (`From`, `Body`, `NumMedia`, `MediaUrl0…`, `MessageSid`, `Latitude/Longitude`), validates the `x-twilio-signature` HMAC against `TWILIO_AUTH_TOKEN`, downloads media using Twilio Basic auth, and replies via Twilio's REST API. There is no Meta/Sinch/360dialog code path.

## 2. Is the webhook actually wired up?

**Secrets — all set** in the project: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, plus `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`. Code aborts with a clean 503 if any are missing (they're not).

**Public URL Twilio must call:**
`https://geyrqplwjzwdiaeqaeul.supabase.co/functions/v1/whatsapp-webhook`
(method `POST`, content-type `application/x-www-form-urlencoded`).

**Why zero rows have ever appeared in `pending_whatsapp_scans`** — most likely one or more of:
1. **The Twilio Sandbox / WhatsApp Sender's "When a message comes in" webhook is not pointed at the URL above** (or is pointed at an old URL, or set to `GET`). Without this, no request ever reaches the function. This is the single most common cause and matches "zero rows ever".
2. **Signature enforcement is strict.** The function now returns `403` on any missing/invalid `x-twilio-signature`. If Twilio is configured with a URL that doesn't exactly match `SUPABASE_URL + /functions/v1/whatsapp-webhook` (e.g. a custom domain, a trailing slash, or `http` vs `https`), every request 403s silently. Worth confirming from edge logs.
3. **Engineer's WhatsApp number isn't in `profiles.whatsapp_number` in E.164** — the profile lookup would fail and the message is dropped with a TwiML no-op (no row written). The recent normalisation fix helps new saves but legacy rows may still be wrong.
4. **`pending_whatsapp_scans` is only written on the *auto-scan* branch** (image-only, no caption, no job context). Any message with a caption or with a resolvable active job never touches that table — so "0 rows" does NOT prove "0 messages received"; it only proves "0 image-only messages from a known engineer with no active job". Submissions would land in the `submissions` table instead. **Please check `submissions` where `whatsapp_message_id is not null`** before concluding nothing has arrived.

**Recommended sanity checks (read-only):**
- Open Twilio Console → Messaging → your WhatsApp sender → confirm the inbound webhook URL, method `POST`.
- Tail `whatsapp-webhook` edge logs while sending one test message — you'll immediately see whether it's "Missing signature", "Invalid signature", "Unknown WhatsApp number", or a successful match.
- `select count(*) from submissions where whatsapp_message_id is not null;`

## 3. What the current flow does with an inbound photo

Order of resolution for `numMedia > 0`:

1. **Extract job reference** (`VFP-…`, `TM-…`, `QUO-…` etc.) from the caption → exact `ilike` on `jobs.reference_number`.
2. **Fuzzy match caption** against a pool of up to 1000 non-archived jobs (name / address / linked site name/address/postcode) using the shared normalised matcher (`matchJobsByCaption`). Confident single winner → picked. Multiple close hits → replies asking for the reference. Zero hits → skips the fallback.
3. **Strict active-job resolution** (only if the caption was empty) — explicitly-set context or today's scheduled visit for that engineer.
4. **Auto-scan branch** — only when the message is **image-only, empty caption, and no active job**. This is the *only* path that writes to `pending_whatsapp_scans`; the image is OCR'd via `ocr-job-sheet` and queued for the office to turn into a NEW job.
5. Otherwise: photo is downloaded from Twilio, uploaded to the `submissions` storage bucket at `${jobId}/${engineerId}/…`, and a row is inserted into `public.submissions` (`type='photo'|'document'`, `content = caption`, `file_name` built from the workspace filename template). Engineer gets a `✅ Photo saved to job VFP-… — <name> — <site>` confirmation.

**So today: photo + job-name caption ALREADY attaches to the existing job** — the plumbing you asked for exists. The failure mode "engineer sends a photo and nothing happens" is almost certainly delivery/config (section 2), not missing logic.

## 4. Gaps vs. the flow you described

| You want | Status |
|---|---|
| Photo + job name + notes on WhatsApp files to the matching existing job | ✅ Implemented (submissions row + storage upload, caption stored in `content`). |
| Case-insensitive, normalised fuzzy match (same helper as new search) | ✅ `matchJobsByCaption` already tokenises, lowercases, strips punctuation/spaces. |
| Ambiguous match → prompt, don't guess | ✅ Replies with candidate list; single high-confidence winner auto-picks. |
| No confident match → review queue for office | ⚠️ Partially. Today the engineer is asked to resend with a reference; nothing is queued for the office. `pending_whatsapp_scans` exists but is only used for image-only auto-scan, not for "caption didn't match". |
| Notes saved alongside the photo | ✅ Stored on `submissions.content`. Not shown as a first-class "note" on the job timeline separately, but visible with the photo. |
| Visible review UI for the office | ✅ `src/components/PendingWhatsAppScans.tsx` (shown in Admin dashboard) — currently only surfaces the auto-scan queue. |

## 5. External setup checklist (Twilio)

1. Twilio account with a WhatsApp sender approved (production number) or the WhatsApp Sandbox for testing. Each engineer's phone must have joined the sandbox / be opted in.
2. In Twilio Console → the WhatsApp sender's **"When a message comes in"** webhook set to `POST https://geyrqplwjzwdiaeqaeul.supabase.co/functions/v1/whatsapp-webhook`.
3. Twilio API key with permission to read Message Media (needed to fetch `MediaUrl0…`).
4. Every engineer's `profiles.whatsapp_number` in **E.164** (`+447…`) matching the number they send from. Legacy `07…` values won't be matched by the profile lookup alone (webhook already has a UK-to-E.164 fallback for this).
5. Optional: enable Twilio SMS/WhatsApp geo permissions + pumping protection.

## 6. Recommended plan (once you approve — no code changes in this pass)

**A. Confirm delivery first (no code).**
   1. Verify Twilio "When a message comes in" URL exactly matches the function URL above.
   2. Send one test WhatsApp with caption `VFP-00001 test` from an engineer whose profile has E.164 WhatsApp.
   3. Tail `whatsapp-webhook` logs — you'll get a definitive diagnosis from a single message. Report findings; do not change code yet.
   4. `select count(*) from submissions where whatsapp_message_id is not null` to rule out the "0 rows in scans table ≠ 0 messages" false alarm.

**B. Close the "no-match → office review queue" gap** (once A is green):
   - Extend `pending_whatsapp_scans` (or add a sibling table `whatsapp_unmatched_media`) to also accept: **caption present but no confident job match**. Store engineer_id, from, caption, message_sid, and the uploaded media path(s).
   - Replace today's "please resend with a reference" bounce-back with: upload the media into that pending bucket, insert a review row, and reply *"Received — office will file this shortly"*.
   - Extend `PendingWhatsAppScans.tsx` to render both kinds (auto-scan sheets AND unmatched-caption media), with a "File to job…" picker that moves the storage object into `${jobId}/${engineerId}/…` and inserts the `submissions` row (same shape the matched path writes today).

**C. Small robustness follow-ups** (nice-to-have, batch with B):
   - When caption matches a single site with multiple open jobs, prefer today's scheduled visit at that site before prompting.
   - Store the caption as a separate `submissions` row of `type='note'` in addition to `content` on the photo row, so the note is visible in "notes"/"history" WhatsApp commands and on the timeline as a standalone entry.
   - Log an admin notification when an unmatched item lands in the review queue.

## Technical notes for later implementation

- Storage bucket for saved media: `submissions` (private). Path pattern used today: `{jobId}/{engineerId}/{ts}_{i}_{safe_name}`. For unmatched review items, mirror `pending-scans/{engineerId}/…` and move on assignment.
- Do NOT loosen signature validation. If a legitimate URL mismatch is found, fix the Twilio-side URL rather than skipping validation.
- Keep the shared normalised matcher (`matchJobsByCaption`) as the single source of fuzzy matching so it stays consistent with the app-wide search fix.
