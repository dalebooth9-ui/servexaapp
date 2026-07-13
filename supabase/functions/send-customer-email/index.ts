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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { customerEmail, customerName, subject, htmlBody, attachments, jobId, emailType, invoiceId } = await req.json();

    if (!customerEmail || !subject) {
      return new Response(JSON.stringify({ error: "customerEmail and subject are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve org_id from job when possible so the correct branding is used.
    let orgId: string | undefined;
    if (jobId) {
      const { data: job } = await supabaseAdmin
        .from("jobs").select("org_id").eq("id", jobId).maybeSingle();
      orgId = (job as any)?.org_id;
    }
    const branding = await getEmailBranding(orgId, supabaseAdmin);
    const identity = getSendIdentity(branding);

    // Mark invoice as sent if applicable
    if (emailType === "invoice" && invoiceId) {
      await supabaseAdmin
        .from("invoices")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", invoiceId);
    }

    const greeting = customerName ? `<p>Dear ${customerName},</p>` : `<p>Hi,</p>`;
    const html = wrapCustomerEmail(branding, {
      previewText: subject,
      bodyHtml: `${greeting}${htmlBody || ""}`,
    });

    const resendAttachments = Array.isArray(attachments)
      ? attachments.map((att: any) => ({ filename: att.filename, content: att.content }))
      : [];

    const sendResult = await sendViaResend({
      from: identity.from,
      reply_to: identity.reply_to,
      to: [customerEmail],
      subject,
      html,
      attachments: resendAttachments.length ? resendAttachments : undefined,
    });

    if (!sendResult.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to send email", detail: sendResult.body }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (jobId) {
      await supabaseAdmin.from("customer_notification_log").insert({
        customer_email: customerEmail,
        job_id: jobId,
        notification_type: emailType || "custom",
        subject,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-customer-email error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
