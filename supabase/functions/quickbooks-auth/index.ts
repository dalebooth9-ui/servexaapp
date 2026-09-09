import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { signState } from "../_shared/oauthState.ts";
import { QB_AUTH_URL, QB_SCOPE, serviceClient } from "../_shared/quickbooks.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const action = new URL(req.url).searchParams.get("action");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return action === "status" ? json({ connected: false }) : json({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return action === "status" ? json({ connected: false }) : json({ error: "Unauthorized" }, 401);
    }

    const svc = serviceClient();
    const [{ data: profile }, { data: roles }] = await Promise.all([
      svc.from("profiles").select("org_id").eq("user_id", user.id).maybeSingle(),
      svc.from("user_roles").select("role").eq("user_id", user.id),
    ]);
    const orgId = (profile as any)?.org_id as string | undefined;
    const isAdmin = (roles || []).some(
      (r: any) => r.role === "admin" || r.role === "platform_admin",
    );

    if (!orgId) {
      return action === "status"
        ? json({ connected: false })
        : json({ error: "No organisation found for this user" }, 400);
    }

    // ---- Status ----
    if (action === "status") {
      const { data } = await svc
        .from("quickbooks_connections")
        .select("id, company_name, realm_id, token_expires_at, connection_error, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return json({
        connected: !!data,
        company_name: (data as any)?.company_name ?? null,
        realm_id: (data as any)?.realm_id ?? null,
        connected_at: (data as any)?.created_at ?? null,
        connection_error: (data as any)?.connection_error ?? null,
        token_expired: data
          ? new Date((data as any).token_expires_at) < new Date()
          : false,
      });
    }

    if (!isAdmin) {
      return json({ error: "Only organisation admins can manage the QuickBooks connection" }, 403);
    }

    // ---- Authorize ----
    if (action === "authorize") {
      const clientId = Deno.env.get("QUICKBOOKS_CLIENT_ID");
      const clientSecret = Deno.env.get("QUICKBOOKS_CLIENT_SECRET");
      if (!clientId || !clientSecret) {
        return json({ error: "QuickBooks credentials are not configured" }, 500);
      }

      const redirectUri = `${SUPABASE_URL}/functions/v1/quickbooks-oauth-callback`;
      const state = await signState({ userId: user.id, orgId }, clientSecret);

      const authUrl =
        `${QB_AUTH_URL}?client_id=${encodeURIComponent(clientId)}` +
        `&response_type=code&scope=${encodeURIComponent(QB_SCOPE)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${encodeURIComponent(state)}`;

      return json({ url: authUrl });
    }

    // ---- Disconnect ----
    if (action === "disconnect") {
      await svc.from("quickbooks_connections").delete().eq("org_id", orgId);
      await svc.from("accounting_sync_log").insert({
        org_id: orgId,
        provider: "quickbooks",
        action: "disconnect",
        status: "success",
      });
      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err: any) {
    console.error("QuickBooks auth error:", err);
    return json({ error: err?.message || "Unexpected error" }, 500);
  }
});
