/**
 * Central client-side error logger.
 *
 * - Writes to public.client_errors (org-scoped, admin-only read).
 * - Keeps a small in-memory ring buffer so the "Report a problem" dialog
 *   can attach recent errors for context.
 * - Deduplicates identical errors within a short window to avoid flooding.
 * - Only logs when a user session exists (RLS requires user_id = auth.uid()).
 */
import { supabase } from "@/integrations/supabase/client";

export type ErrorSource = "client" | "api" | "edge" | "boundary" | "unhandled" | "promise" | "toast";

export interface LoggedError {
  source: ErrorSource;
  message: string;
  stack?: string | null;
  page_url?: string;
  route?: string;
  user_agent?: string;
  context?: Record<string, unknown>;
  created_at: string;
}

const RING_SIZE = 25;
const DEDUPE_WINDOW_MS = 10_000;

const ring: LoggedError[] = [];
const recentSignatures = new Map<string, number>();

let cachedOrgId: string | null | undefined = undefined; // undefined = not fetched yet
let cachedUserId: string | null = null;
let cachedRole: string | null = null;

async function resolveIdentity(): Promise<{ userId: string | null; orgId: string | null; role: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { userId: null, orgId: null, role: null };
  if (cachedUserId !== user.id) {
    cachedUserId = user.id;
    cachedOrgId = undefined;
    cachedRole = null;
  }
  if (cachedOrgId === undefined) {
    const { data } = await supabase
      .from("organisation_members")
      .select("org_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    cachedOrgId = data?.org_id ?? null;
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    cachedRole = (roleRow?.role as string | undefined) ?? null;
  }
  return { userId: user.id, orgId: cachedOrgId ?? null, role: cachedRole };
}

/** Redact obvious secrets from any free text before it is persisted. */
const SECRET_PATTERNS: RegExp[] = [
  /("?(?:password|passwd|pwd|secret|token|access_token|refresh_token|api[_-]?key|apikey|authorization|auth|bearer|client_secret|card|cardnumber|cvv|cvc|pin)"?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,&;}]+)/gi,
  /\bBearer\s+[A-Za-z0-9._\-]{12,}\b/gi,
  /\beyJ[A-Za-z0-9._\-]{20,}\b/g, // JWTs
  /\b(?:\d[ -]*?){13,19}\b/g, // card-like numbers
];

export function scrubSecrets(input: string): string {
  let out = input;
  try {
    out = out.replace(SECRET_PATTERNS[0], (_m, p1) => `${p1}"[redacted]"`);
    out = out.replace(SECRET_PATTERNS[1], "Bearer [redacted]");
    out = out.replace(SECRET_PATTERNS[2], "[redacted-jwt]");
    out = out.replace(SECRET_PATTERNS[3], (m) => (/\d/.test(m) && m.replace(/\D/g, "").length >= 13 ? "[redacted-number]" : m));
  } catch {
    /* ignore */
  }
  return out;
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") return scrubSecrets(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = /password|secret|token|apikey|api_key|authorization|card|cvv|pin/i.test(k)
        ? "[redacted]"
        : scrubValue(v);
    }
    return out;
  }
  return value;
}


function signature(source: string, message: string) {
  return `${source}::${message.slice(0, 200)}`;
}

function pushRing(entry: LoggedError) {
  ring.push(entry);
  if (ring.length > RING_SIZE) ring.shift();
}

export function getRecentErrors(): LoggedError[] {
  return [...ring];
}

export interface LogErrorInput {
  source?: ErrorSource;
  error?: unknown;
  message?: string;
  context?: Record<string, unknown>;
}

/** Fire-and-forget: never throws, never blocks the caller. */
export function logError(input: LogErrorInput): void {
  try {
    const source: ErrorSource = input.source ?? "client";
    const err = input.error;
    let message = input.message ?? "";
    let stack: string | null = null;

    if (err instanceof Error) {
      message = message || err.message || String(err);
      stack = err.stack ?? null;
    } else if (err && typeof err === "object") {
      const anyErr = err as { message?: string; stack?: string };
      message = message || anyErr.message || JSON.stringify(err).slice(0, 500);
      stack = anyErr.stack ?? null;
    } else if (err !== undefined) {
      message = message || String(err);
    }
    if (!message) message = "Unknown error";

    const sig = signature(source, message);
    const now = Date.now();
    const last = recentSignatures.get(sig);
    if (last && now - last < DEDUPE_WINDOW_MS) return;
    recentSignatures.set(sig, now);

    const entry: LoggedError = {
      source,
      message: scrubSecrets(message),
      stack: stack ? scrubSecrets(stack) : null,
      page_url: typeof window !== "undefined" ? scrubSecrets(window.location.href) : undefined,
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      context: (scrubValue(input.context ?? {}) as Record<string, unknown>),
      created_at: new Date().toISOString(),
    };
    pushRing(entry);

    // Persist asynchronously; swallow any failure so logging never breaks the app.
    void (async () => {
      try {
        const { userId, orgId, role } = await resolveIdentity();
        if (!userId) return; // Anonymous session — RLS would reject
        await supabase.from("client_errors").insert([{
          user_id: userId,
          org_id: orgId ?? undefined,
          source: entry.source,
          message: entry.message.slice(0, 2000),
          stack: entry.stack ? entry.stack.slice(0, 8000) : undefined,
          page_url: entry.page_url,
          route: entry.route,
          user_agent: entry.user_agent,
          context: ({ ...(entry.context ?? {}), role }) as never,
        }]);
      } catch {
        // Never propagate.
      }
    })();
  } catch {
    // Never propagate.
  }
}


/**
 * Wraps a Supabase call result. If `error` is set, logs it and returns the
 * original object so callers keep their existing flow.
 */
export function reportSupabase<T extends { error: unknown }>(
  result: T,
  where: string,
  extra?: Record<string, unknown>,
): T {
  if (result?.error) {
    logError({
      source: "api",
      error: result.error,
      context: { where, ...(extra ?? {}) },
    });
  }
  return result;
}

let installed = false;
export function installGlobalErrorHandlers() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    logError({
      source: "unhandled",
      error: event.error ?? new Error(event.message),
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    logError({
      source: "promise",
      error: event.reason,
    });
  });

  installToastCapture();
  installEdgeFunctionCapture();
}

/** Centrally records every sonner error toast without touching call sites. */
function installToastCapture() {
  try {
    const anyToast = toast as unknown as Record<string, unknown>;
    const original = anyToast.error as ((...args: unknown[]) => unknown) | undefined;
    if (typeof original !== "function" || (original as { __logged?: boolean }).__logged) return;
    const wrapped = (...args: unknown[]) => {
      try {
        const [msg, opts] = args as [unknown, { description?: unknown } | undefined];
        const text = typeof msg === "string" ? msg : msg instanceof Error ? msg.message : "Error toast";
        logError({
          source: "toast",
          message: text,
          context: {
            description: typeof opts?.description === "string" ? opts.description : undefined,
          },
        });
      } catch {
        /* logging must never break the toast */
      }
      return original(...args);
    };
    (wrapped as { __logged?: boolean }).__logged = true;
    anyToast.error = wrapped;
  } catch {
    /* ignore */
  }
}

/** Records failures returned by edge-function invocations. */
function installEdgeFunctionCapture() {
  try {
    const fns = supabase.functions as unknown as {
      invoke: (...args: unknown[]) => Promise<{ error?: unknown }>;
      __logged?: boolean;
    };
    if (!fns || typeof fns.invoke !== "function" || fns.__logged) return;
    const original = fns.invoke.bind(fns);
    fns.invoke = async (...args: unknown[]) => {
      const name = typeof args[0] === "string" ? (args[0] as string) : "unknown";
      try {
        const result = await original(...args);
        if (result?.error) {
          logError({ source: "edge", error: result.error, context: { function: name } });
        }
        return result;
      } catch (e) {
        logError({ source: "edge", error: e, context: { function: name } });
        throw e;
      }
    };
    fns.__logged = true;
  } catch {
    /* ignore */
  }
}

