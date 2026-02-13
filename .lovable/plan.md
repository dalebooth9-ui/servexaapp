

## AI-Powered Field Report Summaries

When a field report is saved, the app will automatically generate a concise AI summary and store it alongside the report. This summary will appear on the report cards and in the view dialog, giving users a quick overview without reading the full content.

---

### What changes

1. **Database: Add `summary` column to `field_reports`**
   - Add a nullable `text` column called `summary` to the `field_reports` table
   - No changes to RLS policies needed (existing policies cover all columns)

2. **Backend: New `summarize-report` edge function**
   - Creates `supabase/functions/summarize-report/index.ts`
   - Accepts a `reportId` in the request body
   - Reads the report content from the database using the service role key
   - Strips HTML tags from the rich text content
   - Calls Lovable AI (Gemini Flash) with a prompt to produce a 1-2 sentence summary
   - Updates the report's `summary` column with the result
   - Handles rate limit (429) and payment (402) errors gracefully
   - JWT verification disabled in `config.toml`; auth checked in code

3. **Frontend: Trigger summarization after saving a new report**
   - In `FieldReports.tsx`, after a successful **new report insert**, call the `summarize-report` edge function in the background (fire-and-forget)
   - The realtime subscription will automatically refresh the report card once the summary is written to the database
   - No summarization on edits (to avoid unnecessary AI calls); users can manually re-summarize if desired

4. **Frontend: Display summaries in the UI**
   - On each report **card**: show the summary text (truncated to 2 lines) below the author/date line
   - In the **view dialog**: show the summary in a highlighted box above the full content
   - Show a "Summarizing..." indicator while the summary is being generated (when summary is null on a new report)
   - Add a "Re-summarize" button in the view dialog for updated reports

---

### Technical Details

**Edge function (`supabase/functions/summarize-report/index.ts`):**
- Uses `LOVABLE_API_KEY` (already configured) to call `https://ai.gateway.lovable.dev/v1/chat/completions`
- Model: `google/gemini-3-flash-preview`
- Uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to read/write the report
- Non-streaming request (simple JSON response)

**Database migration:**
```sql
ALTER TABLE public.field_reports ADD COLUMN summary text;
```

**Config update (`supabase/config.toml`):**
```toml
[functions.summarize-report]
verify_jwt = false
```

**Files to create/modify:**
- `supabase/functions/summarize-report/index.ts` (new)
- `supabase/config.toml` (add function config)
- `src/components/FieldReports.tsx` (trigger summarization, display summary)
- Database migration for the `summary` column

