/**
 * Durable Supabase Storage references.
 *
 * We deliberately do NOT store signed URLs in the database — they expire.
 * Instead we store a durable reference in one of two forms:
 *
 *   1. `storage://<bucket>/<path>` (preferred going forward)
 *   2. A plain object path (bucket implied by column/context)
 *
 * Legacy rows may still contain signed or public URLs
 * (e.g. `https://…/storage/v1/object/(sign|public)/<bucket>/<path>?token=…`).
 * `parseStorageRef` normalises all of these into `{ bucket, path }` so the
 * viewer can always mint a FRESH signed URL at display time.
 */
import { supabase } from "@/integrations/supabase/client";

export interface StorageRef {
  bucket: string;
  path: string;
}

/**
 * Parse any of the supported reference shapes into `{ bucket, path }`.
 * Returns null if it can't work out both a bucket and a path.
 *
 * `defaultBucket` is used when the input is a bare storage path (no scheme,
 * no URL) — e.g. legacy `customer_paperwork` rows.
 */
export function parseStorageRef(
  input: string | null | undefined,
  defaultBucket?: string,
): StorageRef | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  // storage://bucket/path
  if (raw.startsWith("storage://")) {
    const rest = raw.slice("storage://".length);
    const slash = rest.indexOf("/");
    if (slash < 1) return null;
    return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1) };
  }

  // Full Supabase URL — signed or public
  const urlMatch = raw.match(/\/object\/(?:public|sign)\/([^/]+)\/([^?#]+)/);
  if (urlMatch) {
    try {
      return { bucket: urlMatch[1], path: decodeURIComponent(urlMatch[2]) };
    } catch {
      return { bucket: urlMatch[1], path: urlMatch[2] };
    }
  }

  // Any other absolute URL — can't safely map to a bucket.
  if (raw.startsWith("http://") || raw.startsWith("https://")) return null;

  if (!defaultBucket) return null;
  return { bucket: defaultBucket, path: raw };
}

/** Turn a bucket + path into the durable reference string we now persist. */
export function buildDurableRef(bucket: string, path: string): string {
  return `storage://${bucket}/${path}`;
}

/**
 * Resolve any reference (durable ref, path, or legacy signed URL) into a
 * FRESH signed URL. Returns null if the reference can't be resolved.
 */
export async function resolveToSignedUrl(
  input: string | null | undefined,
  defaultBucket?: string,
  expiresInSec = 3600,
): Promise<string | null> {
  const ref = parseStorageRef(input, defaultBucket);
  if (!ref) {
    // Non-Supabase absolute URL — hand it back untouched.
    if (typeof input === "string" && /^https?:\/\//.test(input)) return input;
    return null;
  }
  const { data } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.path, expiresInSec);
  return data?.signedUrl ?? null;
}

/**
 * Batch resolve a list of refs, grouping by bucket so we do one round-trip
 * per bucket. Preserves input order in the returned array; entries that
 * couldn't be resolved come back as null.
 */
export async function resolveManyToSignedUrls(
  inputs: (string | null | undefined)[],
  defaultBucket?: string,
  expiresInSec = 3600,
): Promise<(string | null)[]> {
  const parsed = inputs.map((i) => parseStorageRef(i, defaultBucket));
  const byBucket = new Map<string, Set<string>>();
  parsed.forEach((r) => {
    if (!r) return;
    if (!byBucket.has(r.bucket)) byBucket.set(r.bucket, new Set());
    byBucket.get(r.bucket)!.add(r.path);
  });

  const signed: Record<string, Record<string, string>> = {};
  await Promise.all(
    Array.from(byBucket.entries()).map(async ([bucket, paths]) => {
      const list = Array.from(paths);
      const { data } = await supabase.storage.from(bucket).createSignedUrls(list, expiresInSec);
      const map: Record<string, string> = {};
      (data || []).forEach((r) => {
        if (r.path && r.signedUrl) map[r.path] = r.signedUrl;
      });
      signed[bucket] = map;
    }),
  );

  return parsed.map((r, i) => {
    if (r) return signed[r.bucket]?.[r.path] ?? null;
    const raw = inputs[i];
    return typeof raw === "string" && /^https?:\/\//.test(raw) ? raw : null;
  });
}
