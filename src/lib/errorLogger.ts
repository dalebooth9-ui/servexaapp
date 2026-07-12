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

export type ErrorSource = "client" | "api" | "edge" | "boundary" | "unhandled" | "promise";

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

async function resolveIdentity(): Promise<{ userId: string | null; orgId: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { userId: null, orgId: null };
  if (cachedUserId !== user.id) {
    cachedUserId = user.id;
    cachedOrgId = undefined;
  }
  if (cachedOrgId === undefined) {
    const { data } = await supabase
      .from("organisation_members")
      .select("org_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    cachedOrgId = data?.org_id ?? null;
  }
  return { userId: user.id, orgId: cachedOrgId ?? null };
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
      message,
      stack,
      page_url: typeof window !== "undefined" ? window.location.href : undefined,
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      context: input.context ?? {},
      created_at: new Date().toISOString(),
    };
    pushRing(entry);

    // Persist asynchronously; swallow any failure so logging never breaks the app.
    void (async () => {
      try {
        const { userId, orgId } = await resolveIdentity();
        if (!userId) return; // Anonymous session — RLS would reject
        await supabase.from("client_errors").insert({
          user_id: userId,
          org_id: orgId,
          source: entry.source,
          message: entry.message.slice(0, 2000),
          stack: entry.stack ? entry.stack.slice(0, 8000) : null,
          page_url: entry.page_url,
          route: entry.route,
          user_agent: entry.user_agent,
          context: entry.context ?? {},
        });
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
}
