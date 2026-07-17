
## Goal

Stop the "General → Remedial Works Completion" fallback from being attached to regulated jobs (e.g. gas suppression RITs). Detect a wider set of work types up front, warn when attached paperwork doesn't match, and let the office AI-draft a missing template into the builder as an unpublished draft.

---

## 1. Expand work-type detection

Rewrite `supabase/functions/_shared/inferJobScope.ts` to recognise, in addition to today's list:

| Work type slug | Detection keywords |
| --- | --- |
| `gas_suppression` | RIT, room integrity test, IG-55, IG-541, IG55, IG541, FM-200/FM200, Novec, Novec 1230, HFC-227, clean agent, suppression discharge / retention |
| `kitchen_suppression` | Ansul, R-102, kitchen suppression, kitchen fire suppression |
| `fire_alarm` | fire alarm, L1/L2/L3/L4/L5, BS 5839, alarm panel, detector head, call point |
| `emergency_lighting` | emergency lighting, EM lighting, BS 5266, 3-hour test, monthly EM test |
| `hose_reel` | hose reel |
| `water_mist` | water mist, watermist |
| `smoke_vent` | smoke vent, AOV, natural smoke vent, mechanical smoke vent, BS 7346 |
| `fire_door` | fire door, FD30, FD60, fire door inspection |
| `wet_riser` | (already partial) — wet riser, wet-riser |
| `extinguisher` | (already partial) — promote from ambiguous to definite |

Output shape changes to:

```ts
{
  categorySlug: string | null,
  detectedWorkTypes: Array<{ slug: string; label: string; canonicalTemplateNames: string[]; qty?: number }>,
  templateNames: string[],           // legacy: names to attempt-attach
  reasons: string[],
  isRemedial: boolean,
  remedialItems: string[],
}
```

Key rule: **if any specific work type is detected, `isRemedial` may be true only when wording is literally "remedial/snag/rectify/retest of <that work>" — never as a fallback**. Remove the current "unknown scope → default remedial attach".

Extract a rough quantity for each work type (`\b(\d+)\s*(?:x|×|off|no\.?)\s*RIT\b` etc.) so quantity mismatches can be surfaced.

## 2. Stop attaching remedial default when a specific type is detected

In `supabase/functions/inbound-po-email/index.ts`:

- After `inferJobScope`, load the org's `job_sheet_templates` (published + draft) and, for each `detectedWorkTypes[i]`, resolve any template whose `job_category`/`category` matches (or whose name matches one of `canonicalTemplateNames`).
- Only attach templates that resolve. Never attach `Remedial Works Completion` unless the detected work type IS remedial closure.
- Persist onto the job:
  - `detected_work_types text[]` — slugs
  - `template_mismatch_reason text` — human string (e.g. `"Work type: Gas suppression (RIT) — no matching job sheet template exists in your library. Build one or AI-draft."`) — set when a work type is detected but nothing resolves.
- Clear `template_mismatch_reason` when a matching template is later attached (trigger on `job_documents` insert of type `blank_job_sheet`).

## 3. UI — mismatch banner

New component `src/components/JobTemplateMismatchBanner.tsx`:

- Reads `jobs.detected_work_types`, `jobs.template_mismatch_reason`, and current attached templates.
- Two states:
  1. **Missing template** — "Work type: <label> — no matching job sheet template exists." Buttons: `Build template` (→ Industry Templates page prefilled) / `AI-draft template` (calls new edge fn — see §4).
  2. **Wrong template** — detected work type X, but attached sheets are only Y/Z. Amber warning: `"Scope mentions <X>; attached sheets: <Y, Z>."` Includes an `Approve anyway (mismatch)` control that requires a typed reason and writes to `job_activity_log`.

Mount points:
- `src/pages/JobDetail.tsx` — top of the Overview tab.
- `src/components/jobs/JobsToApproveCard.tsx` (or the current pending-review card — will locate) — inline badge with tooltip.

Approval flow (`Approve` on the pending-review card) checks `template_mismatch_reason`/quantity mismatch; if present, the button relabels to `Approve anyway…` and opens a confirm dialog capturing the reason.

## 4. AI-draft template edge function

New `supabase/functions/draft-job-sheet-template/index.ts`:

- Input: `{ work_type_slug, work_type_label, source_job_id? }`
- Uses Lovable AI (`google/gemini-2.5-pro`) with a strict JSON schema output covering the same structure the Template Builder uses (sections → items with `field_type`, `options`, `required`).
- Inserts into `public.job_sheet_templates` with:
  - `status = 'draft'` (never published)
  - `name` = e.g. `"Gas Suppression — Room Integrity Test — AI DRAFT, review before use"`
  - `category`/`job_category` set from work type
  - `created_by` = caller, `org_id` = caller's org
- Returns the new template id so the UI can deep-link straight into `EditTemplateDialog`.
- No auto-attach to the source job — office must publish first.

## 5. Migration

```sql
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS detected_work_types text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS template_mismatch_reason text,
  ADD COLUMN IF NOT EXISTS mismatch_approved_reason text,
  ADD COLUMN IF NOT EXISTS mismatch_approved_by uuid,
  ADD COLUMN IF NOT EXISTS mismatch_approved_at timestamptz;
```

No RLS changes — existing `jobs` policies cover it.

## 6. Audit of current live jobs (Viva org)

From the DB right now, non-completed jobs that mention a work type the current fallback would mis-file:

| Ref | Category | Status | Detected work type | Attached sheets |
| --- | --- | --- | --- | --- |
| VFP-00219 | general | pending_review | Gas suppression (RIT, IG-55) | Remedial Works Completion ⚠️ |
| VFP-00192 | general | pending_review | Gas suppression (RIT, IG-55) — same PO 3048 as 00219 | none |
| VFP-00198 | general | pending_review | Gas suppression (server room) | (to verify) |
| 11609 | general | active | Kitchen suppression (Ansul R-102) | (to verify) |

Reported in the reply, not auto-changed.

## 7. VFP-00192 / VFP-00219 duplicate

Both jobs are the same PFS PO 3048, one line "1 × RIT for IG-55 in Comms room".

- **Keep VFP-00192** — it's the first-created reference (lower number, canonical).
- Fold **VFP-00219** into it via the existing job-merge tool; VFP-00219 is the one that has `customer_po = 3048` set, so before merging, copy `customer_po` from 00219 → 00192, then merge & delete 00219.

Merge tool behaviour I'll confirm: the existing job-merge path already reassigns `job_documents`, `job_emails`, `job_activity_log`, `job_assignments`, `job_sheet_responses`, and `job_visits` from the loser to the winner. I'll verify that path handles the two new columns (`detected_work_types`, `template_mismatch_reason`) — plan is to prefer the winner's value, fall back to loser's when winner is null.

## Out of scope for this change

- Fixing the Ansul template gap for job 11609 — audit only; the office decides.
- Extending Word/PDF renderers for gas suppression — not needed until a template exists.
- Notifications / email alerts for mismatched jobs — the banner is sufficient for now.

## Technical notes

- New columns are additive with defaults, so no data backfill needed.
- Detection stays in a shared TS file (`_shared/inferJobScope.ts`) so both the email intake and the future manual-paste PO flow use it.
- The AI-drafter runs at admin-only via edge function JWT check; nothing user-facing exposes `LOVABLE_API_KEY`.
