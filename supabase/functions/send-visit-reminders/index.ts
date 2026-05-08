import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // Find visits scheduled for tomorrow with status upcoming
    const { data: visits, error } = await supabase
      .from("job_visits")
      .select(`
        id, scheduled_date, scheduled_time,
        jobs(id, name, reference_number, address, customer_id,
          customers(name, email, phone))
      `)
      .eq("scheduled_date", tomorrowStr)
      .eq("status", "upcoming");

    if (error) throw error;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    let sent = 0;

    for (const visit of visits || []) {
      const job = (visit as any).jobs;
      const customer = job?.customers;
      if (!customer?.email) continue;

      const visitDate = new Date(visit.scheduled_date).toLocaleDateString("en-GB", {
        weekday: "long", day: "numeric", month: "long", year: "numeric"
      });
      const visitTime = visit.scheduled_time
        ? ` at ${visit.scheduled_time.slice(0, 5)}`
        : "";

      // Send email via Resend
      if (RESEND_API_KEY) {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "Servexa <noreply@notify.vivafire.co.uk>",
            to: customer.email,
            subject: `Reminder: Service visit tomorrow for ${job.name}`,
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
                <h2 style="color:#1a1a2e">Upcoming Service Visit Reminder</h2>
                <p>Dear ${customer.name},</p>
                <p>This is a friendly reminder that a service visit has been scheduled for tomorrow:</p>
                <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:16px 0">
                  <p><strong>Job:</strong> ${job.name} (${job.reference_number})</p>
                  <p><strong>Date:</strong> ${visitDate}${visitTime}</p>
                  ${job.address ? `<p><strong>Location:</strong> ${job.address}</p>` : ""}
                </div>
                <p>If you have any questions or need to reschedule, please contact us.</p>
                <p>Kind regards,<br/>The Service Team</p>
              </div>
            `,
          }),
        });

        if (emailRes.ok) {
          sent++;
          // Log it
          await supabase.from("customer_notification_log").insert({
            job_id: job.id,
            customer_email: customer.email,
            notification_type: "visit_reminder",
            subject: `Reminder: Service visit tomorrow for ${job.name}`,
          });
        }
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
