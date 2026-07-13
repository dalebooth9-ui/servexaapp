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

  // Authenticate the caller
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const callerToken = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(callerToken);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { job_id, notification_type } = await req.json();
    if (!job_id || !notification_type) throw new Error("job_id and notification_type required");

    // Fetch job details with customer info
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, name, reference_number, customer, address, status, org_id")
      .eq("id", job_id)
      .single();
    if (jobErr || !job) throw new Error("Job not found");

    // Find customer email from customers table
    let customerEmail: string | null = null;
    if (job.customer) {
      const { data: cust } = await supabase
        .from("customers")
        .select("email")
        .eq("name", job.customer)
        .maybeSingle();
      customerEmail = cust?.email || null;
    }

    if (!customerEmail) {
      return new Response(JSON.stringify({ sent: false, reason: "No customer email found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build email content based on notification type
    const templates: Record<string, { subject: string; body: string; preview: string }> = {
      job_booked: {
        subject: `Job booked — ${job.reference_number}`,
        preview: `We've booked in ${job.name}`,
        body: `<p>Hi,</p>
          <p>We've booked in a new job for you: <strong>${job.reference_number}</strong> — ${job.name}.</p>
          ${job.address ? `<p><strong>Location:</strong> ${job.address}</p>` : ""}
          <p>We'll keep you updated as it progresses. If you need to reach us about it, just reply to this email.</p>
          <p>Kind regards,<br/>Viva Fire Protection</p>`,
      },
      engineer_dispatched: {
        subject: `Engineer dispatched — ${job.reference_number}`,
        preview: `An engineer is on the way for ${job.reference_number}`,
        body: `<p>Hi,</p>
          <p>An engineer has been dispatched for job <strong>${job.reference_number}</strong> — ${job.name}.</p>
          ${job.address ? `<p><strong>Location:</strong> ${job.address}</p>` : ""}
          <p>We'll notify you once the work is completed.</p>
          <p>Kind regards,<br/>Viva Fire Protection</p>`,
      },
      job_completed: {
        subject: `Job completed — ${job.reference_number}`,
        preview: `${job.reference_number} has been completed`,
        body: `<p>Hi,</p>
          <p>We're pleased to confirm that job <strong>${job.reference_number}</strong> — ${job.name} has been completed.</p>
          ${job.address ? `<p><strong>Location:</strong> ${job.address}</p>` : ""}
          <p>Any questions, just reply to this email or give us a call.</p>
          <p>Kind regards,<br/>Viva Fire Protection</p>`,
      },
      certificate_issued: {
        subject: `Certificate issued — ${job.reference_number}`,
        preview: `Your compliance certificate is ready`,
        body: `<p>Hi,</p>
          <p>A compliance certificate has been issued for job <strong>${job.reference_number}</strong> — ${job.name}.</p>
          <p>Please contact us if you require a copy of the documentation.</p>
          <p>Kind regards,<br/>Viva Fire Protection</p>`,
      },
    };

    const template = templates[notification_type];
    if (!template) throw new Error(`Unknown notification type: ${notification_type}`);

    const branding = await getEmailBranding((job as any).org_id, supabase);
    const identity = getSendIdentity(branding);
    const html = wrapCustomerEmail(branding, {
      previewText: template.preview,
      bodyHtml: template.body,
    });

    const sendResult = await sendViaResend({
      from: identity.from,
      reply_to: identity.reply_to,
      to: [customerEmail],
      subject: template.subject,
      html,
    });

    if (!sendResult.ok) {
      return new Response(
        JSON.stringify({
          sent: false,
          reason: "Email delivery failed",
          detail: sendResult.body,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabase.from("customer_notification_log").insert({
      job_id,
      customer_email: customerEmail,
      notification_type,
      subject: template.subject,
    });

    return new Response(JSON.stringify({ sent: true, to: customerEmail }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("notify-customer error:", error);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
