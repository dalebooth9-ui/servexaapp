import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
const FALLBACK_APP_URL = "https://field-aid-box.lovable.app";

function getAppUrl(): string {
  const raw = Deno.env.get("APP_URL") || FALLBACK_APP_URL;
  // Validate it looks like a URL
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.origin;
    }
  } catch {
    // not a valid URL
  }
  console.warn(`APP_URL is not a valid URL ("${raw}"), using fallback: ${FALLBACK_APP_URL}`);
  return FALLBACK_APP_URL;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  const appUrl = getAppUrl();
  console.log("OAuth callback hit:", { hasCode: !!code, hasState: !!state, error, errorDescription, appUrl });

  if (error) {
    const msg = errorDescription || error;
    console.error("Xero returned error:", msg);
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/settings?xero_error=${encodeURIComponent(msg)}` },
    });
  }

  if (!code || !state) {
    console.error("Missing code or state params. Full query:", url.search);
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/settings?xero_error=missing_params` },
    });
  }

  const XERO_CLIENT_ID = Deno.env.get("XERO_CLIENT_ID");
  const XERO_CLIENT_SECRET = Deno.env.get("XERO_CLIENT_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!XERO_CLIENT_ID || !XERO_CLIENT_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Missing required environment variables");
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/settings?xero_error=server_config_error` },
    });
  }

  const redirectUri = `${SUPABASE_URL}/functions/v1/xero-oauth-callback`;

  try {
    let userId: string;
    try {
      const decoded = atob(state);
      const pipeIdx = decoded.lastIndexOf("|");
      if (pipeIdx === -1) throw new Error("No pipe separator in state");
      const statePayload = decoded.substring(0, pipeIdx);
      const sigB64 = decoded.substring(pipeIdx + 1);

      // Verify HMAC signature
      const secret = XERO_CLIENT_SECRET!;
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      );
      const sigBytes = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
      const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(statePayload));
      if (!valid) throw new Error("Invalid state signature");

      const parsed = JSON.parse(statePayload);
      // Reject state older than 15 minutes
      if (Date.now() - (parsed.ts || 0) > 15 * 60 * 1000) throw new Error("State expired");
      userId = parsed.userId;
    } catch (e) {
      console.error("Failed to validate state:", e);
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/settings?xero_error=invalid_state` },
      });
    }

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

    // Get connected Xero tenants
    const connectionsRes = await fetch(XERO_CONNECTIONS_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const connectionsBody = await connectionsRes.text();
    if (!connectionsRes.ok) {
      console.error("Connections fetch failed:", connectionsBody);
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/settings?xero_error=connections_failed` },
      });
    }

    const connections = JSON.parse(connectionsBody);
    if (!connections.length) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/settings?xero_error=no_tenants` },
      });
    }

    const tenant = connections[0];
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

    console.log("Connection saved successfully for tenant:", tenant.tenantName);
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
