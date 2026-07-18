## Engineer Mobile Simplification

Scope: engineer-role users only. Admin/office UI untouched.

### 1. New Engineer Home ("Today")
- Create `src/components/engineer/EngineerTodayHome.tsx` — the single landing surface for engineers.
- Route swap in `src/pages/Dashboard.tsx`: when `userRole === 'engineer'`, render `EngineerTodayHome` instead of the existing `EngineerDashboard` (keeps old file untouched in case we need to revert; we'll stop routing to it).
- Layout: two tabs only — **Today** / **This week**.
  - **Today**: big cards (site name xl, customer, time/order, job-type chip, distance if known). Empty state: "No jobs scheduled today" + line showing next scheduled day (query `job_schedule` for engineer's next date > today).
  - **This week**: grouped by date; extra "Awaiting date" group for `job_assignments` rows whose job has no future `job_schedule` entry (item 4).
- Reuse `job_schedule` + `jobs` queries already in `TodaysDashboard.tsx`; extend to week window and unscheduled assignments.
- Strip: dashboard widgets, KPIs, pool, admin cards.

### 2. Guided next-step button on job page
- New component `src/components/engineer/EngineerNextStepBar.tsx` — sticky bottom bar for engineers on `/jobs/:id`.
- State machine derives the single primary action from the job:
  1. `Start job` (job not yet in progress).
     - Before starting, if today's vehicle check is not done → intercept, route to vehicle check, return.
  2. `Read & sign RAMS` (if job has RAMS not yet signed by this engineer).
  3. `Fill job sheet` (response exists but incomplete, or not started).
  4. `Add photos` (job sheet done but no photos yet — prompt, skippable).
  5. `Remedial checklist` (if remedial items outstanding).
  6. `Complete & sign` (all above satisfied).
- Renders only for engineer role; admin view unchanged. Tabs stay reachable above.

### 3. Tap target + font audit (engineer surfaces only)
- Add a scoped utility class in `src/index.css`: `.engineer-touch` (min-h-11 min-w-11, text-base labels, remove hover-only affordances).
- Apply to: `EngineerTodayHome`, `EngineerNextStepBar`, `JobSheet.tsx` engineer path (labels bump to `text-base`, sticky save bar already present — verify sticky on mobile), any `hover:` only reveals in engineer flows converted to always-visible.
- Sticky Save: ensure `JobSheet` save bar has `sticky bottom-0` on mobile for engineers.

### 4. Awaiting-date visibility
- In "This week" tab, query `job_assignments` for engineer, left-join `job_schedule`, surface jobs with no upcoming schedule row under an "Awaiting date" section with muted styling and a "Not yet scheduled" chip.

### Technical notes
- No schema changes required. Pure UI additions plus one routing swap in `Dashboard.tsx`.
- Reuse `useAuth().userRole`, `useTimeClock`, existing geocode + priority helpers from `TodaysDashboard.tsx`.
- Old `EngineerDashboard.tsx` left in place, dereferenced.
- New files:
  - `src/components/engineer/EngineerTodayHome.tsx`
  - `src/components/engineer/EngineerWeekView.tsx`
  - `src/components/engineer/EngineerNextStepBar.tsx`
- Edited files:
  - `src/pages/Dashboard.tsx` (swap component)
  - `src/pages/JobDetails.tsx` (mount `EngineerNextStepBar` for engineer role) — will confirm exact filename on implementation
  - `src/components/JobSheet.tsx` (label sizing + sticky save on mobile)
  - `src/index.css` (utility)

### Out of scope
- Office/admin dashboards, planner, pool, settings.
- No changes to permissions or data model.
