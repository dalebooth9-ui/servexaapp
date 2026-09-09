// Shared QuickBooks Online helpers: environment, token refresh, rate-limit
// aware fetching and sync logging.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
export const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QB_SCOPE = "com.intuit.quickbooks.accounting";

/** Sandbox vs production API host, driven by the QUICKBOOKS_ENV secret. */
export function qbApiBase(): string {
  const env = (Deno.env.get("QUICKBOOKS_ENV") || "production").toLowerCase();
  return env === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}

export interface QbConnection {
  id: string;
  org_id: string;
  user_id: string;
  realm_id: string;
  company_name: string | null;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  connection_error: string | null;
}

export type ServiceClient = ReturnType<typeof createClient>;

export function serviceClient(): ServiceClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** Record one sync attempt. Never throws — logging must not break a sync. */
export async function logSync(
  supabase: ServiceClient,
  entry: {
    org_id: string;
    provider?: string;
    action: string;
    entity_type?: string | null;
    entity_id?: string | null;
    status?: "success" | "error";
    error_message?: string | null;
  },
): Promise<void> {
  try {
    await supabase.from("accounting_sync_log").insert({
      org_id: entry.org_id,
      provider: entry.provider || "quickbooks",
      action: entry.action,
      entity_type: entry.entity_type ?? null,
      entity_id: entry.entity_id ?? null,
      status: entry.status || "success",
      error_message: entry.error_message ?? null,
    });
  } catch (e) {
    console.error("Failed to write accounting_sync_log entry:", e);
  }
}

/**
 * Fetch the org's connection and refresh the access token when it has expired.
 * On refresh failure we record the reason on `connection_error` rather than
 * deleting the row, so the user is told what happened.
 */
export async function getValidConnection(
  supabase: ServiceClient,
  orgId: string,
): Promise<{ connection: QbConnection } | { error: string }> {
  const { data } = await supabase
    .from("quickbooks_connections")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const conn = data as QbConnection | null;
  if (!conn) return { error: "QuickBooks is not connected for this organisation." };

  // Refresh a little early so a long sync does not expire mid-run.
  const expiresSoon = new Date(conn.token_expires_at).getTime() - 60_000 < Date.now();
  if (!expiresSoon) {
    if (conn.connection_error) {
      await supabase
        .from("quickbooks_connections")
        .update({ connection_error: null })
        .eq("id", conn.id);
      conn.connection_error = null;
    }
    return { connection: conn };
  }

  const clientId = Deno.env.get("QUICKBOOKS_CLIENT_ID");
  const clientSecret = Deno.env.get("QUICKBOOKS_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return { error: "QuickBooks credentials are not configured." };
  }

  const res = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("QuickBooks token refresh failed:", res.status, detail);
    const message =
      res.status === 400 || res.status === 401
        ? "QuickBooks sign-in has expired. Reconnect QuickBooks in Settings."
        : `QuickBooks token refresh failed (${res.status}).`;
    await supabase
      .from("quickbooks_connections")
      .update({ connection_error: message })
      .eq("id", conn.id);
    await logSync(supabase, {
      org_id: orgId,
      action: "token_refresh",
      status: "error",
      error_message: message,
    });
    return { error: message };
  }

  const tokens = await res.json();
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
  await supabase
    .from("quickbooks_connections")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? conn.refresh_token,
      token_expires_at: expiresAt,
      connection_error: null,
    })
    .eq("id", conn.id);

  return {
    connection: {
      ...conn,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? conn.refresh_token,
      token_expires_at: expiresAt,
      connection_error: null,
    },
  };
}

export class QbApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`QuickBooks API error ${status}: ${detail.slice(0, 500)}`);
    this.name = "QbApiError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Call the QuickBooks API, honouring 429 Retry-After and retrying transient
 * 5xx responses with exponential backoff.
 */
export async function qbFetch(
  conn: QbConnection,
  path: string,
  init: { method?: string; body?: unknown } = {},
  attempt = 0,
): Promise<any> {
  const url = `${qbApiBase()}/v3/company/${conn.realm_id}${path}`;
  const res = await fetch(url, {
    method: init.method || "GET",
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (res.status === 429 || res.status >= 500) {
    if (attempt < 3) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 30_000)
        : Math.min(1000 * 2 ** attempt, 8000);
      console.warn(`QuickBooks ${res.status} on ${path}; retrying in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
      return await qbFetch(conn, path, init, attempt + 1);
    }
  }

  const text = await res.text();
  if (!res.ok) throw new QbApiError(res.status, text);
  return text ? JSON.parse(text) : {};
}

/** Build a QuickBooks SQL-ish query path. */
export function qbQueryPath(query: string): string {
  return `/query?minorversion=70&query=${encodeURIComponent(query)}`;
}

/** Escape a value for a QuickBooks query string literal. */
export function qbEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Org currency, from app_settings key "accounting", defaulting to GBP. */
export async function orgCurrency(
  supabase: ServiceClient,
  orgId: string,
): Promise<string> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("org_id", orgId)
      .eq("key", "accounting")
      .maybeSingle();
    const value = (data?.value ?? {}) as Record<string, unknown>;
    const code = typeof value.currency === "string" ? value.currency.trim().toUpperCase() : "";
    if (/^[A-Z]{3}$/.test(code)) return code;
  } catch (e) {
    console.error("Failed to read org currency:", e);
  }
  return "GBP";
}
