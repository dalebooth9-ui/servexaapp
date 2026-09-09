import { verifyState } from "../_shared/oauthState.ts";
import { SAGE_API_BASE, SAGE_TOKEN_URL, serviceClient } from "../_shared/sage.ts";

const FALLBACK_APP_URL = "https://servexaapp.lovable.app";

function getAppUrl(): string {
  const raw = Deno.env.get("APP_URL") || FALLBACK_APP_URL;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.origin;
  } catch {
    // fall through
  }
  console.warn(`APP_URL is not a valid URL ("${raw}"), using fallback`);
  return FALLBACK_APP_URL;
}

function redirect(appUrl: string, params: string) {
  return new Response(null, { status: 302, headers: { Location: `${appUrl}/settings?${params}` } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  const appUrl = getAppUrl();
  console.log("Sage callback:", { hasCode: !!code, hasState: !!state, error });

  if (error) {
    return redirect(appUrl, `sage_error=${encodeURIComponent(errorDescription || error)}`);
  }
  if (!code || !state) {
    console.error("Missing callback params:", url.search);
    return redirect(appUrl, "sage_error=missing_params");
  }

  const CLIENT_ID = Deno.env.get("SAGE_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("SAGE_CLIENT_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  if (!CLIENT_ID || !CLIENT_SECRET || !SUPABASE_URL) {
    console.error("Missing required environment variables");
    return redirect(appUrl, "sage_error=server_config_error");
  }

  try {
    let userId: string;
    let orgId: string;
    try {
      const parsed = await verifyState<{ userId: string; orgId: string }>(state, CLIENT_SECRET);
      userId = parsed.userId;
      orgId = parsed.orgId;
      if (!userId || !orgId) throw new Error("Incomplete state payload");
    } catch (e) {
      console.error("State validation failed:", e);
      return redirect(appUrl, "sage_error=invalid_state");
    }

    const redirectUri = `${SUPABASE_URL}/functions/v1/sage-oauth-callback`;
    const tokenRes = await fetch(SAGE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenBody = await tokenRes.text();
    if (!tokenRes.ok) {
      console.error("Token exchange failed:", tokenRes.status, tokenBody);
      return redirect(appUrl, "sage_error=token_exchange_failed");
    }
    const tokens = JSON.parse(tokenBody);

    // The business is required for every later API call, so this one must work.
    let businessId: string | null = null;
    let businessName: string | null = null;
    try {
      const bizRes = await fetch(`${SAGE_API_BASE}/businesses`, {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: "application/json",
        },
      });
      if (bizRes.ok) {
        const payload = await bizRes.json();
        const items = Array.isArray(payload) ? payload : (payload?.["$items"] || []);
        businessId = items[0]?.id ?? null;
        businessName = items[0]?.name ?? null;
      } else {
        console.error("Businesses fetch failed:", bizRes.status, await bizRes.text());
      }
    } catch (e) {
      console.error("Businesses fetch threw:", e);
    }

    if (!businessId) {
      return redirect(appUrl, "sage_error=no_business_found");
    }

    const supabase = serviceClient();
    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 300) * 1000).toISOString();

    const { error: upsertError } = await supabase.from("sage_connections").upsert({
      user_id: userId,
      org_id: orgId,
      business_id: businessId,
      business_name: businessName,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
      connection_error: null,
    }, { onConflict: "org_id,business_id" });

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      return redirect(appUrl, "sage_error=db_save_failed");
    }

    await supabase.from("accounting_sync_log").insert({
      org_id: orgId,
      provider: "sage",
      action: "connect",
      entity_type: "connection",
      status: "success",
    });

    return redirect(
      appUrl,
      `sage_connected=true&business=${encodeURIComponent(businessName || "Sage")}`,
    );
  } catch (err: any) {
    console.error("Sage callback error:", err?.message, err?.stack);
    return redirect(appUrl, `sage_error=${encodeURIComponent(err?.message || "unknown")}`);
  }
});
