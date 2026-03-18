import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INSTALL_URL = "https://field-aid-box.lovable.app/install";
const QR_IMAGE_URL = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(INSTALL_URL)}&bgcolor=ffffff&color=1e293b&margin=10`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
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

    const { to_email, engineer_name, engineer_user_id } = await req.json();

    if (!to_email) {
      return new Response(JSON.stringify({ error: "to_email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const greeting = engineer_name ? `Hi ${engineer_name},` : "Hi,";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Install Servexa</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#1e293b;padding:28px 32px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Servexa</p>
              <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Fire Safety Field Service</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:15px;color:#1e293b;">${greeting}</p>
              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                You've been added to the <strong>Servexa</strong> team. Install the app on your phone to receive job assignments, submit reports, and share your live location — all from your home screen.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${INSTALL_URL}" style="display:inline-block;background:#1e293b;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;">
                      Install the App →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- QR Code -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;">
                    <p style="margin:0 0 12px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Or scan with your phone</p>
                    <img src="${QR_IMAGE_URL}" width="160" height="160" alt="QR code to install Servexa" style="display:block;border-radius:6px;" />
                    <p style="margin:10px 0 0;font-size:11px;color:#94a3b8;">${INSTALL_URL}</p>
                  </td>
                </tr>
              </table>

              <!-- Instructions -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;">
                    <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#1e293b;">Installation steps</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:4px 0;">
                          <p style="margin:0;font-size:13px;color:#475569;">
                            📱 <strong>iPhone:</strong> Open the link in Safari → tap the Share icon → "Add to Home Screen"
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;">
                          <p style="margin:0;font-size:13px;color:#475569;">
                            🤖 <strong>Android:</strong> Open the link in Chrome → tap the ⋮ menu → "Install App"
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#94a3b8;">
                Once installed you'll find Servexa on your home screen like any native app — and it works offline too.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">Sent by Servexa · Fire Safety Field Service Management</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "noreply@vivafire.co.uk",
        to: [to_email],
        subject: "Install the FieldReport app on your phone",
        html,
      }),
    });

    const emailJson = await emailRes.json();

    if (!emailRes.ok) {
      // Fallback to onboarding sender if domain not yet verified
      const fallbackRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "onboarding@resend.dev",
          to: [to_email],
          subject: "Install the FieldReport app on your phone",
          html,
        }),
      });
      const fallback = await fallbackRes.json();
      if (!fallbackRes.ok) {
        throw new Error(fallback?.message || "Failed to send email");
      }
    }

    // Log the onboarding send
    if (engineer_user_id) {
      await supabaseAdmin.from("engineer_onboarding_logs").insert({
        engineer_user_id,
        sent_to_email: to_email,
        sent_by: caller.id,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
