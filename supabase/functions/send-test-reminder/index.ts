import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { requireEnv, missingEnvResponse } from "../_shared/requireEnv.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function applyTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    const blockRegex = new RegExp(`\\{\\{#${key}\\}\\}(.+?)\\{\\{/${key}\\}\\}`, "gs");
    result = result.replace(blockRegex, val ? "$1" : "");
  }
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, val);
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Unauthorized");

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();
    if (!roleData) throw new Error("Admin access required");

    const { to_email, email_subject, email_body } = await req.json();
    if (!to_email) throw new Error("to_email is required");

    const { RESEND_API_KEY } = requireEnv(["RESEND_API_KEY"] as const);
    const resend = new Resend(RESEND_API_KEY);

    // Sample placeholder values for the test
    const vars: Record<string, string> = {
      customer_name: "John Smith (Test)",
      service_type: "Visual Inspection",
      service_type_lower: "visual inspection",
      reference: "VFP-00000",
      scheduled_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-GB", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      }),
      address: "123 Example Street, London, E1 1AB",
    };

    const subject = applyTemplate(email_subject || "Upcoming {{service_type}} – {{reference}}", vars) + " [TEST]";
    const bodyText = applyTemplate(email_body || "", vars);
    const bodyHtml = bodyText.replace(/\n/g, "<br/>");

    const { error: emailErr } = await resend.emails.send({
      from: "Viva Fire & Protection <noreply@vivafire.co.uk>",
      to: [to_email],
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
            <p style="margin: 4px 0 0; color: #9ca3af; font-style: italic;">This is a test email – no action required.</p>
          </div>
        </div>
      `,
    });

    if (emailErr) throw new Error(`Resend error: ${JSON.stringify(emailErr)}`);

    return new Response(JSON.stringify({ success: true, sent_to: to_email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const cfg = missingEnvResponse(err, corsHeaders);
    if (cfg) return cfg;
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message?.includes("nauthorized") ? 401 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
