import { supabase } from '@/integrations/supabase/client';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/** A successful write alone is not proof that the complete report can be read. */
export function verifyReportCopy(row: { id: string; status: string; responses: unknown } | null, expected: { id: string; status: string; responses: unknown }): void {
  if (!row || row.id !== expected.id || row.status !== expected.status || canonical(row.responses) !== canonical(expected.responses)) {
    throw new Error('The saved report could not be read back with all its answers and photos.');
  }
}

export async function persistReport(payload: Record<string, any>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const { error } = await supabase.from('job_sheet_responses').upsert(payload as any, { onConflict: 'id' }).abortSignal(controller.signal);
    if (error) throw error;
    const { data, error: readError } = await supabase.from('job_sheet_responses').select('*').eq('id', payload.id).eq('job_id', payload.job_id).abortSignal(controller.signal).single();
    if (readError) throw readError;
    verifyReportCopy(data, payload as { id: string; status: string; responses: unknown });
    return data;
  } finally { clearTimeout(timeout); }
}

/** Office review also lists saved sheets before the engineer completes the whole job. */
export function hasPendingSheetReview(status: string): boolean {
  return ['active', 'scheduled', 'in_progress', 'requires_revisit', 'rejected', 'submitted_for_review'].includes(status);
}