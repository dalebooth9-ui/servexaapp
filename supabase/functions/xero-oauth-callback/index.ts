import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // Determine redirect URL based on environment
  const appUrl = Deno.env.get("APP_URL") || "https://field-aid-box.lovable.app";

  if (error) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/settings?xero_error=${encodeURIComponent(error)}` },
    });
  }

  if (!code || !state) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/settings?xero_error=missing_params` },
    });
  }

  const XERO_CLIENT_ID = Deno.env.get("XERO_CLIENT_ID")!;
  const XERO_CLIENT_SECRET = Deno.env.get("XERO_CLIENT_SECRET")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const redirectUri = `${SUPABASE_URL}/functions/v1/xero-oauth-callback`;

  try {
    const { userId } = JSON.parse(atob(state));

    // Exchange code for tokens
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

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("Token exchange failed:", errBody);
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/settings?xero_error=token_exchange_failed` },
      });
    }

    const tokens = await tokenRes.json();

    // Get connected Xero tenants
    const connectionsRes = await fetch(XERO_CONNECTIONS_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!connectionsRes.ok) {
      console.error("Connections fetch failed:", await connectionsRes.text());
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/settings?xero_error=connections_failed` },
      });
    }

    const connections = await connectionsRes.json();
    if (!connections.length) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/settings?xero_error=no_tenants` },
      });
    }

    // Store the first tenant connection
    const tenant = connections[0];
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    await supabase.from("xero_connections").upsert({
      user_id: userId,
      tenant_id: tenant.tenantId,
      tenant_name: tenant.tenantName,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
    }, { onConflict: "user_id,tenant_id" });

    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/settings?xero_connected=true&tenant=${encodeURIComponent(tenant.tenantName)}` },
    });
  } catch (err: any) {
    console.error("OAuth callback error:", err);
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/settings?xero_error=${encodeURIComponent(err.message)}` },
    });
  }
});
