// Resolve a path in the `submissions` bucket, transparently handling legacy
// rows whose stored path is missing the current organisation prefix. Returns
// the working path (either the original or an org-prefixed variant) or null
// if neither variant produces a signed URL.
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/orgStoragePath";

const EXPIRES = 60 * 60;

export type ResolvedSignedUrl = {
  path: string;
  signedUrl: string;
};

export async function resolveSubmissionsSignedUrl(
  path: string,
): Promise<ResolvedSignedUrl | null> {
  if (!path) return null;
  const clean = path.replace(/^\/+/, "");
  const attempt = async (p: string) => {
    const { data, error } = await supabase.storage
      .from("submissions")
      .createSignedUrl(p, EXPIRES);
    if (error || !data?.signedUrl) return null;
    return { path: p, signedUrl: data.signedUrl } as ResolvedSignedUrl;
  };

  // 1. Try as-is (covers modern org-prefixed rows and truly root-level legacy).
  const first = await attempt(clean);
  if (first) return first;

  // 2. If it doesn't already start with an org-shaped UUID segment, retry with
  //    the current user's org prefix (repairs legacy paper-batches/... rows).
  const orgId = await getCurrentOrgId();
  if (orgId && !clean.startsWith(`${orgId}/`)) {
    const prefixed = `${orgId}/${clean}`;
    const second = await attempt(prefixed);
    if (second) return second;
  }
  return null;
}

export async function resolveSubmissionsSignedUrls(
  paths: string[] | null | undefined,
): Promise<{
  urls: ResolvedSignedUrl[];
  failed: string[];
}> {
  const urls: ResolvedSignedUrl[] = [];
  const failed: string[] = [];
  for (const p of paths || []) {
    const r = await resolveSubmissionsSignedUrl(p);
    if (r) urls.push(r);
    else failed.push(p);
  }
  return { urls, failed };
}

/**
 * Parse the storage path back out of a Supabase signed/public URL that points
 * at the `submissions` bucket. Used when a table stored only a signed URL
 * (e.g. legacy `job_documents.file_url`) and we need to re-issue a fresh
 * signed URL or read the raw file.
 */
export function submissionsPathFromSignedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/object\/(?:sign|public)\/submissions\/([^?#]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}
