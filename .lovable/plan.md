# In-app AI Help Assistant Upgrade

## Audit of current state

`src/components/TechnicianAssistant.tsx` + `supabase/functions/technician-assistant/index.ts` is the only in-app assistant. It:
- Is mounted ONLY on `JobDetail` (top-right floating Bot button), scoped to a single job's context.
- Sends `{messages, job_context}` to the edge function; system prompt is a hard-coded field-technician diagnosis coach with BS 9990 / EN 12845 / BS 5306-3 rules.
- Has no page/route awareness, no product knowledge base, no grounding — it's a fault-diagnosis chatbot, not a "how do I use this app" guide.
- Uses `google/gemini-3-flash-preview` via Lovable AI Gateway (raw fetch + SSE parse, not AI SDK).

So the technician diagnosis assistant is worth keeping (job-scoped BS-standards coach on JobDetail). The new work is a separate **Help Assistant** available on every page.

## What we're building

### 1. `help_articles` table (maintainable KB)
```
help_articles(
  id uuid pk,
  slug text unique,            -- e.g. 'jobs', 'jobs.create', 'settings.branding'
  route_pattern text,          -- e.g. '/jobs', '/jobs/:id', '/settings'
  title text,
  purpose text,                -- "What this page is for"
  steps jsonb,                 -- [{heading, items:[string...]}]
  common_problems jsonb,       -- [{problem, fix}]
  related_slugs text[],
  keywords text[],
  last_updated timestamptz default now()
)
```
- RLS: SELECT to `authenticated` (help content is not sensitive), write to admins only.
- Seeded via migration with one row per route/feature (see list below).
- Admin editor lives at Settings → Advanced → **Help Articles** (list + edit form + last_updated stamp). This is how Dale/devs keep it honest going forward.

### 2. Route → article resolver
`src/lib/helpArticles.ts` exports `resolveHelpSlug(pathname)` mapping `/jobs/:id` → `jobs.detail`, `/settings` → `settings`, etc. Plus `fetchArticlesForContext(slug)` that returns the current article + related articles.

### 3. `HelpAssistant` floating button (global)
Mounted in `AppLayout` so it appears on every authenticated page (except technician-heavy JobDetail where it sits beside the existing TechnicianAssistant with a different icon — `HelpCircle` vs `Bot`).
- Opens a chat panel similar in style to TechnicianAssistant.
- On open, reads `useLocation().pathname`, resolves the current article, shows a greeting: *"You're on **Jobs**. Ask me anything about this page."* and 3 quick-prompt buttons derived from the article's steps ("How do I create a job?", "How do I scan a paper report?", etc.).
- Sends `{messages, page: {slug, pathname, title}, articles: [current, ...related]}` to a new edge function.

### 4. `help-assistant` edge function (grounded)
New `supabase/functions/help-assistant/index.ts`:
- Uses `openai/gpt-5.5` via Lovable AI Gateway, streaming.
- Loads the article(s) for the requested slug + related slugs from `help_articles` server-side (never trusts client-sent content).
- System prompt: *"You are the in-app help assistant for Servexa. Answer ONLY using the KNOWLEDGE below. Give numbered steps using the exact button/menu labels quoted. If the answer is not in the knowledge, reply: 'I don't have that in my help notes — please contact support (Settings → Support Tickets).' Do not invent features. Keep answers under ~8 lines unless the user asks for detail."*
- Injects the resolved articles as `## KNOWLEDGE` block.
- Returns SSE stream.

### 5. Initial KB content (written from the codebase, not guesses)
One article per route/feature, with real button labels verified against source. Slugs to seed:

`dashboard`, `jobs`, `jobs.create`, `jobs.detail`, `jobs.sheets`, `jobs.print-site-sheets`, `jobs.paper-scan`, `paper-scan-queue`, `po-email-intake`, `customers`, `customers.detail`, `sites`, `assets`, `assets.detail`, `engineers`, `planner`, `leave`, `defects`, `defects.review`, `compliance`, `audits`, `site-surveys`, `quotes`, `invoices`, `contracts`, `parts-library`, `van-stock`, `industry-templates`, `rams`, `reports`, `report-downloads`, `settings`, `settings.branding`, `settings.documents`, `settings.engineer-signatures`, `settings.import`, `settings.storage-migration`, `whatsapp`, `fleet`, `my-profile`, `my-timesheet`, `sync-status`, `setup`, `install`, `fire-log`, `sign-off`.

For each: `purpose`, 2–5 `steps` groups with numbered items using **exact** button labels pulled from the corresponding page source (e.g. Jobs page: "Click **New Job**", JobDetail: "Click **Print for site**", Settings → Advanced: "Storage migration"), `common_problems`, `related_slugs`.

### 6. Change-hygiene note
KB structure includes `last_updated`. The admin editor surfaces "articles not updated in 90+ days" so stale entries get flagged. Add a short section to `.lovable/plan.md` reminding future edits to update the relevant article slug when a feature ships.

## Files to add
- `supabase/migrations/<ts>_help_articles.sql` (table + RLS + GRANTs + seed inserts for all slugs above).
- `supabase/functions/help-assistant/index.ts`
- `src/lib/helpArticles.ts` (route→slug map, fetch helpers)
- `src/components/HelpAssistant.tsx` (floating panel)
- `src/components/HelpArticlesAdmin.tsx` (list + edit + last_updated view; embedded in SettingsPage under Advanced)

## Files to edit
- `src/components/AppLayout.tsx` — mount `<HelpAssistant />` for authenticated users.
- `src/components/TechnicianAssistant.tsx` — reposition slightly so the two buttons don't overlap on JobDetail (Help left of Technician).
- `src/pages/SettingsPage.tsx` — add Advanced → Help Articles panel.
- `.lovable/plan.md` — add "when shipping feature X, update `help_articles` slug Y" reminder.

## Out of scope
- Rewriting the existing TechnicianAssistant behaviour or its BS-standards prompt — kept as-is.
- Multi-language KB (English only for now).
- End-user (customer portal) help.

## Estimated size
~1 migration with ~45 seed rows, 1 edge function, 3 new components, ~4 edited files. Large but mechanical — most of the effort is writing accurate KB copy from source.

Approve and I'll implement in one pass, then report back with the seeded article count and a screenshot check on 2–3 pages.


## Help Articles hygiene
When you ship a UI change (button rename, new feature, workflow tweak), update the matching row in `help_articles` (Settings → Advanced → Help Articles) so the in-app AI Help Assistant stays accurate. The last_updated column is auto-stamped; entries not touched in 90+ days show a stale warning in the admin panel.
