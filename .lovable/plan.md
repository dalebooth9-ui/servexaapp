## Current mapping (audit)

Every published job sheet template already carries a `job_category` slug — that's the ONE explicit link. Here's what's currently mapped:

| Job type | Template(s) auto-attached | Status |
|---|---|---|
| dry_riser_installation | Dry Riser — Commissioning Certificate | OK |
| dry_riser_pressure_test | Dry Riser — Pressure Test (locked) | OK — but see bug 1 |
| dry_riser_visual | Dry Riser — Visual Inspection (locked) | OK |
| dry_riser_remedial | Dry Riser — Remedial / Repair Works | OK |
| dry_riser_service | — | **MISSING** (3 active jobs, no sheet) |
| site_survey | Site Survey | OK |
| sprinkler_service | Sprinkler — 6 Month Inspection, Sprinkler — Annual Service (locked) | OK — chooser prompts |
| sprinkler_remedial | — | **MISSING** |
| sprinkler_installation | — | **MISSING** |
| commercial_sprinkler_service / _installation / _remedial | — | **MISSING** (3 job types) |
| fire_hydrant_service | 5 Year Overhaul, 6 Month Visual, Annual Inspection | OK — chooser |
| wet_riser_annual_service | Wet Riser — Annual Service & Test | OK |
| wet_riser_visual | — | **MISSING** |
| extinguisher_service | Annual Service, Extended Service, Site Survey | OK — chooser |
| general | Remedial Works — Completion | OK |
| fire_alarm (other org) | Fire Alarm — Periodic Inspection & Test | OK |

Active jobs with NO sheet attached: 39 (general 19, dry_riser_installation 9, dry_riser_service 3, dry_riser_visual 3, extinguisher_service 3, dry_riser_pressure_test 1, wet_riser_annual_service 1).

## Bugs found

**Bug 1 — pressure_test / visual qty buckets are dead code.** In `buildAttachPlan` (src/lib/autoAttachJobDocuments.ts) the `pressure_test` and `visual` buckets look for templates with `category === "pressure_test"` / `"visual"`. No template in the system uses those literal values (they use `dry_riser`, `sprinkler`, etc.). Any job with `pressure_test_qty > 0` (7 jobs) or `visual_qty > 0` gets **zero** sheets because the qty branch runs and the `category_default` branch is skipped when any qty > 0.

**Bug 2 — no admin visibility.** Mapping lives implicitly on the template (`job_category` column); admins can't see a "job type → sheet" grid without SQL.

**Bug 3 — six job types have no template at all.** Engineers on those jobs get no sheet auto-attached.

**Bug 4 — duplicate categories.** `job_categories` has each slug three times (one per org). Cosmetic; matching is by slug so it still works, but the settings table also renders duplicates.

## Fix plan

### 1. Fix the bucket matcher (code)
`src/lib/autoAttachJobDocuments.ts`: when the `pressure_test` / `visual` bucket finds zero candidates by `category`, fall back to matching the job's own `jobCategory` slug via `job_category` — so a `dry_riser_pressure_test` job with `pressure_test_qty=2` still gets 2× Dry Riser — Pressure Test drafts.

### 2. Wire the missing job types (migration)
For six job types with no template, alias them to the closest existing sheet by inserting an entry in a new `job_category_template_map` table (below) instead of duplicating templates:

| Job type | Aliased to |
|---|---|
| dry_riser_service | Dry Riser — Pressure Test + Dry Riser — Visual Inspection |
| sprinkler_remedial | Sprinkler — Annual Service (as remedial worksheet) |
| sprinkler_installation | Sprinkler — Annual Service (commissioning proxy) |
| commercial_sprinkler_service | Sprinkler — Annual Service |
| commercial_sprinkler_installation | Sprinkler — Annual Service |
| commercial_sprinkler_remedial | Sprinkler — Annual Service |
| wet_riser_visual | Wet Riser — Annual Service & Test |

(If any of these look wrong the mapping is editable in the admin UI added below.)

### 3. Introduce an explicit mapping table (migration)
```text
public.job_category_template_map
  job_category_slug  text
  template_id        uuid  → job_sheet_templates
  sort_order         int   default 0
  is_default         bool  default true
  org_id             uuid  → organisations (nullable = platform-default)
  PK (job_category_slug, template_id, org_id)
```
`buildAttachPlan` reads this table first (org-scoped, then platform-default), falls back to the existing `job_category` column so nothing breaks for orgs that don't customise. This is the "explicit per-type mapping, not fuzzy" the request wants.

### 4. Admin mapping UI
Add "Job type → sheets" section to Settings (`src/components/JobTypeTemplateMappingSettings.tsx`) rendered on `SettingsPage`. For each distinct job category slug, show a multi-select of published templates (with the locked/canonical one starred). Save writes `job_category_template_map` rows.

### 5. Data repair (migration + one-off script)
For every active/upcoming job whose sheet attachment is missing OR whose attached draft template no longer matches the (new) mapping:
- Attach the mapped template as a draft `job_sheet_responses` row + `job_documents` blank_job_sheet entry, using existing `insertDraftResponses` helper reused server-side via a SQL migration that mirrors its inserts.
- **Never** touch responses with `status <> 'draft'` or drafts whose `responses` payload has any user-entered value.
- Remove stray unstarted drafts whose template is *not* in the new mapping for that job type.

### 6. De-dup categories (migration)
Collapse `job_categories` to one row per slug (keep the first, delete extras). Cosmetic only — nothing references category rows by id in the auto-attach path.

### 7. Report
Print before/after: jobs fixed, drafts added, stray drafts removed, final mapping table (job type → template names) as a database view `v_job_type_template_map` the user can eyeball in Settings.

## Out of scope (call out, don't do)
- Building brand-new template content for missing types (sprinkler_installation etc.) — the alias table points to the closest sheet; a real bespoke template is a separate build.
- Touching completed/cancelled jobs.
- Cross-org template creation.

Confirm and I'll ship steps 1–7 in order (migration first, then code + UI, then data repair).