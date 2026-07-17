import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: caller.id, _role: "admin",
    });
    if (!isAdmin) return json({ error: "Admin access required" }, 403);

    const body = await req.json().catch(() => ({}));
    const { user_id, full_name, email, whatsapp_number, mode } = body as {
      user_id?: string; full_name?: string; email?: string; whatsapp_number?: string | null;
      mode?: "read" | "write" | "list_emails";
    };

    // List mode: return { user_id -> email } for everyone in the caller's org(s).
    if (mode === "list_emails") {
      const { data: callerMem } = await supabaseAdmin
        .from("organisation_members").select("org_id")
        .eq("user_id", caller.id).eq("status", "active");
      const orgIds = (callerMem ?? []).map((r: any) => r.org_id);
      if (orgIds.length === 0) return json({ emails: {} });
      const { data: mates } = await supabaseAdmin
        .from("organisation_members").select("user_id")
        .in("org_id", orgIds).eq("status", "active");
      const wanted = new Set((mates ?? []).map((r: any) => r.user_id));
      const emails: Record<string, string> = {};
      // Paginate auth.admin.listUsers
      let page = 1;
      while (true) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) break;
        for (const u of data?.users ?? []) {
          if (wanted.has(u.id) && u.email) emails[u.id] = u.email;
        }
        if (!data?.users || data.users.length < 200) break;
        page += 1;
        if (page > 20) break; // safety
      }
      return json({ emails });
    }

    if (!user_id) return json({ error: "user_id is required" }, 400);

    // Org gate: caller and target must share an active organisation
    const [callerMemRes, targetMemRes] = await Promise.all([
      supabaseAdmin.from("organisation_members").select("org_id").eq("user_id", caller.id).eq("status", "active"),
      supabaseAdmin.from("organisation_members").select("org_id").eq("user_id", user_id).eq("status", "active"),
    ]);
    const callerOrgs = new Set((callerMemRes.data ?? []).map((r: any) => r.org_id));
    const targetOrgs = (targetMemRes.data ?? []).map((r: any) => r.org_id);
    const sharedOrg = targetOrgs.find((o) => callerOrgs.has(o));
    if (!sharedOrg) return json({ error: "You can only edit users in your organisation" }, 403);

    // Fetch current auth user for old-email
    const { data: existing, error: fetchErr } = await supabaseAdmin.auth.admin.getUserById(user_id);
    if (fetchErr || !existing?.user) return json({ error: fetchErr?.message ?? "User not found" }, 404);
    const oldEmail = existing.user.email ?? null;

    if (mode === "read") {
      const { data: prof } = await supabaseAdmin.from("profiles")
        .select("full_name, whatsapp_number").eq("user_id", user_id).maybeSingle();
      return json({
        user_id,
        email: oldEmail,
        full_name: prof?.full_name ?? existing.user.user_metadata?.full_name ?? "",
        whatsapp_number: prof?.whatsapp_number ?? "",
      });
    }

    const changes: string[] = [];

    // Email change via admin API — confirms immediately so user can log in with new address.
    let newEmail: string | undefined;
    if (typeof email === "string" && email.trim() && email.trim().toLowerCase() !== (oldEmail ?? "").toLowerCase()) {
      newEmail = email.trim();
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        email: newEmail,
        email_confirm: true,
        user_metadata: { ...(existing.user.user_metadata ?? {}), ...(full_name ? { full_name } : {}) },
      });
      if (updErr) {
        const msg = (updErr.message || "").toLowerCase();
        const friendly = msg.includes("already") || msg.includes("registered") || msg.includes("exists") || msg.includes("duplicate")
          ? "That email is already in use by another account."
          : `Failed to update email: ${updErr.message}`;
        return json({ error: friendly }, 400);
      }
      // GoTrue's admin updateUserById with `email` + `email_confirm: true` rewrites
      // the primary email AND syncs auth.identities.identity_data.email for the
      // 'email' provider identity in one step, so the user can log in with the
      // new address immediately with no dangling confirmation state.

      changes.push(`email:${oldEmail ?? ""}->${newEmail}`);
    }

    // Update profile
    const profileUpdate: Record<string, unknown> = {};
    if (typeof full_name === "string" && full_name.trim()) profileUpdate.full_name = full_name.trim();
    if (whatsapp_number !== undefined) profileUpdate.whatsapp_number = whatsapp_number || null;
    if (Object.keys(profileUpdate).length > 0) {
      const { error: profErr } = await supabaseAdmin.from("profiles").update(profileUpdate).eq("user_id", user_id);
      if (profErr) return json({ error: `Failed to update profile: ${profErr.message}` }, 400);
      if (profileUpdate.full_name) changes.push(`name:${profileUpdate.full_name}`);
      if ("whatsapp_number" in profileUpdate) changes.push(`phone:${profileUpdate.whatsapp_number ?? ""}`);
    }

    // Audit log (best-effort)
    if (changes.length > 0) {
      await supabaseAdmin.from("audit_logs").insert({
        user_id: caller.id,
        org_id: sharedOrg,
        action: `update_user_details[${user_id}]:${changes.join("|")}`,
        resource_id: user_id,
      });
    }

    return json({ success: true, changes });
  } catch (err: any) {
    return json({ error: err?.message ?? String(err) }, 500);
  }
});
