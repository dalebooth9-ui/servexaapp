// Invite a customer portal user: creates auth user (or looks up existing), assigns
// 'customer_user' role, links to customer_portal_users, and emails a magic sign-in link.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendViaResend } from "../_shared/customerEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_URL = "https://servexaapp.com";
const FROM = "Servexa <notify@servexaapp.com>";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { customer_id, email } = await req.json();
    if (!customer_id || !email) return json({ error: "customer_id and email required" }, 400);

    // Look up customer + org & verify caller is admin of that org
    const { data: cust, error: cErr } = await admin
      .from("customers").select("id, name, org_id").eq("id", customer_id).maybeSingle();
    if (cErr || !cust) return json({ error: "Customer not found" }, 404);

    const { data: isOrgAdmin } = await admin.rpc("has_role_in_org", {
      _user_id: caller.id, _org_id: cust.org_id, _role: "admin",
    });
    if (!isOrgAdmin) return json({ error: "Admin access required for this organisation" }, 403);

    // Ensure portal is enabled on this org
    const { data: org } = await admin.from("organisations").select("portal_enabled, name").eq("id", cust.org_id).maybeSingle();
    if (!org?.portal_enabled) return json({ error: "Customer portal is disabled for this organisation" }, 400);

    // Find or create the auth user
    let userId: string | null = null;
    const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const match = existing?.users?.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (match) {
      userId = match.id;
    } else {
      const tempPassword = crypto.randomUUID();
      const { data: created, error: cuErr } = await admin.auth.admin.createUser({
        email, password: tempPassword, email_confirm: true,
        user_metadata: { customer_portal: true, customer_id, org_id: cust.org_id },
      });
      if (cuErr) return json({ error: cuErr.message }, 400);
      userId = created.user.id;
    }

    // Ensure the customer_user role exists
    await admin.from("user_roles").upsert(
      { user_id: userId, role: "customer_user" as any },
      { onConflict: "user_id,role" }
    );

    // Link the customer_portal_users row
    await admin.from("customer_portal_users").upsert(
      {
        user_id: userId, org_id: cust.org_id, customer_id: cust.id,
        email, invited_by: caller.id, is_active: true,
      },
      { onConflict: "user_id" }
    );

    // Generate a magic-link so the recipient can sign in without a password
    const { data: link, error: lErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${APP_URL}/customer-portal` },
    });
    if (lErr) return json({ error: lErr.message }, 400);

    const signInUrl = (link as any)?.properties?.action_link || `${APP_URL}/customer-portal`;

    await sendViaResend({
      from: FROM,
      to: email,
      subject: `You've been invited to the ${org.name || "customer"} portal`,
      html: `
        <p>Hi,</p>
        <p>${escapeHtml(org.name || "Your provider")} has invited you to view your compliance records, reports and open quotes online.</p>
        <p><a href="${signInUrl}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#fff;border-radius:6px;text-decoration:none">Open your portal</a></p>
        <p>This link signs you in automatically. If you weren't expecting this, you can ignore it.</p>
      `,
    }).catch(() => null);

    return json({ ok: true, user_id: userId });
  } catch (e: any) {
    return json({ error: e?.message || "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
