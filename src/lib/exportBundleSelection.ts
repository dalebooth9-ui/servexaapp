/**
 * Shared bundling logic for the Export PDF / Word / Send-to-Customer flows.
 *
 * - Classifies a job's photos so the "photos to send to the client" picker
 *   can tick genuine evidence by default and untick scanned-sheet page
 *   images and email-leftover attachments.
 * - Persists the user's picks per-job in localStorage so re-exports are
 *   instant and the choices stick until they're changed.
 */
import type { JobPhoto } from "@/lib/jobPhotos";

export type PhotoKind = "evidence" | "scanned_sheet" | "email_leftover" | "other";

const SCAN_PATH_RE = /(?:paper[-_]?scans?|batch[-_]?scans?|scan[-_]?batch|ocr[-_]?source|scan_page_)/i;
const REVIEW_SUFFIX_RE = / — email attachment, review$/i;

/**
 * Classify a photo so the picker can tick the right things by default.
 * - `evidence`  — App camera / gallery / WhatsApp / checklist / defect photos → default ON.
 * - `scanned_sheet` — page images from paper-scan intake → default OFF, badge "Scanned sheet".
 * - `email_leftover` — inbound email image attachments still awaiting review
 *   (filename still carries the "— email attachment, review" suffix) → default OFF.
 * - `other` — anything else (incl. email attachments whose review flag has
 *   been cleared) → default ON.
 */
export function classifyJobPhoto(photo: JobPhoto): PhotoKind {
  const path = (photo.storagePath || "").toLowerCase();
  const name = (photo.fileName || "");
  const caption = (photo.caption || "").toLowerCase();
  const src = photo.source;

  if (src === "document") {
    if (SCAN_PATH_RE.test(path) || SCAN_PATH_RE.test(name.toLowerCase()) || caption.startsWith("scan")) {
      return "scanned_sheet";
    }
    // Only default-off when the reviewer hasn't cleared the flag yet.
    if (REVIEW_SUFFIX_RE.test(name) || REVIEW_SUFFIX_RE.test(caption)) {
      return "email_leftover";
    }
    return "other";
  }
  if (src === "submission" || src === "site_response" || src === "checklist" || src === "defect") {
    return "evidence";
  }
  return "other";
}

/** True if the classification default is "ticked". */
export function defaultChecked(kind: PhotoKind): boolean {
  return kind === "evidence" || kind === "other";
}

export function badgeForKind(kind: PhotoKind): { label: string; tone: "amber" | "slate" } | null {
  if (kind === "scanned_sheet") return { label: "Scanned sheet", tone: "amber" };
  if (kind === "email_leftover") return { label: "Email attachment", tone: "slate" };
  return null;
}

// ── Per-job preference persistence ─────────────────────────────────────────

export interface ExportBundlePrefs {
  v: 1;
  /**
   * "auto" = smart defaults recomputed on every open (new photos appear
   * ticked/unticked based on their kind). "custom" = user has curated
   * the list, so we honour `photoIds` verbatim.
   */
  photoMode: "auto" | "custom";
  photoIds: string[];
  sheetIds: string[];
  includeFilledSheets: boolean;
  includePhotos: boolean;
  includeFieldReports: boolean;
  includeCerts: boolean;
}

const KEY = (jobId: string) => `job-export-prefs:${jobId}`;

export function loadPrefs(jobId: string): ExportBundlePrefs | null {
  try {
    const raw = localStorage.getItem(KEY(jobId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.v !== 1) return null;
    return parsed as ExportBundlePrefs;
  } catch {
    return null;
  }
}

export function savePrefs(jobId: string, prefs: ExportBundlePrefs): void {
  try {
    localStorage.setItem(KEY(jobId), JSON.stringify(prefs));
  } catch {
    /* quota / private mode → ignore */
  }
}

/** Fresh defaults for a job that has no saved prefs yet. */
export function defaultPrefs(): ExportBundlePrefs {
  return {
    v: 1,
    photoMode: "auto",
    photoIds: [],
    sheetIds: [],
    includeFilledSheets: true,
    includePhotos: true,
    includeFieldReports: true,
    includeCerts: true,
  };
}

/** Given the photos on the job and current prefs, compute the ticked ids. */
export function resolvePhotoSelection(
  photos: JobPhoto[],
  prefs: ExportBundlePrefs,
): Set<string> {
  if (prefs.photoMode === "custom") {
    const set = new Set(prefs.photoIds);
    // Drop ids that no longer exist on the job.
    return new Set(photos.filter((p) => set.has(p.id)).map((p) => p.id));
  }
  // Auto mode: recompute defaults every time.
  return new Set(
    photos.filter((p) => defaultChecked(classifyJobPhoto(p))).map((p) => p.id),
  );
}
