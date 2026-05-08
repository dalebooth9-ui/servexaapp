import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireEnv, missingEnvResponse } from "../_shared/requireEnv.ts";
import { getFromAddress } from "../_shared/emailFrom.ts";

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

    // Verify caller is an admin
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
    const userId = claimsData.claims.sub;

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin, error: roleErr } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate env (clear 503 if missing)
    const { LOVABLE_API_KEY } = requireEnv(["LOVABLE_API_KEY"] as const);
    // The linked Resend connector is exposed as RESEND_API_KEY_1 in this project.
    // Prefer it over the legacy/manual RESEND_API_KEY, which is not a gateway credential.
    const RESEND_API_KEY =
      Deno.env.get("RESEND_API_KEY_1") ?? Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "missing_configuration",
          missing: ["RESEND_API_KEY"],
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse body
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // empty body is allowed
    }
    const to: string | undefined = body?.to;
    const from: string = body?.from || "Servexa <noreply@notify.vivafire.co.uk>";
    const subject: string = body?.subject || "Servexa — Resend gateway test";

    if (!to || typeof to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return new Response(
        JSON.stringify({ error: "A valid 'to' email address is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sentAt = new Date().toISOString();
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color:#0f172a; margin:0 0 12px;">✅ Resend gateway test</h2>
        <p style="color:#334155; line-height:1.5;">
          This is an end-to-end test email sent from the
          <strong>test-resend-email</strong> edge function via the Lovable
          connector gateway → Resend.
        </p>
        <ul style="color:#475569; font-size: 14px; line-height: 1.6;">
          <li><strong>Triggered by user:</strong> ${userId}</li>
          <li><strong>Sent at:</strong> ${sentAt}</li>
          <li><strong>From:</strong> ${from}</li>
        </ul>
        <p style="color:#94a3b8; font-size:12px; margin-top: 24px;">
          If you received this, the Resend integration is wired up correctly.
        </p>
      </div>
    `;

    const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
    const resp = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
      }),
    });

    const text = await resp.text();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

    if (!resp.ok) {
      console.error("Resend gateway error", resp.status, parsed);
      return new Response(
        JSON.stringify({
          success: false,
          status: resp.status,
          error: "Resend gateway call failed",
          detail: parsed,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent_to: to,
        from,
        subject,
        sent_at: sentAt,
        provider_response: parsed,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    const cfg = missingEnvResponse(err, corsHeaders);
    if (cfg) return cfg;
    console.error("test-resend-email error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
