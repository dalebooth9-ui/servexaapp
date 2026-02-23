import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    const now = new Date();
    const oneMonthFromNow = new Date(now);
    oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

    const todayStr = now.toISOString().split("T")[0];
    const cutoffStr = oneMonthFromNow.toISOString().split("T")[0];

    // Get upcoming visits in the 1-month window, include customer info
    const { data: visits, error: visitErr } = await supabase
      .from("job_visits")
      .select("id, scheduled_date, job_id, jobs!inner(id, name, reference_number, status, customer_id, customer, address, customers(name, email))")
      .eq("status", "upcoming")
      .gte("scheduled_date", todayStr)
      .lte("scheduled_date", cutoffStr);

    if (visitErr) throw visitErr;

    // Filter to follow-up jobs only
    const followUpVisits = (visits || []).filter((v: any) => {
      const name = v.jobs?.name || "";
      return name.startsWith("6m Visual") || name.startsWith("12m Pressure Test");
    });

    if (followUpVisits.length === 0) {
      return new Response(JSON.stringify({ message: "No follow-up reminders due", count: 0, emails: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all admin user IDs
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const adminIds = (admins || []).map((a: any) => a.user_id);

    let created = 0;
    let emailsSent = 0;

    for (const visit of followUpVisits) {
      const job = visit.jobs;
      const jobId = job.id;

      if (job.status === "completed" || job.status === "archived") continue;

      // Check if we already notified today for this job
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("job_id", jobId)
        .gte("created_at", todayStr + "T00:00:00Z")
        .lte("created_at", todayStr + "T23:59:59Z")
        .limit(1);

      if (existing && existing.length > 0) continue;

      const daysUntil = Math.ceil(
        (new Date(visit.scheduled_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      const isVisual = job.name.startsWith("6m Visual");
      const typeLabel = isVisual ? "Visual Inspection" : "Pressure Test";

      // Create in-app notifications for admins
      if (adminIds.length > 0) {
        const notifications = adminIds.map((uid: string) => ({
          user_id: uid,
          title: `${typeLabel} Due Soon`,
          message: `${job.reference_number} – ${job.name} is scheduled in ${daysUntil} day${daysUntil === 1 ? "" : "s"} (${visit.scheduled_date}). Contact the customer to arrange access.`,
          job_id: jobId,
        }));
        const { error: insertErr } = await supabase.from("notifications").insert(notifications);
        if (!insertErr) created += notifications.length;
      }

      // Send email to customer if they have an email address
      const customerEmail = job.customers?.email;
      const customerName = job.customers?.name || job.customer || "Customer";
      const siteAddress = job.address || "";

      if (customerEmail) {
        const scheduledDateFormatted = new Date(visit.scheduled_date).toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        });

        try {
          const { error: emailErr } = await resend.emails.send({
            from: "Viva Fire & Protection <noreply@vivafire.co.uk>",
            to: [customerEmail],
            subject: `Upcoming ${typeLabel} – ${job.reference_number}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                <div style="background-color: #dc2626; padding: 20px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Viva Fire & Protection</h1>
                </div>
                <div style="padding: 30px 20px; background-color: #ffffff;">
                  <p>Dear ${customerName},</p>
                  <p>This is a courtesy reminder that a <strong>${typeLabel.toLowerCase()}</strong> service is due at your premises.</p>
                  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <tr>
                      <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: bold;">Service Type</td>
                      <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${typeLabel}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: bold;">Reference</td>
                      <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${job.reference_number}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: bold;">Scheduled Date</td>
                      <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${scheduledDateFormatted}</td>
                    </tr>
                    ${siteAddress ? `<tr>
                      <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: bold;">Location</td>
                      <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${siteAddress}</td>
                    </tr>` : ""}
                  </table>
                  <p>Please could you confirm access arrangements for our engineer to attend on or around this date. If this date is not suitable, please let us know and we can arrange an alternative.</p>
                  <p>If you have any questions, please don't hesitate to get in touch.</p>
                  <p>Kind regards,<br/><strong>Viva Fire & Protection</strong></p>
                </div>
                <div style="background-color: #f3f4f6; padding: 15px 20px; text-align: center; font-size: 12px; color: #6b7280;">
                  <p style="margin: 0;">Viva Fire & Protection Ltd</p>
                </div>
              </div>
            `,
          });

          if (!emailErr) {
            emailsSent++;
            // Log the customer notification
            await supabase.from("customer_notification_log").insert({
              customer_email: customerEmail,
              job_id: jobId,
              notification_type: "follow_up_reminder",
              subject: `Upcoming ${typeLabel} – ${job.reference_number}`,
            });
          } else {
            console.error(`Email failed for ${customerEmail}:`, emailErr);
          }
        } catch (emailCatchErr) {
          console.error(`Email send error for ${customerEmail}:`, emailCatchErr);
        }
      }
    }

    return new Response(JSON.stringify({ message: "Reminders processed", notifications: created, emails: emailsSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
