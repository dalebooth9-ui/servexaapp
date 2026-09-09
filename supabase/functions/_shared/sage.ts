// Shared Sage Business Cloud Accounting helpers: token refresh, rate-limit
// aware fetching, lookups and sync logging. Mirrors _shared/quickbooks.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SAGE_AUTH_URL = "https://www.sageone.com/oauth2/auth/central";
export const SAGE_TOKEN_URL = "https://oauth.accounting.sage.com/token";
export const SAGE_API_BASE = "https://api.accounting.sage.com/v3.1";
export const SAGE_SCOPE = "full_access";
export const SAGE_API_FILTER = "apiv3.1";

export interface SageConnection {
  id: string;
  org_id: string;
  user_id: string;
  business_id: string;
  business_name: string | null;
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
      provider: entry.provider || "sage",
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
): Promise<{ connection: SageConnection } | { error: string }> {
  const { data } = await supabase
    .from("sage_connections")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const conn = data as SageConnection | null;
  if (!conn) return { error: "Sage is not connected for this organisation." };

  // Refresh a little early so a long sync does not expire mid-run.
  const expiresSoon = new Date(conn.token_expires_at).getTime() - 60_000 < Date.now();
  if (!expiresSoon) {
    if (conn.connection_error) {
      await supabase
        .from("sage_connections")
        .update({ connection_error: null })
        .eq("id", conn.id);
      conn.connection_error = null;
    }
    return { connection: conn };
  }

  const clientId = Deno.env.get("SAGE_CLIENT_ID");
  const clientSecret = Deno.env.get("SAGE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return { error: "Sage credentials are not configured." };
  }

  const res = await fetch(SAGE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("Sage token refresh failed:", res.status, detail);
    const message = res.status === 400 || res.status === 401
      ? "Sage sign-in has expired. Reconnect Sage in Settings."
      : `Sage token refresh failed (${res.status}).`;
    await supabase
      .from("sage_connections")
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
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 300) * 1000).toISOString();
  await supabase
    .from("sage_connections")
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

export class SageApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`Sage API error ${status}: ${detail.slice(0, 500)}`);
    this.name = "SageApiError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Call the Sage API, honouring 429 Retry-After and retrying transient 5xx
 * responses with exponential backoff.
 */
export async function sageFetch(
  conn: SageConnection,
  path: string,
  init: { method?: string; body?: unknown } = {},
  attempt = 0,
): Promise<any> {
  const url = path.startsWith("http") ? path : `${SAGE_API_BASE}${path}`;
  const res = await fetch(url, {
    method: init.method || "GET",
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Business": conn.business_id,
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (res.status === 429 || res.status >= 500) {
    if (attempt < 3) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 30_000)
        : Math.min(1000 * 2 ** attempt, 8000);
      console.warn(`Sage ${res.status} on ${path}; retrying in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
      return await sageFetch(conn, path, init, attempt + 1);
    }
  }

  const text = await res.text();
  if (!res.ok) throw new SageApiError(res.status, text);
  return text ? JSON.parse(text) : {};
}

/** Sage collections come back as { $items: [...], $total, $page }. */
export function sageItems(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  return payload?.["$items"] || [];
}

/** Walk a paged Sage collection, up to `maxPages` pages. */
export async function sagePaged(
  conn: SageConnection,
  path: string,
  { pageSize = 100, maxPages = 20 } = {},
): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const payload = await sageFetch(conn, `${path}${sep}items_per_page=${pageSize}&page=${page}`);
    const items = sageItems(payload);
    out.push(...items);
    if (items.length < pageSize) break;
  }
  return out;
}

/**
 * The first sales-visible ledger account for this business. Sage requires a
 * ledger account on invoice lines and products; we never hardcode a code.
 */
export async function salesLedgerAccountId(conn: SageConnection): Promise<string | null> {
  try {
    const payload = await sageFetch(
      conn,
      "/ledger_accounts?visible_in=sales&items_per_page=1&page=1",
    );
    return sageItems(payload)[0]?.id ?? null;
  } catch (e) {
    console.error("Sage ledger account lookup failed:", e);
    return null;
  }
}

/** The business's default sales tax rate, if one is configured. */
export async function defaultTaxRateId(conn: SageConnection): Promise<string | null> {
  try {
    const payload = await sageFetch(conn, "/tax_rates?items_per_page=100&page=1");
    const rates = sageItems(payload);
    if (!rates.length) return null;
    const standard = rates.find((r: any) =>
      typeof r.name === "string" && /standard/i.test(r.name)
    );
    return (standard || rates[0])?.id ?? null;
  } catch (e) {
    console.error("Sage tax rate lookup failed:", e);
    return null;
  }
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
