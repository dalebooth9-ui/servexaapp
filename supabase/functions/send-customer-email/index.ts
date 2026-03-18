import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Verify caller is admin
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

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!RESEND_API_KEY) {
      console.log(`Email would be sent to: ${customerEmail}, subject: ${subject}`);
      return new Response(JSON.stringify({
        success: true,
        note: "Email service not configured. Please add RESEND_API_KEY to enable email sending.",
        logged: true,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If sending an invoice, fetch and generate invoice PDF
    const resendAttachments: any[] = [];

    // Add any provided attachments (e.g., customer report PDF)
    if (attachments && Array.isArray(attachments)) {
      for (const att of attachments) {
        resendAttachments.push({
          filename: att.filename,
          content: att.content,
        });
      }
    }

    // If invoice type, fetch invoice data and generate simple PDF content
    if (emailType === "invoice" && invoiceId) {
      const { data: invoice } = await supabaseAdmin
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();

      if (invoice) {
        const { data: lineItems } = await supabaseAdmin
          .from("invoice_line_items")
          .select("*")
          .eq("invoice_id", invoiceId)
          .order("sort_order", { ascending: true });

        // Mark invoice as sent
        await supabaseAdmin
          .from("invoices")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", invoiceId);
      }
    }

    // Send via Resend
    const styledHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1e40af; color: white; padding: 16px 20px; border-radius: 6px 6px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">Servexa</h2>
          <p style="margin: 4px 0 0; font-size: 12px; opacity: 0.8;">Fire Safety & Compliance Solutions</p>
        </div>
        <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 6px 6px;">
          <p>Dear ${customerName || "Customer"},</p>
          <div>${htmlBody}</div>
        </div>
        <div style="padding: 12px 20px; font-size: 11px; color: #6b7280; text-align: center;">
          Sent via Servexa
        </div>
      </div>
    `;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "FieldReport <noreply@vivafire.co.uk>",
        to: [customerEmail],
        subject,
        html: styledHtml,
        attachments: resendAttachments.length > 0 ? resendAttachments : undefined,
      }),
    });

    if (!emailResponse.ok) {
      const errData = await emailResponse.text();
      console.error("Resend error:", errData);
      return new Response(JSON.stringify({ error: "Failed to send email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log notification
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
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
