import { createStore, get, set, del, keys } from 'idb-keyval';
import { supabase } from '@/integrations/supabase/client';
import { scrubSecrets } from '@/lib/errorLogger';

const store = createStore('servexa-report-errors', 'pending');
type Failure = { id: string; userId: string; jobId: string; jobRef: string; reportId: string | null; reason: string; createdAt: string };
let sending = false;

/** Record locally first so failed offline sends reach Error log after reconnection. */
export async function recordReportFailure(input: Omit<Failure, 'id' | 'createdAt'>): Promise<void> {
  const failure = { ...input, reason: scrubSecrets(input.reason), id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  await set(failure.id, failure, store);
  void flushReportFailures();
}

export async function flushReportFailures(): Promise<void> {
  if (sending || !navigator.onLine) return;
  sending = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: orgId, error: orgError } = await supabase.rpc('get_user_org_id');
    if (orgError || !orgId) return;
    for (const key of await keys(store)) {
      const failure = await get<Failure>(key, store);
      if (!failure || failure.userId !== session.user.id) continue;
      const { error } = await supabase.from('client_errors').insert({ id: failure.id, user_id: failure.userId, org_id: orgId, source: 'client', message: `Report submit failed (${failure.jobRef}): ${failure.reason}`, created_at: failure.createdAt, context: { jobId: failure.jobId, jobRef: failure.jobRef, reportId: failure.reportId, reason: failure.reason }, route: window.location.pathname, user_agent: navigator.userAgent });
      if (!error || error.code === '23505') await del(key, store);
    }
  } finally { sending = false; }
}