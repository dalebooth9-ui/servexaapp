# RAMS Upgrade Package

Three coordinated features that build on the existing wizard + AI Auto-Fill without touching those flows.

## Assumptions

- Three RAMS variants coexist in DB: `rams` (dry-riser wizard), `generic_rams` (Generic RAMS page), `rams_documents` (branded/typed variants). The features below apply to all three via a small polymorphic layer keyed on `(rams_kind, rams_id)`.
- "Library" is per-org, admin-managed. Engineers can pick from it but not edit it.
- Sign-off is a first-class record: office needs auditability, not just a flag on the PDF.
- RAMS-required rule lives on `job_categories` (per-org) — one source of truth used by planner + job page + engineer app.

## 1. RAMS Library

### Data model (one migration)

```
rams_library_items
  id, org_id, kind ('whole' | 'block'),
  block_type text NULL,                 -- e.g. 'working_at_height', 'lone_working', 'cosh'
  work_types text[] NULL,               -- tags for AI matching: ['dry_riser','pressure_test',...]
  name text, description text,
  payload jsonb,                        -- for 'whole': full snapshot of a rams row; for 'block': {hazards[], controls[], method_steps[], ppe[], notes}
  source_rams_kind text NULL, source_rams_id uuid NULL,   -- provenance if saved from a job
  created_by, created_at, updated_at,
  archived boolean default false
```

RLS: org-scoped read for authenticated members; admin-only insert/update/delete.
GRANTs per house rules.

### UI

- **Settings → RAMS Library** (new page, admin only): tabs "Whole RAMS templates" and "Content blocks". CRUD + preview + archive.
- **On any RAMS editor**: "Save to library" button (whole) and, on any hazard/method section, a small "Save block" affordance.
- **On New RAMS**: "Start from library…" picker at the top (whole templates only). Duplicates payload into the new draft.
- **In RAMS editor sections**: "Insert from library" dropdowns per section (hazards/controls/method/PPE), filtered by matching `work_types`.

### AI Auto-Fill composition

Extend `supabase/functions/ai-rams-autofill/index.ts`:
1. Fetch org's library blocks matching detected work type/ramsType.
2. Pass them into the system prompt as "prefer these vetted phrasings; only invent text for gaps".
3. Return `used_block_ids[]` alongside the generated content so UI can show "3 library blocks · 2 AI-generated" attribution chips.

### Seeding Viva

One-off backfill migration that scans existing `rams` / `generic_rams` / `rams_documents` rows in Viva's org, extracts distinct hazard/control/method entries (grouped by category label if present, otherwise clustered by text), and inserts library blocks. Whole-RAMS seeds: one saved snapshot per distinct `rams_type`/`category`.

## 2. Engineer RAMS sign-off on mobile

### Data model

```
rams_signoffs
  id, org_id, job_id,
  rams_kind text, rams_id uuid,
  engineer_id uuid, engineer_name text,
  signature_path text,                  -- storage: signatures/<org>/rams/<job>/<user>.png
  signed_at timestamptz,
  rams_version int,                     -- snapshot of rams.version at time of signing
  ip text NULL, user_agent text NULL
  UNIQUE (rams_id, rams_kind, engineer_id, rams_version)
```

RLS: engineers can insert their own row for jobs they're assigned to; read own + admins read all in org.

### Mobile flow

- Extend the mobile job view: new "RAMS" section listing every RAMS attached (across the three tables). Each row shows status (`Not signed` / `Signed <date>`) with a "Read & sign" CTA.
- New component `RamsReadAndSignSheet.tsx`:
  1. Renders the RAMS PDF inline (reuse existing `RamsPdfExport` preview).
  2. "I've read & understood" checkbox.
  3. Signature capture (reuse `SignaturePad`, honour saved signature from `engineer_signatures`).
  4. Submit → insert `rams_signoffs` + regenerate PDF.
- Prompt on job open: if RAMS attached but current engineer hasn't signed the latest version, show a blocking-ish banner with "Read & sign" before "Start job".

### PDF regeneration

Add a "Briefing Record / Signatures" appendix section to all three PDF exporters (`brandedRamsPdf.ts`, `genericRamsPdf.ts`, `ramsPdf.ts`) that reads `rams_signoffs` for the RAMS and prints a signed-by table with embedded signature images. Regeneration triggers on each new sign-off.

### Office visibility

- Job page RAMS card and planner card get a badge: `RAMS: n/m signed` (green when full, amber when partial, red when zero and required).
- New "RAMS sign-offs" tab on job detail listing signer, timestamp, version.

## 3. RAMS-required flagging

### Data model

- Add `rams_required boolean default false` to `job_categories`.
- Seed defaults ON for slugs matching install / pressure_test / remedial / commissioning categories.
- Settings → Job Categories page gets a "RAMS required" toggle per row.

### Enforcement

- Shared helper `useJobRamsStatus(jobId)` returning `{ required, ramsCount, signedCount, missing }` — queries the category + three RAMS tables + `rams_signoffs`.
- **Job page**: amber warning banner (same visual family as `JobTemplateMismatchBanner`) — "RAMS required — none attached" with "Create RAMS" CTA.
- **Planner card**: small red dot / tooltip when required & missing.
- **Scheduling / approving**: when the flag trips, the schedule/approve action opens a confirm dialog requiring explicit "Schedule anyway — RAMS missing" override; override reason logged to `job_activity_log`.
- **Engineer app**: on job open, if RAMS attached but not signed by current user, prompt to sign before "Start job" (soft-block; can dismiss with "Sign later" that re-prompts on Start).

## Technical file changes

### New files
- `supabase/migrations/…_rams_library_signoffs.sql` — 3 tables + RLS + GRANTs + `job_categories.rams_required` column + backfill of defaults.
- `supabase/migrations/…_seed_viva_rams_library.sql` — extraction/seed for org `11111111-…`.
- `supabase/functions/save-rams-to-library/index.ts` — normalises a whole RAMS into a library payload.
- `src/pages/RamsLibrary.tsx` — admin CRUD page (Settings route).
- `src/components/rams/RamsLibraryPicker.tsx` — "Start from library" / "Insert block" pickers.
- `src/components/rams/RamsReadAndSignSheet.tsx` — mobile read-and-sign UI.
- `src/components/rams/RamsSignoffBadge.tsx` — n/m badge.
- `src/components/rams/RamsSignoffsList.tsx` — signature list for PDFs & job tab.
- `src/hooks/useJobRamsStatus.ts` — shared status hook.
- `src/hooks/useRamsLibrary.ts` — org library reads + cache.

### Edited files
- `supabase/functions/ai-rams-autofill/index.ts` — accept library blocks, prefer them.
- `src/components/AiRamsAutoFill.tsx` — pass library, render attribution chips.
- `src/pages/RamsEditor.tsx`, `NewRamsPage.tsx`, `GenericRamsPage.tsx` — add library picker + "Save to library" + block insertion.
- `src/lib/ramsPdf.ts`, `brandedRamsPdf.ts`, `genericRamsPdf.ts` — append signatures section.
- `src/pages/JobDetail.tsx` — new RAMS card with required warning + sign-off badge + signoffs tab.
- `src/components/planner/*` — planner-card badge/tooltip when required & missing.
- Engineer job screen — RAMS section + Start-job gate.
- Settings pages: Job Categories (rams_required toggle) + nav entry for RAMS Library.

### Non-technical summary

- A reusable RAMS library so engineers/office start from vetted content instead of a blank page.
- Engineers read and sign RAMS on their phone before starting; office sees who signed and when.
- Jobs that legally need a RAMS get an amber warning until one is attached and signed.

## Rollout order (single response, small verifications between)

1. Migration (tables, RLS, category flag, defaults).
2. Library CRUD + hook.
3. Editor integrations (start-from + insert-block + save-to-library).
4. AI Auto-Fill composition update.
5. Sign-off table + mobile sheet + PDF appendix.
6. Required-flag enforcement (job page, planner, engineer app gate).
7. Viva backfill seed migration.
8. Verify: typecheck, targeted RLS check via psql, and a Playwright pass on the admin RAMS Library page and the engineer sign-off sheet.
