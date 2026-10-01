/**
 * Site photos on the online report + PDF.
 * Selection is stored per report in responses._site_photo_excluded as
 * normalised storage-path keys, so it matches every photo source.
 */
import { normalisePhotoPathForDedupe, type JobPhoto } from "@/lib/jobPhotos";
import { classifyJobPhoto } from "@/lib/exportBundleSelection";

const IMAGE_RE = /\.(?:jpg|jpeg|png|webp|gif|heic|heif)$/i;

export function isImagePhoto(p: JobPhoto): boolean {
  return IMAGE_RE.test((p.fileName || p.storagePath || "").split("?")[0]) ||
    IMAGE_RE.test((p.storagePath || "").split("?")[0]);
}

/** Images only, in the order taken (oldest first). */
export function sortSitePhotos(photos: JobPhoto[]): JobPhoto[] {
  return photos
    .filter(isImagePhoto)
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function sitePhotoKey(p: Pick<JobPhoto, "storagePath">, jobId?: string): string {
  return normalisePhotoPathForDedupe(p.storagePath, jobId);
}

/** Scanned paper pages never go to customers. */
export function isCustomerBlocked(p: JobPhoto): boolean {
  return classifyJobPhoto(p) === "scanned_sheet";
}

export function readExcluded(responses: Record<string, any> | null | undefined): Set<string> {
  const raw = responses?._site_photo_excluded;
  return new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : []);
}

export function isIncluded(p: JobPhoto, excluded: Set<string>, jobId?: string): boolean {
  if (isCustomerBlocked(p)) return false;
  return !excluded.has(sitePhotoKey(p, jobId));
}

/**
 * Pick auto before/after photos from the visit: photos on the same day as the
 * newest photo. Before = first, After = latest (only when different).
 */
export function pickAutoBeforeAfter(photos: JobPhoto[]): { before: JobPhoto | null; after: JobPhoto | null } {
  const pool = sortSitePhotos(photos).filter((p) => !isCustomerBlocked(p) && p.source !== "checklist");
  if (!pool.length) return { before: null, after: null };
  const last = pool[pool.length - 1];
  const day = new Date(last.createdAt).toDateString();
  const visit = pool.filter((p) => new Date(p.createdAt).toDateString() === day);
  const before = visit[0] || null;
  const after = visit.length > 1 ? visit[visit.length - 1] : null;
  return { before, after };
}

export function formatTaken(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
