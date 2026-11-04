import { describe, expect, it, vi } from 'vitest';
import { dispatchReminder, reminderKind } from '../../supabase/functions/send-renewal-reminders/logic';

describe('renewal email safety', () => {
  const row = { next_due_date: '2026-11-04' };
  it('never dispatches a dry run', async () => {
    const send = vi.fn();
    expect(await dispatchReminder(true, send)).toEqual({ dry_run: true, queued: false });
    expect(send).not.toHaveBeenCalled();
  });
  it('keeps automatic reminders off while allowing an explicit manual reminder', () => {
    expect(reminderKind(row, {}, false, false, '2026-11-04')).toBeNull();
    expect(reminderKind(row, {}, true, false, '2026-11-04')).toBe('manual');
  });
  it('does not pretend a suppressed or failed email was queued', async () => {
    await expect(dispatchReminder(false, async () => ({ data: { success: false, reason: 'email_suppressed' }, error: null }))).rejects.toThrow('email_suppressed');
  });
  it('respects configured due reminders and lead weeks', () => {
    expect(reminderKind(row, { send_due_date_reminder: false }, false, true, '2026-11-04')).toBeNull();
    expect(reminderKind({ next_due_date: '2026-11-18' }, { reminder_lead_weeks: 1 }, false, true, '2026-11-04')).toBeNull();
  });
});