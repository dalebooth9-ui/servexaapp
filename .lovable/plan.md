
## UX & App Review — FieldReport

I've reviewed the full codebase, session replay (shows a user browsing the admin dashboard bar chart), the screenshot (showing the login page), and the key pages. Here's an honest assessment with specific, actionable improvements.

---

### What's Working Well
- Clean dark sidebar with good contrast
- Engineer dashboard is well-designed for mobile (large touch targets, tab navigation, clock in/out)
- KPI cards and weekly chart on the admin dashboard are useful
- Drag-to-reorder nav items is a clever power-user feature
- AI Help Wizard with voice input is a strong differentiator

---

### Issues Found & Proposed Improvements

**1. Login page — plain and off-brand**
- The auth page is a basic centered card with no branding beyond a small favicon
- No "Forgot password?" link — users are stuck if they forget credentials
- Improvement: Add a subtle branded background panel (like the sidebar gradient colour), a "Forgot password?" flow, and make the card feel more polished

**2. Admin Dashboard — quick actions are confusing**
- Three outline buttons ("Create Job", "Create Customer", "Upload Files") all navigate to `/jobs` — "Upload Files" does not actually trigger an upload
- "Create Customer" should go to `/customers`, not `/jobs`
- "Upload Files" button should open the folder import dialog directly
- The buttons lack visual hierarchy — a primary "Create Job" button would stand out better

**3. Sidebar — 15 nav items is overwhelming**
- Many items are rarely used (Industry Templates, Parts Library, Audits, Compliance, Sites, Assets all visible at once)
- The drag-to-reorder feature is useful but most users won't discover the grip handle (it only appears on hover)
- Improvement: Group items into collapsible sections (e.g. "Field Ops", "Management", "Reports") or add a "pin/unpin" mechanism

**4. Navigation — two identical icons**
- Both "Audits" and "Industry Templates" use the `ClipboardCheck` icon — this makes the sidebar visually confusing
- Improvement: Use distinct icons (e.g. `ListChecks` for Audits, `BookOpen` for Templates)

**5. Jobs page — high complexity**
- The Jobs page is 1,406 lines with many dialogs, filters, and drag-and-drop
- New users will struggle to find "Create Job" — consider a floating action button (FAB) on mobile views
- The filter/search bar could benefit from a clearer visual separation from the job list

**6. Dashboard "Recent Activity" — low signal**
- Shows submission type ("photo", "document") without a thumbnail or detail — clicking requires going to the job
- Improvement: Show a small thumbnail for photo submissions inline

---

### Plan

1. **Fix the three quick-action buttons** on AdminDashboard — correct the navigation targets and wire "Upload Files" to the folder import dialog
2. **Fix duplicate icons** in the sidebar (Audits vs Templates)
3. **Add "Forgot password?" link** to the Auth page with a Supabase password reset flow
4. **Improve sidebar grouping** — add subtle section labels ("Operations", "Admin") to break up the 15-item list visually without removing any items
5. **Polish the auth page** — add a branded left panel with the app description for a more professional first impression

---

### Files to Change

```text
src/components/AdminDashboard.tsx     — fix quick action buttons
src/components/AppLayout.tsx          — fix icons, add section labels to nav
src/pages/Auth.tsx                    — add forgot password + branded panel
```

No database changes required.
