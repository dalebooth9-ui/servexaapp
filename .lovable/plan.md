# Planner — high-density days

Goal: one engineer × 16+ visits in a single day must remain readable, fast to assign, correctly routed, and clean on mobile — without breaking single-drag flows.

## Task A (already done, out of scope of this plan)
Dashboard "Completed jobs" queries switched from `updated_at` to canonical `completed_at` (with `updated_at` fallback for legacy rows) in `DirectorDashboard.tsx` and `AdminDashboard.tsx`. Root cause: both dashboards bucketed completed jobs by `updated_at`; a manual/SQL status flip that doesn't bump `updated_at` (no trigger on the column) fell outside the current-week/month window even though `completed_at` was correctly set today.

## Scope of this plan (Task B)

### 1. Compact day cells (weekly grid)
File: `src/components/planner/WeeklyGridView.tsx`

- Threshold: `COMPACT_THRESHOLD = 4`. When a `(engineer, day)` cell holds >4 entries, render "mini rows" instead of full `DraggableScheduleCard`s:
  - one line per visit: `HH:mm · site name · POSTCODE` (fall back to job name / ref if site is null)
  - compact status dot + priority stripe kept
  - overflow after 6 mini-rows collapses further into a "+N more" pill
- Above the mini rows: count badge `{n} jobs` + a **Open day** button that opens the Expanded Day Panel.
- Still a droppable target — single drops (unallocated → cell, or move between cells) continue to work exactly as today.
- Under threshold: unchanged rendering.

### 2. Expanded Day Panel (new component)
File: `src/components/planner/DayPanel.tsx`

- Sheet/Dialog opened from a compact cell or by tap on any day header.
- Header: engineer, date, visit count, "Optimise route" and "View on map" actions (reusing existing handlers from `PlannerMapView`).
- Ordered list of that day's visits with `@dnd-kit/sortable` (vertical) to reorder — persists to `job_schedule.sort_order` (see 6).
- Row actions: remove, adjust span, jump to job.
- Empty state hidden — panel only opens when ≥1 visit.

### 3. Bulk assign in unallocated list
File: `src/pages/WeeklyPlanner.tsx` + new `src/components/planner/BulkAssignBar.tsx`

- Toggle "Select" mode in unallocated sidebar header; each unallocated card shows a checkbox in select mode (single-drag disabled while a card is selected).
- Sticky footer: `{n} selected · Engineer ▾ · Date ▾ · [Assign] [Clear]`.
- Assign action inserts N `job_schedule` rows in one `.insert([...])` call, invalidates queries, shows toast with undo (leans on the existing 8-second undo store).
- Multi-day option: reuse the existing `MultiDayScheduleDialog` when user picks "spread over N days".

### 4. Route-stop cap (25)
Files: `src/components/planner/PlannerMapView.tsx` and the route-optimise action call sites.

- Google Routes API supports 25 intermediate waypoints (27 total incl. origin+destination).
- Before invoking optimisation: if stops > 25, show a friendly toast: "This day has {n} stops. Google Routes can optimise up to 25 in one pass — showing the first 25 in the order you have them. Split the day or adjust manually." Continue with first 25 for the API call and render the remainder as pins-only (no leg lines) so the map stays honest.
- Map pins clustering already present via existing map component — verify clustering enabled for >20 pins; enable if not.

### 5. Mobile: engineer day list
File: `src/pages/EngineerToday.tsx` (or equivalent — will confirm during implementation) and `src/components/EngineerDashboard.tsx`

- List view uses the same compact row primitive as the planner grid mini-row (extracted to `src/components/planner/CompactVisitRow.tsx` so both share it).
- Each row taps to expand inline (accordion): shows notes, parts, quick actions (Directions, Complete, Photos).
- Sticky header "Today · {n} visits · {done}/{n} complete" so 16-visit days feel manageable.

### 6. Data / migration
- Add `sort_order INT` to `job_schedule` (nullable, default null). Backfill: for each `(engineer_id, schedule_date)` group, set incrementally by `created_at`.
- DayPanel reordering writes `sort_order` for the whole day in one transaction.
- All existing planner queries add `order("sort_order", { ascending: true, nullsFirst: false })` then `created_at` as tiebreaker.

## Technical notes (for review)

- Keep `DndContext` in `WeeklyGridView` untouched; DayPanel gets its own local `DndContext` with `SortableContext`.
- Bulk assign uses one `.insert([...])` — with RLS in place, service role not required; failures reported per-row via the returned array.
- Compact mini-row remains a `useDraggable` source so an admin can still drag a single visit out of a dense day into another cell without opening the panel.
- No changes to job status semantics or completion logic.

## Files to add/edit

```text
add    src/components/planner/DayPanel.tsx
add    src/components/planner/BulkAssignBar.tsx
add    src/components/planner/CompactVisitRow.tsx
edit   src/components/planner/WeeklyGridView.tsx
edit   src/components/planner/PlannerMapView.tsx
edit   src/pages/WeeklyPlanner.tsx
edit   src/pages/EngineerToday.tsx (or engineer day list host)
edit   src/components/EngineerDashboard.tsx (compact list rows)
migr   add job_schedule.sort_order + backfill
```

## Open assumption to confirm

Threshold of 4 for "compact" mode — happy to tune (3 or 5). Same question for the "+N more" cutoff inside compact cells (defaulting to 6 visible mini rows).
