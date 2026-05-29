# Stop engineers missing jobs

Three-layer safety net so jobs from the planner can't slip through paperwork gaps.

## 1. Morning push notification (7am)

- New edge function `send-engineer-daily-jobs` (CRON_SECRET protected).
- Scheduled via `pg_cron` to run daily at 07:00 UK time.
- For each engineer with jobs in `job_schedule` for today:
  - Insert one row in `notifications` (title: "Today's jobs", message: "You have N jobs scheduled today — tap to view & acknowledge"). Existing `NotificationBell` realtime listener picks it up.
  - PWA push: a service-worker push payload using the existing PWA. (If web-push VAPID isn't already configured, the in-app notification + the existing realtime toast covers it; we add a `pushSubscription` table + VAPID only if you confirm — flagging this rather than silently installing keys.)

## 2. Mandatory acknowledgement

Schema additions on `job_schedule`:

- `acknowledged_at timestamptz null`
- `acknowledged_by uuid null`

UI:

- `TodaysDashboard.tsx` (engineer home) gets an "Acknowledge" button per job card. Until tapped, the card shows an amber "Not yet acknowledged" badge.
- One-tap acknowledgement writes both fields. Optimistic UI with existing 8-sec undo pattern.

Escalation:

- Second cron at 10:00 UK time: any `job_schedule` row for today still missing `acknowledged_at` → insert admin notification ("Unacknowledged: {engineer} hasn't confirmed {ref}") via existing `notifications` table (NotificationBell already shows these to admins).

## 3. Admin missed-jobs dashboard

New section in `AdminDashboard.tsx`: "At-risk jobs today"

Three buckets, each a small card list with one-click actions:

1. **Unacknowledged** — scheduled today, not yet acknowledged (after 9am).
2. **Not started** — acknowledged but no job_visit / submission activity by 14:00.
3. **End-of-day missed** — scheduled today, status still `scheduled` after 17:00, no submissions.

Each row: engineer name, job ref, customer, "Reassign" button (opens existing `AutoAssignSuggestion`), "Call engineer" tel-link, "Mark complete" shortcut.

## Technical details

- Migration: add 2 columns to `job_schedule`, no constraint changes.
- Edge functions: `send-engineer-daily-jobs`, `check-unacknowledged-jobs`. Both gated by `x-cron-secret` header (existing `CRON_SECRET` pattern).
- pg_cron jobs (via `supabase--insert`, not migration, because they embed the anon key):
  - `daily-jobs-7am` at `0 7 * * *`
  - `unacknowledged-check-10am` at `0 10 * * *`
- Reuses existing `notifications` table + realtime `NotificationBell` — no new client wiring for delivery.
- All changes scoped to `engineer` + `admin` roles using existing `has_role()` checks.

## Out of scope (flag for follow-up)

- True web-push (requires VAPID keys + service worker registration). Today's plan delivers in-app notification + realtime toast; if engineers must be alerted while the app is closed, we'll add VAPID push as a follow-up.
- WhatsApp/SMS reminders (Twilio is connected — easy add later if you want belt-and-braces).
