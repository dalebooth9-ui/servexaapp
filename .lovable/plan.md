
## Root Cause

The edge function logs show the job name arriving as **"General — CCG"** and **"General — Pro Defend"**. This means The Mellor is sending `job_type: "General"` with no description in the fields the function currently reads (`description`, `notes`, `scope_of_work`, `scope`).

The actual job content — "Dry Riser Installation" — is almost certainly in a field the function is ignoring, such as `title`, `name`, `line_items`, `items`, or `scope_of_works`.

The AI then sees the text `"general"` and correctly picks `site_survey` as the closest match (wrong, but logical given the input).

**Secondary issue**: Even when the category IS correct, there are slug mismatches in `JOB_TO_TEMPLATE_SLUG` — e.g. `fire_hydrant_service` maps to `hydrant_service` but the DB also has `fire_hydrant` slug with templates. The `pressure_test` mapping for dry_riser_pressure_test only has RAMS (no job sheet).

## The Fix

### 1. Widen field extraction from the webhook payload
Capture every possible field name The Mellor might use for the job description/title, including fields like `title`, `name`, `line_items`, `items`, `works`, `scope_of_works`, `job_description`. Log the full raw payload on first receipt so we can see exactly what's coming in.

### 2. Add broad "dry riser" + "installation" fallback keywords
Currently `dry_riser_installation` keywords only match compound phrases like `"dry riser install"`. If `job_type` is `"General"` and the title/description says `"Supply and install dry riser system"`, the word order won't match. Add broader single-word triggers: `"install"` when `"dry riser"` or `"dry"` is also present, plus standalone `"dry riser"` as a catch-all that maps to installation when no PT/visual keyword is present.

### 3. Fix the slug mapping table
Update `JOB_TO_TEMPLATE_SLUG` to match what actually exists in `category_document_templates`:
- `dry_riser_installation` → `"dry_riser_installation"` ✓ (already correct, has 4 templates)
- `dry_riser_pressure_test` → `"pressure_test"` ✓  
- `dry_riser_visual` → `"visual"` ✓  
- `fire_hydrant_service` → try both `"hydrant_service"` AND `"fire_hydrant"` (DB has templates under both)
- `fire_extinguishers` → `"fire_extinguisher"` ✓

### 4. Log the full raw payload
Add `console.log("Raw payload:", JSON.stringify(body).slice(0, 500))` so next time a misclassified job arrives we can see exactly what fields The Mellor sent.

## Changes to make

**`supabase/functions/receive-quote-hound/index.ts`**:

- Add full payload logging at the top of the handler
- Expand field extraction to read `title`, `name`, `line_items[].description`, `items[].description`, `works`, `scope_of_works`, `job_description` and concatenate them all into the text used for classification
- Add broader dry riser keywords — including standalone `"dry riser"` (when not matched by PT/visual keywords first), `"supply and install"`, `"new installation"`, `"commission"`, `"dri"`
- Update `JOB_TO_TEMPLATE_SLUG` to also try `fire_hydrant` as a fallback for hydrant jobs
- Redeploy the function

## What this solves

When `job_type` is `"General"` but the quote title says `"Dry Riser Installation - 123 High Street"`, the widened field extraction will pick up that title and keyword-match it to `dry_riser_installation`, attaching the correct Quote, PO, RAMS, and Site Drawings documents automatically.

For the two existing mis-categorised jobs (TM-CEB1592/1504 and TM-SC/2067), you'll need to manually update their category in the job detail — but all future imports will be handled correctly.
