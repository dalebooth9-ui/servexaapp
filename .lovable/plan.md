
## Root Cause (Confirmed by Logs)

The logs show exactly what's happening:

```
Classification text: "general"
AI classified category: site_survey
```

The Mellor sends **only** `job_type: "General"` with no title, description, scope, or line items. CCG has `excel_url: null` — no spreadsheet either. The AI sees the word "general" and picks `site_survey` as the closest match.

The current "isGeneric + Excel fallback" logic was the right idea, but it only helps when an Excel URL is present. Most Mellor jobs send nothing useful.

**You've confirmed all jobs from The Mellor are wet & dry riser installations.** The correct fix is simple: stop trying to classify Mellor jobs and just default them to `dry_riser_installation`.

---

## The Fix

One change in `receive-quote-hound/index.ts`:

**Replace the entire classify → keyword match → AI fallback chain** with a direct default. Since The Mellor only ever sends installation work, skip classification entirely and hardcode `dry_riser_installation` as the category for all Mellor imports.

Keep the keyword/AI logic as a commented-out block so it can be re-enabled later if The Mellor ever sends varied job types (e.g. pressure tests).

The `isInstallation` flag will be `true`, so the pre-start checklist also auto-attaches — giving each new job its full set of 5 documents: Quote, Purchase Order, RAMS, Site Drawings, Pre-start Checklist.

**Also fix the job name**: Currently arriving as `"General — CCG"`. Since we know it's an installation, build the name as `"Dry Riser Installation — CCG"` when `job_type` is `"General"`.

---

## Changes

**`supabase/functions/receive-quote-hound/index.ts`**:

1. After extracting `clientName`, `jobType`, etc — replace the `inferCategorySlug` call with:
   ```ts
   const categorySlug = "dry_riser_installation";
   const isInstallation = true;
   ```
2. Fix the job name builder: when `jobType` is `"General"` (or null), use `"Dry Riser Installation"` as the display name instead:
   ```ts
   const effectiveType = (jobType && jobType.toLowerCase() !== "general")
     ? jobType
     : "Dry Riser Installation";
   ```
3. Keep the Excel fetch and keyword/AI functions in the file (commented out) for future use.
4. Redeploy.

---

## Result

Every future Mellor import will:
- Land as `dry_riser_installation`
- Be named `"Dry Riser Installation — [Client]"` instead of `"General — [Client]"`
- Auto-attach: Quote, Purchase Order, RAMS, Site Drawings, Pre-start Checklist

The two existing mis-categorised jobs (TM-CEB1592/1504 CCG and TM-SC/2067 Pro Defend) will still need their category manually corrected in the job detail, then use the **Re-attach Job Documents** tool in Settings to pull in the correct documents.
