import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getFromAddress } from "../_shared/emailFrom.ts";

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
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
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

    const { email, full_name, phone, whatsapp_number, send_reset_email } = await req.json();

    if (!email || !full_name) {
      return new Response(
        JSON.stringify({ error: "Email and full name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create user via admin API with a random password
    const tempPassword = crypto.randomUUID();
    const { data: newUser, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name },
      });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = newUser.user.id;

    // Update profile with phone/whatsapp
    if (phone || whatsapp_number) {
      await supabaseAdmin
        .from("profiles")
        .update({
          phone: phone || null,
          whatsapp_number: whatsapp_number || null,
        })
        .eq("user_id", userId);
    }

    // Assign engineer role
    await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: "engineer",
    });

    // Send password reset email if requested
    let emailSent = false;
    if (send_reset_email) {
      try {
        const { data: linkData, error: linkError } =
          await supabaseAdmin.auth.admin.generateLink({
            type: "recovery",
            email,
          });

        if (linkError) {
          console.error("Failed to generate recovery link:", linkError.message);
        } else {
          const appUrl = Deno.env.get("APP_URL") || supabaseUrl;
          const actionLink = linkData?.properties?.action_link || "";
          const { error: emailError } = await sendResendEmail({
            from: await getFromAddress("onboarding"),
            to: [email],
            subject: "Set up your VivaFire account password",
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <h1 style="color: #333; font-size: 24px;">Welcome to VivaFire, ${full_name}!</h1>
                  <p style="color: #555; font-size: 16px; line-height: 1.5;">
                    An account has been created for you. Please click the button below to set your password and get started.
                  </p>
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${actionLink}" 
                       style="background-color: #E53E3E; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold; display: inline-block;">
                      Set Your Password
                    </a>
                  </div>
                  <p style="color: #999; font-size: 14px; line-height: 1.5;">
                    If you didn't expect this email, you can safely ignore it.
                  </p>
                </div>
              `,
          });

          if (emailError) {
            console.error("Failed to send reset email:", emailError);
          } else {
            emailSent = true;
          }
        }
      } catch (emailErr) {
        console.error("Error sending reset email:", emailErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, user_id: userId, email_sent: emailSent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
