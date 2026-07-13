import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getEmailBranding,
  getSendIdentity,
  wrapCustomerEmail,
  sendViaResend,
} from "../_shared/customerEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const { data: visits, error } = await supabase
      .from("job_visits")
      .select(`
        id, scheduled_date, scheduled_time,
        jobs(id, name, reference_number, address, org_id, customer_id,
          customers(name, email, phone))
      `)
      .eq("scheduled_date", tomorrowStr)
      .eq("status", "upcoming");

    if (error) throw error;

    let sent = 0;
    const brandingCache = new Map<string, Awaited<ReturnType<typeof getEmailBranding>>>();

    for (const visit of visits || []) {
      const job = (visit as any).jobs;
      const customer = job?.customers;
      if (!customer?.email) continue;

      const visitDate = new Date(visit.scheduled_date).toLocaleDateString("en-GB", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      });
      const visitTime = visit.scheduled_time ? ` at ${visit.scheduled_time.slice(0, 5)}` : "";

      const orgKey = job.org_id || "default";
      if (!brandingCache.has(orgKey)) {
        brandingCache.set(orgKey, await getEmailBranding(job.org_id, supabase));
      }
      const branding = brandingCache.get(orgKey)!;
      const identity = getSendIdentity(branding);

      const subject = `Reminder: service visit tomorrow — ${job.reference_number}`;
      const body = `
        <p>Dear ${customer.name || "Customer"},</p>
        <p>This is a friendly reminder that a service visit has been scheduled for <strong>tomorrow</strong>:</p>
        <div style="background:#f3f4f6;border-radius:8px;padding:14px 18px;margin:14px 0;">
          <p style="margin:0 0 4px;"><strong>Job:</strong> ${job.name} (${job.reference_number})</p>
          <p style="margin:0 0 4px;"><strong>Date:</strong> ${visitDate}${visitTime}</p>
          ${job.address ? `<p style="margin:0;"><strong>Location:</strong> ${job.address}</p>` : ""}
        </div>
        <p>If you have any questions or need to reschedule, just reply to this email.</p>
        <p>Kind regards,<br/>Viva Fire Protection</p>
      `;

      const result = await sendViaResend({
        from: identity.from,
        reply_to: identity.reply_to,
        to: customer.email,
        subject,
        html: wrapCustomerEmail(branding, { previewText: subject, bodyHtml: body }),
      });

      if (result.ok) {
        sent++;
        await supabase.from("customer_notification_log").insert({
          job_id: job.id,
          customer_email: customer.email,
          notification_type: "visit_reminder",
          subject,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, total: (visits || []).length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
