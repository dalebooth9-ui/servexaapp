// Send renewal reminder emails (lead + due) via Lovable Emails queue.
// Can be invoked by cron (no body) or manually with { schedule_id, manual: true }.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_TEMPLATE = `Hi {{customer_name}},

This is a reminder that the following service(s) at {{site_name}} are due on {{due_date}}:

{{services_list}}

Reply to this email to book in or let us know if you'd prefer a different date.

Kind regards,
{{from_name}}`;

function render(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* cron */ }
  const manualScheduleId: string | undefined = body?.schedule_id;
  const manual = !!body?.manual;

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  // Fetch candidates
  let query = admin.from("site_service_schedules").select(`
    id, org_id, site_id, customer_id, template_id, work_type,
    next_due_date, reminder_lead_sent_at, reminder_due_sent_at,
    site:sites(id, name, address),
    customer:customers(id, name, email, renewal_reminders_opt_out),
    template:job_sheet_templates(id, name),
    interval:service_intervals!inner(reminder_lead_weeks, send_due_date_reminder)
  `).eq("active", true);

  if (manualScheduleId) query = query.eq("id", manualScheduleId);

  const { data: rows, error } = await query.limit(500);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const results: any[] = [];

  for (const r of (rows || []) as any[]) {
    const cust = r.customer;
    if (!cust?.email || cust.renewal_reminders_opt_out) {
      results.push({ id: r.id, skipped: "no email or opted out" });
      continue;
    }
    const due = new Date(r.next_due_date);
    const daysUntil = Math.round((due.getTime() - today.getTime()) / 86400000);
    const leadWeeks = r.interval?.[0]?.reminder_lead_weeks ?? 4;
    const leadDays = leadWeeks * 7;

    let kind: "lead" | "due" | "manual" | null = null;
    if (manual) kind = "manual";
    else if (daysUntil <= 0 && !r.reminder_due_sent_at) kind = "due";
    else if (daysUntil > 0 && daysUntil <= leadDays && !r.reminder_lead_sent_at) kind = "lead";

    if (!kind) { results.push({ id: r.id, skipped: "not in window" }); continue; }

    // Check org enabled (unless manual)
    if (!manual) {
      const { data: org } = await admin.from("organisations").select("renewal_reminders_enabled, renewal_reminder_template, renewal_reminder_from_name, name").eq("id", r.org_id).maybeSingle();
      if (!org?.renewal_reminders_enabled) { results.push({ id: r.id, skipped: "org disabled" }); continue; }
    }

    const { data: org } = await admin.from("organisations")
      .select("renewal_reminder_template, renewal_reminder_from_name, name")
      .eq("id", r.org_id).maybeSingle();
    const tpl = org?.renewal_reminder_template || DEFAULT_TEMPLATE;
    const fromName = org?.renewal_reminder_from_name || org?.name || "Servexa";
    const serviceLabel = r.template?.name || r.work_type || "Service";
    const rendered = render(tpl, {
      customer_name: cust.name || "there",
      site_name: r.site?.name || r.site?.address || "your site",
      due_date: r.next_due_date,
      services_list: `- ${serviceLabel} (due ${r.next_due_date})`,
      from_name: fromName,
    });
    const subject = `${kind === "due" ? "Due" : "Reminder"}: ${serviceLabel} at ${r.site?.name || "your site"}`;

    // Log first
    const { data: log } = await admin.from("renewal_reminder_log").insert({
      org_id: r.org_id, schedule_id: r.id, site_id: r.site_id, customer_id: r.customer_id,
      reminder_kind: kind, recipient_email: cust.email, subject,
      body_snippet: rendered.slice(0, 200), status: "queued",
    }).select("id").single();

    // Enqueue email via existing infra (best-effort)
    let sendOk = false;
    try {
      const { error: sendErr } = await admin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "renewal-reminder",
          recipientEmail: cust.email,
          idempotencyKey: `renewal-${r.id}-${kind}-${todayIso}`,
          templateData: { subject, body: rendered, from_name: fromName },
        },
      });
      sendOk = !sendErr;
    } catch (_) { sendOk = false; }

    // Update schedule + log
    const patch: any = {};
    if (kind === "lead") patch.reminder_lead_sent_at = new Date().toISOString();
    if (kind === "due") patch.reminder_due_sent_at = new Date().toISOString();
    if (Object.keys(patch).length) await admin.from("site_service_schedules").update(patch).eq("id", r.id);
    if (log?.id) await admin.from("renewal_reminder_log").update({
      status: sendOk ? "sent" : "failed", sent_at: new Date().toISOString(),
    }).eq("id", log.id);

    results.push({ id: r.id, kind, recipient: cust.email, ok: sendOk });
  }

  return new Response(JSON.stringify({ processed: results.length, results, recipient: results[0]?.recipient }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
