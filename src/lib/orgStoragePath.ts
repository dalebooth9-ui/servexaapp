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
