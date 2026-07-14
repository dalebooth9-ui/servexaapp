/**
 * Org-scoped Supabase Storage path helper.
 *
 * All new uploads to isolation-protected buckets MUST be prefixed with the
 * current organisation id so that per-object storage RLS can enforce tenant
 * isolation. Legacy objects live at the un-prefixed root and are still
 * readable via `durableStorageRef` (which stores whatever path was persisted
 * at the time), so callers do not need to change their read paths — only the
 * write paths need the prefix.
 *
 * Usage:
 *   import { buildOrgPath, useOrgId } from "@/lib/orgStoragePath";
 *   const orgId = useOrgId();
 *   const path = buildOrgPath(orgId, `${jobId}/${filename}`);
 *   await supabase.storage.from("submissions").upload(path, file);
 */
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/** Return an org-prefixed storage path. */
export function buildOrgPath(
  orgId: string | null | undefined,
  path: string,
): string {
  const clean = (path || "").replace(/^\/+/, "");
  // Fall back to a stable sentinel so we never write to the bucket root even
  // if the caller races the auth-context bootstrap. This should never fire in
  // practice; if it does, the row is still recoverable via manual move.
  const safeOrg = (orgId || "no-org").trim() || "no-org";
  // If the caller already prefixed with orgId (double-invocation guard) leave
  // it alone.
  if (clean.startsWith(`${safeOrg}/`)) return clean;
  return `${safeOrg}/${clean}`;
}

/** React hook wrapper that reads the current user's org id from AuthContext. */
export function useOrgId(): string | null {
  const { orgId } = useAuth();
  return orgId;
}

// Cached lookup for non-React callers (lib helpers, workers, service classes).
let cachedOrgId: string | null = null;
let inflight: Promise<string | null> | null = null;

/** Prime the cache from AuthContext so lib helpers can skip the round-trip. */
export function primeOrgIdCache(orgId: string | null | undefined) {
  if (orgId) cachedOrgId = orgId;
}

/**
 * Resolve the current user's org id without a React context. Cached after the
 * first call. Returns null if there is no authenticated user or profile row.
 */
export async function getCurrentOrgId(): Promise<string | null> {
  if (cachedOrgId) return cachedOrgId;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) return null;
    const { data } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("user_id", uid)
      .maybeSingle();
    const org = (data as any)?.org_id ?? null;
    if (org) cachedOrgId = org;
    return org;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Async convenience: resolve orgId then build the path. */
export async function buildOrgPathAsync(path: string): Promise<string> {
  const org = await getCurrentOrgId();
  return buildOrgPath(org, path);
}

