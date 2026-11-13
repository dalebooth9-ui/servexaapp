/**
 * Pure rules that keep an engineer's report answers and photos safe while
 * drafting, restoring and submitting. Kept free of React/Supabase so they can
 * be unit-tested.
 */

const isFilled = (v: unknown): boolean => {
  if (v === undefined || v === null || v === "" || v === false) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
};

/** Answers the engineer has actually filled in (ignores internal `_` keys). */
export function countAnswers(data: Record<string, any> | null | undefined, ignore: Set<string> = new Set()): number {
  if (!data) return 0;
  return Object.entries(data).filter(([k, v]) => !k.startsWith("_") && !ignore.has(k) && isFilled(v)).length;
}

/** Stored report photos (one per storage path). */
export function countPhotos(data: Record<string, any> | null | undefined): number {
  const paths = Array.isArray(data?._site_photo_paths) ? data?._site_photo_paths : [];
  return new Set(paths.filter(Boolean)).size;
}

/** Remove duplicate photos (same storage path), keeping urls and captions aligned. */
export function dedupeSitePhotos<T extends Record<string, any>>(data: T): T {
  const paths: string[] = Array.isArray(data._site_photo_paths) ? data._site_photo_paths : [];
  if (paths.length === 0) return data;
  const urls: string[] = Array.isArray(data._site_photo_urls) ? data._site_photo_urls : [];
  const caps: string[] = Array.isArray(data._site_photo_captions) ? data._site_photo_captions : [];
  const seen = new Set<string>();
  const out = { p: [] as string[], u: [] as string[], c: [] as string[] };
  paths.forEach((p, i) => {
    const key = p || urls[i] || `#${i}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.p.push(p); out.u.push(urls[i] ?? ""); out.c.push(caps[i] ?? "");
  });
  if (out.p.length === paths.length) return data;
  return { ...data, _site_photo_paths: out.p, _site_photo_urls: out.u, _site_photo_captions: out.c };
}

export type DraftRestore = {
  merged: Record<string, any>;
  /** True when the phone copy actually added something to the form. */
  restored: boolean;
  answers: number;
  photos: number;
};

/**
 * Overlay a phone copy onto the server copy. The phone copy is only used when
 * it is newer than the server copy, and blank values never replace filled ones.
 */
export function mergeLocalDraft(opts: {
  server: Record<string, any>;
  serverUpdatedAt?: number | null;
  local: Record<string, any> | null;
  localUpdatedAt?: number | null;
  skipKeys?: Set<string>;
}): DraftRestore {
  const { server, local, skipKeys = new Set() } = opts;
  const merged = { ...server };
  const none: DraftRestore = { merged, restored: false, answers: 0, photos: 0 };
  if (!local) return none;
  const serverTs = opts.serverUpdatedAt ?? null;
  const localTs = opts.localUpdatedAt ?? null;
  // Older (or undated) phone copy never overwrites a dated server copy.
  if (serverTs != null && (localTs == null || localTs <= serverTs)) return none;
  let answers = 0;
  for (const [k, v] of Object.entries(local)) {
    if (skipKeys.has(k) || !isFilled(v)) continue;
    if (JSON.stringify(merged[k]) === JSON.stringify(v)) continue;
    merged[k] = v;
    if (!k.startsWith("_")) answers++;
  }
  const photos = Math.max(0, countPhotos(merged) - countPhotos(server));
  return { merged, restored: answers > 0 || photos > 0, answers, photos };
}

export type PhotoUploadState = "uploading" | "failed" | "done";

/** Reason submit must wait, or null when every photo is stored. */
export function photoSubmitBlocker(states: PhotoUploadState[]): string | null {
  const uploading = states.filter((s) => s === "uploading").length;
  const failed = states.filter((s) => s === "failed").length;
  if (failed) return `${failed} photo${failed === 1 ? "" : "s"} not uploaded. Tap Retry on ${failed === 1 ? "it" : "them"} before submitting.`;
  if (uploading) return `Wait for ${uploading} photo${uploading === 1 ? "" : "s"} to finish uploading.`;
  return null;
}

export const NOT_SAVED_MESSAGE = "Not sent yet. Your work is safe on this phone. Try again";
