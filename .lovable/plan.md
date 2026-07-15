## Admin UI Declutter Pass

Scope: desktop/admin only. No colour/palette changes, no mobile changes, no removed functionality — only demotion, grouping and density work.

---

### 1. Job page header (`src/pages/JobDetail.tsx`)
- Collapse the current stacked header into three lines:
  1. Job title + `VFP-xxxx` · customer · site (muted metadata line)
  2. Single primary button **"Send to Customer"** + `⋯ Actions` dropdown (shadcn `DropdownMenu`)
  3. Compact control row: status select · priority · result badge
- Move into the `⋯` menu: AI Job Brief, Export PDF, Export Word, Print for site, Regenerate report, Duplicate, Delete, any other current header buttons.
- Tabs untouched. Body content untouched.

### 2. Dashboard rework (`src/components/DirectorDashboard.tsx`)
Reorder into an "action-first" layout:
- **Above the fold — Needs me today:**
  - Jobs awaiting approval (incl. flagged PO intake drafts) — clickable rows → JobDetail
  - Overdue jobs — clickable → JobDetail
  - This week schedule summary — clickable → Planner
  - Recent activity feed — clickable through
- **Below the fold (collapsible `<details>` / accordion):** KPI/informational widgets (revenue, compliance %, charts, etc.) — kept, just demoted.
- Every list row uses a real `<Link>`.

### 3. Storage migration panel — hide entry point
- Remove the `StorageMigrationPanel` render from `SettingsPage.tsx` Advanced tab.
- Keep the component file and any route intact so a direct URL still works for emergencies (add a hidden `/settings/storage-migration` route pointing at the panel if one doesn't exist).

### 4. Settings page grouping (`src/pages/SettingsPage.tsx`)
Per settings section, wrap rarely-touched blocks in a collapsed `<Collapsible>` labelled "Advanced". Keep top-level and expanded by default:
- Documents / branding
- Engineer signatures
- Email branding
- Templates
Everything else (webhooks, integrations config, cron/debug, danger zone, storage migration link, etc.) goes into the collapsed Advanced group on its respective tab.

### 5. Jobs list rows (`src/components/jobs/DraggableJobRow.tsx`)
- Line 1: ref + name + primary status badge only.
- Line 2 (smaller, muted, single line, truncates): site · category · due date · scope counts (PT/Vis/Other) · submissions count.
- Drop redundant decorative pills where the same info is already shown (e.g. `category` text pill when a category badge exists; separate "sub" count when submissions icon shows).
- Palette unchanged — only sizes, weights and muted-foreground usage adjusted.

### 6. Visual calm sweep
- In JobDetail body sections and Settings cards: remove one layer of nested `Card > Card` where present; standardise on outer `Card` + plain `div` inner sections with consistent spacing (`space-y-4`, `p-4`).
- Remove duplicate section titles where the tab label already names the section.

### 7. Deliverable summary at end
After edits, reply with a concise list: screen → what was demoted → new location, so the owner can locate everything.

---

### Files expected to change
- `src/pages/JobDetail.tsx` (header restructure, nested-card cleanup)
- `src/components/DirectorDashboard.tsx` (reorder + collapsibles)
- `src/pages/SettingsPage.tsx` (hide storage panel, add Advanced collapsibles)
- `src/App.tsx` (add hidden emergency route for storage migration if missing)
- `src/components/jobs/DraggableJobRow.tsx` (two-line row density)

Out of scope this pass: mobile engineer views, any colour token, any backend/RLS/database change, any removal of features.

Please confirm and I'll implement in one pass.