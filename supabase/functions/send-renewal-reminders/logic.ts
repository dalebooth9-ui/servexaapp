export function reminderKind(row: { next_due_date: string; reminder_due_sent_at?: string | null; reminder_lead_sent_at?: string | null }, interval: { reminder_lead_weeks?: number; send_due_date_reminder?: boolean } | undefined, manual: boolean, enabled: boolean, todayIso: string) {
  if (manual) return 'manual';
  if (!enabled) return null;
  const days = Math.round((Date.parse(row.next_due_date) - Date.parse(todayIso)) / 86400000);
  if (days <= 0 && interval?.send_due_date_reminder !== false && !row.reminder_due_sent_at) return 'due';
  if (days > 0 && days <= (interval?.reminder_lead_weeks ?? 4) * 7 && !row.reminder_lead_sent_at) return 'lead';
  return null;
}

export async function dispatchReminder(dryRun: boolean, send: () => Promise<{ data: any; error: any }>) {
  if (dryRun) return { dry_run: true, queued: false };
  const { data, error } = await send();
  if (error || data?.success !== true || data?.queued !== true) throw new Error(data?.error || data?.reason || error?.message || 'Email service did not queue the reminder');
  return { dry_run: false, queued: true };
}