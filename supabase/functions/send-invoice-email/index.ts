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

    const { customerEmail, customerName, invoiceNumber, total, pdfBase64, invoiceId } = await req.json();

    if (!customerEmail || !invoiceNumber) {
      return new Response(JSON.stringify({ error: "customerEmail and invoiceNumber are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let orgId: string | undefined;
    if (invoiceId) {
      const { data: inv } = await supabaseAdmin
        .from("invoices").select("org_id").eq("id", invoiceId).maybeSingle();
      orgId = (inv as any)?.org_id;
    }
    const branding = await getEmailBranding(orgId, supabaseAdmin);
    const identity = getSendIdentity(branding);

    const subject = `Invoice ${invoiceNumber} — £${Number(total || 0).toFixed(2)}`;
    const body = `
      <p>Dear ${customerName || "Customer"},</p>
      <p>Please find attached your invoice <strong>${invoiceNumber}</strong> for <strong>£${Number(total || 0).toFixed(2)}</strong>.</p>
      <p>Any questions about this invoice, just reply to this email or give us a call.</p>
      <p>Kind regards,<br/>Viva Fire Protection</p>
    `;
    const html = wrapCustomerEmail(branding, { previewText: subject, bodyHtml: body });

    const result = await sendViaResend({
      from: identity.from,
      reply_to: identity.reply_to,
      to: [customerEmail],
      subject,
      html,
      attachments: pdfBase64 ? [{ filename: `${invoiceNumber}.pdf`, content: pdfBase64 }] : undefined,
    });

    if (!result.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to send email", detail: result.body }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-invoice-email error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
