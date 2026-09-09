import { verifyState } from "../_shared/oauthState.ts";
import { QB_TOKEN_URL, serviceClient } from "../_shared/quickbooks.ts";

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
  const realmId = url.searchParams.get("realmId");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  const appUrl = getAppUrl();
  console.log("QuickBooks callback:", { hasCode: !!code, hasState: !!state, realmId, error });

  if (error) {
    return redirect(appUrl, `quickbooks_error=${encodeURIComponent(errorDescription || error)}`);
  }
  if (!code || !state || !realmId) {
    console.error("Missing callback params:", url.search);
    return redirect(appUrl, "quickbooks_error=missing_params");
  }

  const CLIENT_ID = Deno.env.get("QUICKBOOKS_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("QUICKBOOKS_CLIENT_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  if (!CLIENT_ID || !CLIENT_SECRET || !SUPABASE_URL) {
    console.error("Missing required environment variables");
    return redirect(appUrl, "quickbooks_error=server_config_error");
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
      return redirect(appUrl, "quickbooks_error=invalid_state");
    }

    const redirectUri = `${SUPABASE_URL}/functions/v1/quickbooks-oauth-callback`;
    const tokenRes = await fetch(QB_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenBody = await tokenRes.text();
    if (!tokenRes.ok) {
      console.error("Token exchange failed:", tokenRes.status, tokenBody);
      return redirect(appUrl, "quickbooks_error=token_exchange_failed");
    }
    const tokens = JSON.parse(tokenBody);

    // Company name is a nicety — a failure here must not break the connection.
    let companyName: string | null = null;
    try {
      const base = (Deno.env.get("QUICKBOOKS_ENV") || "production").toLowerCase() === "sandbox"
        ? "https://sandbox-quickbooks.api.intuit.com"
        : "https://quickbooks.api.intuit.com";
      const infoRes = await fetch(
        `${base}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=70`,
        { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" } },
      );
      if (infoRes.ok) {
        const info = await infoRes.json();
        companyName = info?.CompanyInfo?.CompanyName ?? null;
      } else {
        console.warn("CompanyInfo fetch failed:", infoRes.status, await infoRes.text());
      }
    } catch (e) {
      console.warn("CompanyInfo fetch threw:", e);
    }

    const supabase = serviceClient();
    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

    const { error: upsertError } = await supabase.from("quickbooks_connections").upsert({
      user_id: userId,
      org_id: orgId,
      realm_id: realmId,
      company_name: companyName,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
      connection_error: null,
    }, { onConflict: "org_id,realm_id" });

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      return redirect(appUrl, "quickbooks_error=db_save_failed");
    }

    await supabase.from("accounting_sync_log").insert({
      org_id: orgId,
      provider: "quickbooks",
      action: "connect",
      entity_type: "connection",
      status: "success",
    });

    return redirect(
      appUrl,
      `quickbooks_connected=true&company=${encodeURIComponent(companyName || "QuickBooks")}`,
    );
  } catch (err: any) {
    console.error("QuickBooks callback error:", err?.message, err?.stack);
    return redirect(appUrl, `quickbooks_error=${encodeURIComponent(err?.message || "unknown")}`);
  }
});
