import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

const schema = z.object({ job_id: z.string().uuid(), notification_token: z.string().uuid() });
Deno.serve(async req => {
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return reply({ error: 'Email service configuration missing' }, 500);
  const admin = createClient(url, key);
  let orgId: string | undefined;
  let jobId: string | undefined;
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return reply({ error: 'Invalid notification request' }, 400);
    const { data: request, error } = await admin.from('ops_notification_requests').select('org_id,job_id').eq('job_id', parsed.data.job_id).eq('token', parsed.data.notification_token).maybeSingle();
    if (error || !request) return reply({ error: 'Notification not authorised' }, 403);
    orgId = request.org_id;
    jobId = request.job_id;
    const { data, error: sendError } = await admin.functions.invoke('send-transactional-email', { body: { templateName: 'new-job-from-api', job_id: jobId, recipientEmail: 'resolved-server-side' } });
    if (sendError || !data?.success || !data?.queued) throw new Error(data?.error || sendError?.message || 'Ops notification was not queued');
    await admin.from('email_step_health').update({ status: 'queued', error_message: null, checked_at: new Date().toISOString() }).eq('org_id', orgId).eq('step', 'email_triage_ops').eq('job_id', jobId);
    return reply({ success: true, queued: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Ops notification failed; job remains saved:', message);
    if (orgId && jobId) await admin.from('email_step_health').update({ status: 'failed', error_message: message, checked_at: new Date().toISOString() }).eq('org_id', orgId).eq('step', 'email_triage_ops').eq('job_id', jobId);
    return reply({ error: message }, 500);
  }
});