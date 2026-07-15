// Sends a branded preview/test email using the caller's current
// email_branding row. Used by the "Email branding" settings card so
// admins can check how automated customer emails render in Outlook.

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await callerClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* empty is fine */ }
    const to: string | undefined = body?.to;
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return new Response(JSON.stringify({ error: "A valid 'to' email address is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve the caller's org via organisation_members.
    let orgId: string | undefined;
    const { data: mem } = await admin
      .from("organisation_members")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    orgId = (mem as any)?.org_id;

    const branding = await getEmailBranding(orgId, admin);
    const identity = getSendIdentity(branding);

    const subject = "Preview — automated customer email branding";
    const html = wrapCustomerEmail(branding, {
      previewText: "This is what customers will see for automated emails.",
      bodyHtml: `
        <p>Hi,</p>
        <p>This is a <strong>preview</strong> of how automated customer emails will look in your customer's inbox.</p>
        <p>Typical automated emails include:</p>
        <ul style="margin:0 0 12px;padding-left:20px;">
          <li>Job booking confirmations</li>
          <li>Date-given / visit notifications</li>
          <li>Compliance reminders</li>
          <li>Report deliveries &amp; certificates</li>
          <li>Follow-up reminders (6&nbsp;month / 12&nbsp;month)</li>
        </ul>
        <p>All of them use the branding, sender identity and reply-to configured in Settings&nbsp;→&nbsp;Email.</p>
        
      `,
    });

    const result = await sendViaResend({
      from: identity.from,
      reply_to: identity.reply_to,
      to,
      subject,
      html,
    });

    if (!result.ok) {
      return new Response(
        JSON.stringify({ success: false, status: result.status, detail: result.body }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent_to: to,
        from: identity.from,
        reply_to: identity.reply_to,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("send-branded-preview error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
