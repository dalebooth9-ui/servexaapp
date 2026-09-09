import { verifyState } from "../_shared/oauthState.ts";
import { FREEAGENT_API_BASE, FREEAGENT_TOKEN_URL, serviceClient } from "../_shared/freeagent.ts";

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
  console.log("FreeAgent callback:", { hasCode: !!code, hasState: !!state, error });

  if (error) {
    return redirect(appUrl, `freeagent_error=${encodeURIComponent(errorDescription || error)}`);
  }
  if (!code || !state) {
    console.error("Missing callback params:", url.search);
    return redirect(appUrl, "freeagent_error=missing_params");
  }

  const CLIENT_ID = Deno.env.get("FREEAGENT_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("FREEAGENT_CLIENT_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  if (!CLIENT_ID || !CLIENT_SECRET || !SUPABASE_URL) {
    console.error("Missing required environment variables");
    return redirect(appUrl, "freeagent_error=server_config_error");
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
      return redirect(appUrl, "freeagent_error=invalid_state");
    }

    const redirectUri = `${SUPABASE_URL}/functions/v1/freeagent-oauth-callback`;
    const tokenRes = await fetch(FREEAGENT_TOKEN_URL, {
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
      return redirect(appUrl, "freeagent_error=token_exchange_failed");
    }
    const tokens = JSON.parse(tokenBody);
    if (!tokens.access_token || !tokens.refresh_token) {
      console.error("Token response missing tokens");
      return redirect(appUrl, "freeagent_error=token_exchange_failed");
    }

    // The company endpoint identifies which FreeAgent account we are linked to.
    let companyName: string | null = null;
    try {
      const compRes = await fetch(`${FREEAGENT_API_BASE}/company`, {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: "application/json",
          "User-Agent": "Servexa (accounting sync)",
        },
      });
      if (compRes.ok) {
        const payload = await compRes.json();
        companyName = payload?.company?.name ?? payload?.company?.subdomain ?? null;
      } else {
        console.error("Company fetch failed:", compRes.status, await compRes.text());
        return redirect(appUrl, "freeagent_error=company_lookup_failed");
      }
    } catch (e) {
      console.error("Company fetch threw:", e);
      return redirect(appUrl, "freeagent_error=company_lookup_failed");
    }

    const companyUrl = `${FREEAGENT_API_BASE}/company`;
    const supabase = serviceClient();
    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 7200) * 1000).toISOString();

    const { error: upsertError } = await supabase.from("freeagent_connections").upsert({
      user_id: userId,
      org_id: orgId,
      company_url: companyUrl,
      company_name: companyName,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
      connection_error: null,
    }, { onConflict: "org_id,company_url" });

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      return redirect(appUrl, "freeagent_error=db_save_failed");
    }

    await supabase.from("accounting_sync_log").insert({
      org_id: orgId,
      provider: "freeagent",
      action: "connect",
      entity_type: "connection",
      status: "success",
    });

    return redirect(
      appUrl,
      `freeagent_connected=true&company=${encodeURIComponent(companyName || "FreeAgent")}`,
    );
  } catch (err: any) {
    console.error("FreeAgent callback error:", err?.message, err?.stack);
    return redirect(appUrl, `freeagent_error=${encodeURIComponent(err?.message || "unknown")}`);
  }
});
