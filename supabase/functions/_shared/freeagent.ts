// Shared FreeAgent helpers: token refresh, rate-limit aware fetching,
// pagination and sync logging. Mirrors _shared/sage.ts and _shared/quickbooks.ts.
//
// FreeAgent notes:
//  - Access tokens expire after ~2 hours.
//  - Refresh tokens are single use: every refresh may return a NEW refresh
//    token, which must be stored or the connection breaks on the next refresh.
//  - Resources are identified by their full API URL, not a bare id.
//  - Rate limits are 120 requests per minute (and 15/min for some endpoints).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SANDBOX = (Deno.env.get("FREEAGENT_ENV") || "").toLowerCase() === "sandbox";

export const FREEAGENT_HOST = SANDBOX
  ? "https://api.sandbox.freeagent.com"
  : "https://api.freeagent.com";
export const FREEAGENT_API_BASE = `${FREEAGENT_HOST}/v2`;
export const FREEAGENT_AUTH_URL = `${FREEAGENT_API_BASE}/approve_app`;
export const FREEAGENT_TOKEN_URL = `${FREEAGENT_API_BASE}/token_endpoint`;

export interface FreeAgentConnection {
  id: string;
  org_id: string;
  user_id: string;
  company_url: string;
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
      provider: entry.provider || "freeagent",
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
): Promise<{ connection: FreeAgentConnection } | { error: string }> {
  const { data } = await supabase
    .from("freeagent_connections")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const conn = data as FreeAgentConnection | null;
  if (!conn) return { error: "FreeAgent is not connected for this organisation." };

  // Refresh a little early so a long sync does not expire mid-run.
  const expiresSoon = new Date(conn.token_expires_at).getTime() - 120_000 < Date.now();
  if (!expiresSoon) {
    if (conn.connection_error) {
      await supabase
        .from("freeagent_connections")
        .update({ connection_error: null })
        .eq("id", conn.id);
      conn.connection_error = null;
    }
    return { connection: conn };
  }

  const clientId = Deno.env.get("FREEAGENT_CLIENT_ID");
  const clientSecret = Deno.env.get("FREEAGENT_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return { error: "FreeAgent credentials are not configured." };
  }

  const res = await fetch(FREEAGENT_TOKEN_URL, {
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
    console.error("FreeAgent token refresh failed:", res.status, detail);
    const message = res.status === 400 || res.status === 401
      ? "FreeAgent sign-in has expired. Reconnect FreeAgent in Settings."
      : `FreeAgent token refresh failed (${res.status}).`;
    await supabase
      .from("freeagent_connections")
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
  // Refresh tokens are single use — always persist the new one when returned.
  const newRefresh = tokens.refresh_token || conn.refresh_token;
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 7200) * 1000).toISOString();

  const { error: updateError } = await supabase
    .from("freeagent_connections")
    .update({
      access_token: tokens.access_token,
      refresh_token: newRefresh,
      token_expires_at: expiresAt,
      connection_error: null,
    })
    .eq("id", conn.id);

  if (updateError) {
    // If we cannot store the rotated refresh token the connection would break
    // silently on the next run, so fail loudly now.
    console.error("Failed to persist refreshed FreeAgent tokens:", updateError);
    return { error: "Could not save the refreshed FreeAgent sign-in. Try again." };
  }

  return {
    connection: {
      ...conn,
      access_token: tokens.access_token,
      refresh_token: newRefresh,
      token_expires_at: expiresAt,
      connection_error: null,
    },
  };
}

export class FreeAgentApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`FreeAgent API error ${status}: ${detail.slice(0, 500)}`);
    this.name = "FreeAgentApiError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Call the FreeAgent API, honouring 429 Retry-After (120 requests/minute) and
 * retrying transient 5xx responses with exponential backoff.
 */
export async function faFetch(
  conn: FreeAgentConnection,
  path: string,
  init: { method?: string; body?: unknown } = {},
  attempt = 0,
): Promise<any> {
  const url = path.startsWith("http") ? path : `${FREEAGENT_API_BASE}${path}`;
  const res = await fetch(url, {
    method: init.method || "GET",
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Servexa (accounting sync)",
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (res.status === 429 || res.status >= 500) {
    if (attempt < 3) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 30_000)
        : Math.min(1000 * 2 ** attempt, 8000);
      console.warn(`FreeAgent ${res.status} on ${path}; retrying in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
      return await faFetch(conn, path, init, attempt + 1);
    }
  }

  const text = await res.text();
  if (!res.ok) throw new FreeAgentApiError(res.status, text);
  return text ? JSON.parse(text) : {};
}

/** Walk a paged FreeAgent collection, reading `key` from each page. */
export async function faPaged(
  conn: FreeAgentConnection,
  path: string,
  key: string,
  { perPage = 100, maxPages = 20 } = {},
): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const payload = await faFetch(conn, `${path}${sep}per_page=${perPage}&page=${page}`);
    const items = Array.isArray(payload?.[key]) ? payload[key] : [];
    out.push(...items);
    if (items.length < perPage) break;
  }
  return out;
}

/** FreeAgent identifies resources by URL; keep only the trailing id. */
export function idFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const parts = String(url).split("/").filter(Boolean);
  return parts[parts.length - 1] || null;
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
