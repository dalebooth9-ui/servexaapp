import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

async function sendResendEmail(payload: {
  from: string;
  to: string[];
  subject: string;
  html: string;
}): Promise<{ error: any | null }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
    return { error: { message: "Missing LOVABLE_API_KEY or RESEND_API_KEY" } };
  }
  try {
    const res = await fetch(`${RESEND_GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      return { error: { message: `Resend ${res.status}: ${text}` } };
    }
    return { error: null };
  } catch (e: any) {
    return { error: { message: e?.message || String(e) } };
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function applyTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  // Handle conditional blocks {{#key}}...{{/key}}
  for (const [key, val] of Object.entries(vars)) {
    const blockRegex = new RegExp(`\\{\\{#${key}\\}\\}(.+?)\\{\\{/${key}\\}\\}`, "gs");
    result = result.replace(blockRegex, val ? "$1" : "");
  }
  // Replace simple placeholders
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, val);
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth guard — admin only
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify caller is admin
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: claimsData.claims.sub, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // resend client replaced by sendResendEmail() helper
    // Load reminder settings
    const { data: settingsRow } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "followup_reminder")
      .single();

    const settings = settingsRow?.value as { enabled?: boolean; email_subject?: string; email_body?: string } | null;
    const emailEnabled = settings?.enabled !== false;

    const now = new Date();
    const oneMonthFromNow = new Date(now);
    oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

    const todayStr = now.toISOString().split("T")[0];
    const cutoffStr = oneMonthFromNow.toISOString().split("T")[0];

    const { data: visits, error: visitErr } = await supabase
      .from("job_visits")
      .select("id, scheduled_date, job_id, jobs!inner(id, name, reference_number, status, customer_id, customer, address, customers(name, email))")
      .eq("status", "upcoming")
      .gte("scheduled_date", todayStr)
      .lte("scheduled_date", cutoffStr);

    if (visitErr) throw visitErr;

    const followUpVisits = (visits || []).filter((v: any) => {
      const name = v.jobs?.name || "";
      return name.startsWith("6m Visual") || name.startsWith("12m Pressure Test");
    });

    if (followUpVisits.length === 0) {
      return new Response(JSON.stringify({ message: "No follow-up reminders due", notifications: 0, emails: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = (admins || []).map((a: any) => a.user_id);

    let created = 0;
    let emailsSent = 0;

    for (const visit of followUpVisits) {
      const job = visit.jobs as any;
      const jobId = job.id;

      if (job.status === "completed" || job.status === "archived") continue;

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

      // In-app notifications for admins
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

      // Send customer email only if enabled in settings
      if (!emailEnabled) continue;

      const customerEmail = job.customers?.email;
      const customerName = job.customers?.name || job.customer || "Customer";
      const siteAddress = job.address || "";

      if (!customerEmail) continue;

      const scheduledDateFormatted = new Date(visit.scheduled_date).toLocaleDateString("en-GB", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      });

      const vars: Record<string, string> = {
        customer_name: customerName,
        service_type: typeLabel,
        service_type_lower: typeLabel.toLowerCase(),
        reference: job.reference_number,
        scheduled_date: scheduledDateFormatted,
        address: siteAddress,
      };

      const subjectTemplate = settings?.email_subject || "Upcoming {{service_type}} – {{reference}}";
      const bodyTemplate = settings?.email_body || "";

      const subject = applyTemplate(subjectTemplate, vars);
      const bodyText = applyTemplate(bodyTemplate, vars);
      const bodyHtml = bodyText.replace(/\n/g, "<br/>");

      try {
        const { error: emailErr } = await sendResendEmail({
          from: "Viva Fire & Protection <noreply@vivafire.co.uk>",
          to: [customerEmail],
          subject,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
              <div style="background-color: #dc2626; padding: 20px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Viva Fire & Protection</h1>
              </div>
              <div style="padding: 30px 20px; background-color: #ffffff;">
                ${bodyHtml}
              </div>
              <div style="background-color: #f3f4f6; padding: 15px 20px; text-align: center; font-size: 12px; color: #6b7280;">
                <p style="margin: 0;">Viva Fire & Protection Ltd</p>
              </div>
            </div>
          `,
        });

        if (!emailErr) {
          emailsSent++;
          await supabase.from("customer_notification_log").insert({
            customer_email: customerEmail,
            job_id: jobId,
            notification_type: "follow_up_reminder",
            subject,
          });
        } else {
          console.error(`Email failed for ${customerEmail}:`, emailErr);
        }
      } catch (emailCatchErr) {
        console.error(`Email send error for ${customerEmail}:`, emailCatchErr);
      }
    }

    return new Response(JSON.stringify({ message: "Reminders processed", notifications: created, emails: emailsSent, emailEnabled }), {
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
