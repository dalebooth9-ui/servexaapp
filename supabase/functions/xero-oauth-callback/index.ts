import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  console.log("OAuth callback hit:", { hasCode: !!code, hasState: !!state, error });

  const appUrl = Deno.env.get("APP_URL") || "https://field-aid-box.lovable.app";
  console.log("APP_URL:", appUrl);

  if (error) {
    console.error("Xero returned error:", error);
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/settings?xero_error=${encodeURIComponent(error)}` },
    });
  }

  if (!code || !state) {
    console.error("Missing code or state params");
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/settings?xero_error=missing_params` },
    });
  }

  const XERO_CLIENT_ID = Deno.env.get("XERO_CLIENT_ID");
  const XERO_CLIENT_SECRET = Deno.env.get("XERO_CLIENT_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  console.log("Env check:", {
    hasClientId: !!XERO_CLIENT_ID,
    hasClientSecret: !!XERO_CLIENT_SECRET,
    hasSupabaseUrl: !!SUPABASE_URL,
    hasServiceKey: !!SERVICE_ROLE_KEY,
  });

  if (!XERO_CLIENT_ID || !XERO_CLIENT_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Missing required environment variables");
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/settings?xero_error=server_config_error` },
    });
  }

  const redirectUri = `${SUPABASE_URL}/functions/v1/xero-oauth-callback`;
  console.log("Redirect URI for token exchange:", redirectUri);

  try {
    let userId: string;
    try {
      const parsed = JSON.parse(atob(state));
      userId = parsed.userId;
      console.log("Parsed state, userId:", userId);
    } catch (e) {
      console.error("Failed to parse state:", e);
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/settings?xero_error=invalid_state` },
      });
    }

    // Exchange code for tokens
    console.log("Exchanging code for tokens...");
    const tokenRes = await fetch(XERO_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenBody = await tokenRes.text();
    console.log("Token response status:", tokenRes.status);
    if (!tokenRes.ok) {
      console.error("Token exchange failed:", tokenBody);
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/settings?xero_error=token_exchange_failed` },
      });
    }

    const tokens = JSON.parse(tokenBody);
    console.log("Token exchange successful, has access_token:", !!tokens.access_token);

    // Get connected Xero tenants
    const connectionsRes = await fetch(XERO_CONNECTIONS_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const connectionsBody = await connectionsRes.text();
    console.log("Connections response status:", connectionsRes.status);
    if (!connectionsRes.ok) {
      console.error("Connections fetch failed:", connectionsBody);
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/settings?xero_error=connections_failed` },
      });
    }

    const connections = JSON.parse(connectionsBody);
    console.log("Connections count:", connections.length);
    if (!connections.length) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/settings?xero_error=no_tenants` },
      });
    }

    const tenant = connections[0];
    console.log("Using tenant:", tenant.tenantName, tenant.tenantId);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { error: upsertError } = await supabase.from("xero_connections").upsert({
      user_id: userId,
      tenant_id: tenant.tenantId,
      tenant_name: tenant.tenantName,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
    }, { onConflict: "user_id,tenant_id" });

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/settings?xero_error=db_save_failed` },
      });
    }

    console.log("Connection saved successfully");
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/settings?xero_connected=true&tenant=${encodeURIComponent(tenant.tenantName)}` },
    });
  } catch (err: any) {
    console.error("OAuth callback error:", err.message, err.stack);
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/settings?xero_error=${encodeURIComponent(err.message)}` },
    });
  }
});
