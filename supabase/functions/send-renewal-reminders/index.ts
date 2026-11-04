// Explicit manual sends are admin/company scoped; cron retains the organisation opt-in.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { getEmailBranding } from '../_shared/customerEmail.ts';
import { dispatchReminder, reminderKind } from './logic.ts';

const schema = z.object({ schedule_id: z.string().uuid().optional(), manual: z.boolean().default(false), dry_run: z.boolean().default(false) });
const DEFAULT_TEMPLATE = 'Hi {{customer_name}},\n\nThe following service at {{site_name}} is due on {{due_date}}:\n{{services_list}}\n\nPlease reply to arrange a visit.\n\nKind regards,\n{{from_name}}';
Deno.serve(async req => {
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return reply({ error: 'Email service configuration is missing' }, 500);
  const admin = createClient(url, key);
  let orgId: string | null = null;
  let dryRun = false;
  const health = async (org: string, status: string, error_message: string | null) => {
    const result = await admin.from('email_step_health').upsert({ org_id: org, step: 'renewal_reminders', status, error_message, checked_at: new Date().toISOString() });
    if (result.error) console.error('Renewal health log failed:', result.error.message);
  };
  try {
    const raw = await req.text();
    const parsed = schema.safeParse(raw.trim() ? JSON.parse(raw) : {});
    if (!parsed.success) return reply({ error: 'Invalid reminder request' }, 400);
    const body = parsed.data;
    dryRun = body.dry_run;
    const cronSecret = Deno.env.get('CRON_SECRET');
    const isCron = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret;
    if (!isCron) {
      const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
      if (!token) return reply({ error: 'Sign in as a company admin' }, 401);
      const { data: auth, error: authError } = await admin.auth.getUser(token);
      if (authError || !auth.user) return reply({ error: 'Sign in again to send a reminder' }, 401);
      const caller = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } });
      const { data: callerOrg, error: orgError } = await caller.rpc('get_user_org_id');
      const { data: allowed, error: roleError } = await caller.rpc('has_role', { _user_id: auth.user.id, _role: 'admin' });
      if (orgError || roleError || !callerOrg || !allowed) return reply({ error: 'Company admin required' }, 403);
      orgId = callerOrg;
      if (!dryRun && (!body.manual || !body.schedule_id)) return reply({ error: 'Choose one renewal for a manual reminder' }, 400);
    } else if (body.manual) return reply({ error: 'Manual reminders require a signed-in admin' }, 403);
    if (body.manual && !body.schedule_id) return reply({ error: 'Choose one renewal' }, 400);
    const todayIso = new Date().toISOString().slice(0, 10);
    let query = admin.from('site_service_schedules').select('id,org_id,site_id,customer_id,template_id,work_type,next_due_date,reminder_lead_sent_at,reminder_due_sent_at').eq('active', true).order('id');
    if (orgId) query = query.eq('org_id', orgId);
    if (body.schedule_id) query = query.eq('id', body.schedule_id);
    const rows: any[] = [];
    for (let start = 0; ; start += 1000) {
      const page = await query.range(start, start + 999);
      if (page.error) throw new Error(`Could not load renewal schedules: ${page.error.message}`);
      rows.push(...(page.data || []));
      if ((page.data || []).length < 1000) break;
    }
    if (body.schedule_id && !rows.length) return reply({ error: 'Renewal not found in your company' }, 404);
    const results: any[] = [];
    for (const r of rows) {
      let logId: string | undefined;
      try {
        const org = await admin.from('organisations').select('name,renewal_reminders_enabled,renewal_reminder_template,renewal_reminder_from_name').eq('id', r.org_id).single();
        if (org.error) throw new Error(`Company settings: ${org.error.message}`);
        if (!body.manual && !org.data.renewal_reminders_enabled) { results.push({ id: r.id, skipped: 'Company automation is off' }); continue; }
        const customer = await admin.from('customers').select('id,name,email,renewal_reminders_opt_out').eq('id', r.customer_id).eq('org_id', r.org_id).maybeSingle();
        if (customer.error) throw new Error(`Customer lookup: ${customer.error.message}`);
        if (!customer.data) throw new Error('Renewal customer is not in this company');
        if (!customer.data.email || customer.data.renewal_reminders_opt_out) { results.push({ id: r.id, skipped: 'No email or opted out' }); continue; }
        const site = r.site_id ? await admin.from('sites').select('name,address').eq('id', r.site_id).eq('org_id', r.org_id).maybeSingle() : { data: null, error: null };
        if (site.error || (r.site_id && !site.data)) throw new Error('Renewal site is not available in this company');
        const template = r.template_id ? await admin.from('job_sheet_templates').select('name').eq('id', r.template_id).eq('org_id', r.org_id).maybeSingle() : { data: null, error: null };
        const intervalQuery = admin.from('service_intervals').select('reminder_lead_weeks,send_due_date_reminder').eq('org_id', r.org_id);
        const interval = r.template_id ? await intervalQuery.eq('template_id', r.template_id).maybeSingle() : await intervalQuery.eq('work_type', r.work_type || '').maybeSingle();
        if (interval.error) throw new Error(`Service interval lookup: ${interval.error.message}`);
        const kind = reminderKind(r, interval.data || undefined, body.manual, org.data.renewal_reminders_enabled, todayIso);
        if (!kind) { results.push({ id: r.id, skipped: 'Not in reminder window' }); continue; }
        const branding = await getEmailBranding(r.org_id, admin);
        const service = template.data?.name || r.work_type || 'Service';
        const fromName = org.data.renewal_reminder_from_name || branding.from_name || org.data.name;
        const vars: Record<string, string> = { customer_name: customer.data.name || 'there', site_name: site.data?.name || site.data?.address || 'your site', due_date: r.next_due_date, services_list: `- ${service} (due ${r.next_due_date})`, from_name: fromName };
        const rendered = (org.data.renewal_reminder_template || DEFAULT_TEMPLATE).replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => vars[k] || '');
        const subject = `${kind === 'due' ? 'Due' : 'Reminder'}: ${service} at ${vars.site_name}`;
        if (!dryRun) {
          const log = await admin.from('renewal_reminder_log').insert({ org_id: r.org_id, schedule_id: r.id, site_id: r.site_id, customer_id: r.customer_id, reminder_kind: kind, recipient_email: customer.data.email, subject, body_snippet: rendered.slice(0, 200), status: 'queued' }).select('id').single();
          if (log.error) throw new Error(`Could not record reminder: ${log.error.message}`);
          logId = log.data.id;
        }
        const sent = await dispatchReminder(dryRun, () => admin.functions.invoke('send-transactional-email', { body: { templateName: 'renewal-reminder', schedule_id: r.id, recipientEmail: customer.data.email, idempotencyKey: `renewal-${r.id}-${kind}-${todayIso}`, templateData: { subject, body: rendered, from_name: fromName } } }));
        if (!dryRun) {
          if (kind !== 'manual') {
            const patch = kind === 'lead' ? { reminder_lead_sent_at: new Date().toISOString() } : { reminder_due_sent_at: new Date().toISOString() };
            const updated = await admin.from('site_service_schedules').update(patch).eq('id', r.id).eq('org_id', r.org_id);
            if (updated.error) throw new Error(`Email queued, but reminder date could not be recorded: ${updated.error.message}`);
          }
          await health(r.org_id, 'queued', null);
        }
        results.push({ id: r.id, kind, ok: true, ...sent, company_name: branding.company_name, recipient: customer.data.email });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Renewal reminder failed:', { org_id: r.org_id, schedule_id: r.id, error: message });
        if (!dryRun) {
          if (logId) await admin.from('renewal_reminder_log').update({ status: 'failed', error_message: message }).eq('id', logId).eq('org_id', r.org_id);
          else await admin.from('renewal_reminder_log').insert({ org_id: r.org_id, schedule_id: r.id, site_id: r.site_id, customer_id: r.customer_id, reminder_kind: body.manual ? 'manual' : 'lead', recipient_email: '', status: 'failed', error_message: message });
          await health(r.org_id, 'failed', message);
        }
        results.push({ id: r.id, ok: false, error: message });
      }
    }
    const failed = results.find(r => r.ok === false);
    const skipped = body.manual ? results.find(r => r.skipped) : null;
    if (failed || skipped) return reply({ error: failed?.error || skipped?.skipped, dry_run: dryRun, results }, 422);
    return reply({ success: true, dry_run: dryRun, queued: !dryRun && results.some(r => r.queued), processed: results.length, results, recipient: results[0]?.recipient });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Renewal reminder run failed:', message);
    if (orgId && !dryRun) await health(orgId, 'failed', message);
    return reply({ error: message }, 500);
  }
});
