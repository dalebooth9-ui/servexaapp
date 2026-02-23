import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { job_id, notification_type } = await req.json();
    if (!job_id || !notification_type) throw new Error("job_id and notification_type required");

    // Fetch job details with customer info
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, name, reference_number, customer, address, status")
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
        .single();
      customerEmail = cust?.email || null;
    }

    if (!customerEmail) {
      return new Response(JSON.stringify({ sent: false, reason: "No customer email found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build email content based on notification type
    const templates: Record<string, { subject: string; body: string }> = {
      job_booked: {
        subject: `Job booked — ${job.reference_number}`,
        body: `<h2>Job Booked</h2>
          <p>A new job has been created for you: <strong>${job.reference_number}</strong> — ${job.name}.</p>
          ${job.address ? `<p><strong>Location:</strong> ${job.address}</p>` : ""}
          <p>We will keep you updated on progress.</p>
          <p>Thank you,<br/>FieldReport</p>`,
      },
      engineer_dispatched: {
        subject: `Engineer dispatched — ${job.reference_number}`,
        body: `<h2>Engineer Dispatched</h2>
          <p>An engineer has been dispatched for job <strong>${job.reference_number}</strong> — ${job.name}.</p>
          ${job.address ? `<p><strong>Location:</strong> ${job.address}</p>` : ""}
          <p>We'll notify you once the work is completed.</p>
          <p>Thank you,<br/>FieldReport</p>`,
      },
      job_completed: {
        subject: `Job completed — ${job.reference_number}`,
        body: `<h2>Job Completed</h2>
          <p>We're pleased to confirm that job <strong>${job.reference_number}</strong> — ${job.name} has been completed.</p>
          ${job.address ? `<p><strong>Location:</strong> ${job.address}</p>` : ""}
          <p>If you have any questions or require follow-up, please don't hesitate to contact us.</p>
          <p>Thank you,<br/>FieldReport</p>`,
      },
      certificate_issued: {
        subject: `Certificate issued — ${job.reference_number}`,
        body: `<h2>Certificate Issued</h2>
          <p>A compliance certificate has been issued for job <strong>${job.reference_number}</strong> — ${job.name}.</p>
          <p>Please contact us if you require a copy of the documentation.</p>
          <p>Thank you,<br/>FieldReport</p>`,
      },
    };

    const template = templates[notification_type];
    if (!template) throw new Error(`Unknown notification type: ${notification_type}`);

    // Send email via Resend
    const emailResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "FieldReport <onboarding@resend.dev>",
        to: [customerEmail],
        subject: template.subject,
        html: template.body,
      }),
    });

    if (!emailResp.ok) {
      const errText = await emailResp.text();
      throw new Error(`Resend error: ${errText}`);
    }

    // Log the notification
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
