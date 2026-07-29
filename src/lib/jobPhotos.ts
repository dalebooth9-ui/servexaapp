/**
 * jobPhotos — single source of truth for a job's photo submissions.
 *
 * Used by:
 *   - JobPdfReport ("Export PDF Report")
 *   - CustomerReportPdf (send-to-customer report & preview)
 *   - The Job Photos tab
 *
 * Guarantees:
 *   - Same query + filtering everywhere → the tab and the report always agree
 *     on what photos a job has.
 *   - Photos already embedded inside form fields (photo_gallery columns,
 *     photo fields, etc.) can be excluded via `excludePaths` so the
 *     job-level Photos section doesn't duplicate them.
 *   - Images are downscaled + re-encoded as JPEG for PDF embedding so a job
 *     with hundreds of high-res mobile photos doesn't produce a 100MB PDF.
 */
import { supabase } from "@/integrations/supabase/client";
import { extractStoragePath } from "@/lib/fileUtils";
import { parseStorageRef } from "@/lib/durableStorageRef";

export type JobPhoto = {
  id: string;
  storagePath: string;
  bucket: string;
  fileName: string;
  caption: string;
  createdAt: string;
  engineerId: string | null;
  engineerName: string;
  source?: "submission" | "whatsapp" | "site_response" | "defect" | "checklist" | "document";
  displayOrder?: number | null;
  fallbackUrl?: string | null;
};

export type JobPhotoForPdf = JobPhoto & {
  dataUrl: string;
  format: "JPEG";
  natW: number;
  natH: number;
  /** Approximate encoded byte size — useful for logging/QA. */
  bytes: number;
};

type LoadOpts = {
  jobId: string;
  /**
   * Storage paths (or fragments) already embedded elsewhere in the report.
   * A submission is skipped if its storage path appears in this set.
   */
  excludePaths?: Set<string>;
  /**
   * When provided, only photos whose `JobPhoto.id` is in this set are loaded.
   * Used by the export dialog picker so exports honour the user's ticks.
   */
  includeIds?: Set<string>;
  /** Max output pixels on the longer edge (default 1400). */
  maxEdgePx?: number;
  /** JPEG quality 0..1 (default 0.72). */
  quality?: number;
};

const IMAGE_NAME_RE = /\.(?:jpg|jpeg|png|webp|gif|heic|heif)$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isImageName(name?: string | null): boolean {
  return !!name && IMAGE_NAME_RE.test(name.split("?")[0] || "");
}

function getFileNameFromPath(path?: string | null): string {
  return (path || "").split("?")[0].split("/").pop() || "Photo";
}

function getStorageRef(input?: string | null, defaultBucket = "submissions"): { bucket: string; path: string } | null {
  if (!input) return null;
  const parsed = parseStorageRef(input, defaultBucket);
  if (parsed?.path) return parsed;
  const extracted = extractStoragePath(input);
  if (extracted) return { bucket: defaultBucket, path: extracted };
  return null;
}

export function normalisePhotoPathForDedupe(pathOrUrl?: string | null, jobId?: string): string {
  const ref = getStorageRef(pathOrUrl, "submissions");
  let path = ref?.path || (pathOrUrl || "").trim();
  if (!path) return "";
  try { path = decodeURIComponent(path); } catch { /* keep raw */ }
  path = path.replace(/^\/+/, "").split("?")[0];
  if (jobId) {
    const jobIdx = path.indexOf(`${jobId}/`);
    if (jobIdx >= 0) path = path.slice(jobIdx);
  } else {
    const parts = path.split("/");
    if (parts.length > 2 && UUID_RE.test(parts[0]) && UUID_RE.test(parts[1])) {
      path = parts.slice(1).join("/");
    }
  }
  return path.toLowerCase();
}

async function getJobOrgId(jobId: string): Promise<string | null> {
  try {
    const { data } = await supabase.from("jobs").select("org_id").eq("id", jobId).maybeSingle();
    return ((data as any)?.org_id as string) || null;
  } catch {
    return null;
  }
}

export async function createSubmissionPhotoSignedUrl(
  pathOrUrl: string,
  jobId?: string,
  expiresInSec = 3600,
): Promise<{ signedUrl: string; bucket: string; path: string } | null> {
  const ref = getStorageRef(pathOrUrl, "submissions");
  if (!ref) {
    return /^https?:\/\//i.test(pathOrUrl) ? { signedUrl: pathOrUrl, bucket: "", path: pathOrUrl } : null;
  }

  const inferredJobId = jobId || (() => {
    const parts = ref.path.replace(/^\/+/, "").split("/");
    return UUID_RE.test(parts[0]) ? parts[0] : null;
  })();
  const orgId = inferredJobId ? await getJobOrgId(inferredJobId) : null;
  const candidates = [ref.path.replace(/^\/+/, "")];
  if (orgId && !candidates[0].startsWith(`${orgId}/`)) {
    candidates.push(`${orgId}/${candidates[0]}`);
  }

  for (const candidate of Array.from(new Set(candidates))) {
    try {
      const { data } = await supabase.storage.from(ref.bucket).createSignedUrl(candidate, expiresInSec);
      if (data?.signedUrl) return { signedUrl: data.signedUrl, bucket: ref.bucket, path: candidate };
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** Fetch the raw photo submission list for a job (no image download). */
export async function fetchJobPhotoMeta(jobId: string): Promise<JobPhoto[]> {
  const [subsRes, sheetsRes, defectsRes, checklistRes, docsRes] = await Promise.all([
    supabase
      .from("submissions")
      .select("id, type, file_url, file_name, content, created_at, engineer_id, display_order, whatsapp_message_id")
      .eq("job_id", jobId)
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("job_sheet_responses")
      .select("id, responses, submitted_at, created_at, submitted_by")
      .eq("job_id", jobId)
      .order("submitted_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("defects")
      .select("id, reported_by, title, photo_url, photos, created_at")
      .eq("job_id", jobId),
    supabase
      .from("job_photo_checklist_responses")
      .select("id, captured_by, photo_url, before_photo_url, after_photo_url, notes, captured_at")
      .eq("job_id", jobId),
    supabase
      .from("job_documents")
      .select("id, created_by, file_url, file_name, label, created_at")
      .eq("job_id", jobId),
  ]);

  const photos: JobPhoto[] = [];

  for (const s of ((subsRes.data || []) as any[])) {
    const isPhoto = s.type === "photo" || (s.type === "document" && isImageName(s.file_name));
    if (!isPhoto || !s.file_url) continue;
    const ref = getStorageRef(s.file_url, "submissions");
    if (!ref) continue;
    photos.push({
      id: `sub:${s.id}`,
      bucket: ref.bucket,
      storagePath: ref.path,
      fileName: (s.file_name as string) || getFileNameFromPath(ref.path),
      caption: (s.content as string) || "",
      createdAt: s.created_at as string,
      engineerId: (s.engineer_id as string) || null,
      engineerName: "",
      // WhatsApp intake is identified by `whatsapp_message_id` (the webhook
      // writes friendly, human file names — it never puts "whatsapp" in them).
      source: s.whatsapp_message_id
        ? "whatsapp"
        : s.type === "document"
          ? "document"
          : "submission",
      displayOrder: s.display_order ?? null,
      fallbackUrl: s.file_url,
    });
  }

  for (const r of ((sheetsRes.data || []) as any[])) {
    const responses = (r.responses || {}) as Record<string, any>;
    const paths = Array.isArray(responses._site_photo_paths) ? responses._site_photo_paths as string[] : [];
    const urls = Array.isArray(responses._site_photo_urls) ? responses._site_photo_urls as string[] : [];
    const captions = Array.isArray(responses._site_photo_captions) ? responses._site_photo_captions as string[] : [];
    const count = Math.max(paths.length, urls.length, captions.length);
    for (let i = 0; i < count; i++) {
      const rawRef = paths[i] || urls[i];
      const ref = getStorageRef(rawRef, "submissions");
      if (!ref) continue;
      photos.push({
        id: `site:${r.id}:${i}`,
        bucket: ref.bucket,
        storagePath: ref.path,
        fileName: getFileNameFromPath(ref.path),
        caption: captions[i] || `Photo ${i + 1}`,
        createdAt: (r.submitted_at || r.created_at) as string,
        engineerId: (r.submitted_by as string) || null,
        engineerName: "",
        source: "site_response",
        displayOrder: i,
        fallbackUrl: urls[i] || null,
      });
    }
  }

  for (const d of ((defectsRes.data || []) as any[])) {
    const urls = [d.photo_url, ...(Array.isArray(d.photos) ? d.photos : [])].filter(Boolean) as string[];
    urls.forEach((url, i) => {
      const ref = getStorageRef(url, "submissions");
      if (!ref) return;
      photos.push({
        id: `def:${d.id}:${i}`,
        bucket: ref.bucket,
        storagePath: ref.path,
        fileName: getFileNameFromPath(ref.path),
        caption: d.title || "Defect photo",
        createdAt: d.created_at,
        engineerId: d.reported_by || null,
        engineerName: "",
        source: "defect",
        displayOrder: null,
        fallbackUrl: url,
      });
    });
  }

  for (const c of ((checklistRes.data || []) as any[])) {
    const entries: Array<[string | null, string]> = [
      [c.photo_url, c.notes || "Checklist photo"],
      [c.before_photo_url, c.notes ? `Before — ${c.notes}` : "Before"],
      [c.after_photo_url, c.notes ? `After — ${c.notes}` : "After"],
    ];
    entries.forEach(([url, caption], i) => {
      const ref = getStorageRef(url, "submissions");
      if (!ref) return;
      photos.push({
        id: `chk:${c.id}:${i}`,
        bucket: ref.bucket,
        storagePath: ref.path,
        fileName: getFileNameFromPath(ref.path),
        caption,
        createdAt: c.captured_at,
        engineerId: c.captured_by || null,
        engineerName: "",
        source: "checklist",
        displayOrder: null,
        fallbackUrl: url,
      });
    });
  }

  for (const d of ((docsRes.data || []) as any[])) {
    if (!isImageName(d.file_name)) continue;
    const ref = getStorageRef(d.file_url, "submissions");
    if (!ref) continue;
    photos.push({
      id: `doc:${d.id}`,
      bucket: ref.bucket,
      storagePath: ref.path,
      fileName: d.file_name || getFileNameFromPath(ref.path),
      caption: d.label || "Document photo",
      createdAt: d.created_at,
      engineerId: d.created_by || null,
      engineerName: "",
      source: "document",
      displayOrder: null,
      fallbackUrl: d.file_url,
    });
  }

  const deduped = new Map<string, JobPhoto>();
  for (const p of photos) {
    const key = normalisePhotoPathForDedupe(p.storagePath, jobId);
    if (!key) continue;
    const existing = deduped.get(key);
    if (!existing) deduped.set(key, p);
    else if ((existing.source === "submission" || existing.source === "whatsapp") && p.source === "site_response" && existing.displayOrder == null) {
      deduped.set(key, { ...existing, caption: existing.caption || p.caption, displayOrder: p.displayOrder });
    }
    else if (!existing.caption && p.caption) deduped.set(key, { ...p, displayOrder: existing.displayOrder ?? p.displayOrder });
  }

  const rows = Array.from(deduped.values());
  if (!rows.length) return [];

  const engIds = [...new Set(rows.map((r) => r.engineerId).filter(Boolean))];
  const nameMap: Record<string, string> = {};
  if (engIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", engIds as string[]);
    (profiles || []).forEach((p: any) => {
      nameMap[p.user_id] = p.full_name || "";
    });
  }

  return rows
    .map((r) => ({
      ...r,
      engineerName: (r.engineerId && nameMap[r.engineerId]) || "",
    }))
    .sort((a, b) => {
      const ao = a.displayOrder ?? null;
      const bo = b.displayOrder ?? null;
      if (ao !== null && bo !== null && ao !== bo) return ao - bo;
      if (ao !== null && bo === null) return -1;
      if (ao === null && bo !== null) return 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
}

/**
 * Downscale + re-encode an image blob as JPEG so it embeds compactly in a PDF.
 * Preserves aspect ratio; skips upscaling.
 */
async function compressForPdf(
  blob: Blob,
  maxEdgePx: number,
  quality: number,
): Promise<{ dataUrl: string; width: number; height: number; bytes: number }> {
  const bitmapUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = bitmapUrl;
    });
    const natW = img.naturalWidth || 1;
    const natH = img.naturalHeight || 1;
    const longer = Math.max(natW, natH);
    const scale = longer > maxEdgePx ? maxEdgePx / longer : 1;
    const w = Math.max(1, Math.round(natW * scale));
    const h = Math.max(1, Math.round(natH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d ctx");
    // Paint white behind transparent PNGs so JPEG doesn't render black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    // Rough byte size from base64 length.
    const b64 = dataUrl.split(",")[1] || "";
    const bytes = Math.floor((b64.length * 3) / 4);
    return { dataUrl, width: w, height: h, bytes };
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

/**
 * Load and compress a job's photos for PDF embedding.
 * Photos with paths present in `excludePaths` are skipped.
 */
export async function loadJobPhotosForPdf(opts: LoadOpts): Promise<JobPhotoForPdf[]> {
  const { jobId, excludePaths, includeIds, maxEdgePx = 1400, quality = 0.72 } = opts;
  const meta = await fetchJobPhotoMeta(jobId);
  if (!meta.length) return [];

  const shouldExclude = (path: string): boolean => {
    if (!excludePaths || excludePaths.size === 0) return false;
    const pathKey = normalisePhotoPathForDedupe(path, jobId);
    if (excludePaths.has(path)) return true;
    if (pathKey && excludePaths.has(pathKey)) return true;
    // Fuzzy fallback: any excluded string containing this storage path (or
    // its filename portion) means it's already embedded elsewhere.
    const fileTail = path.split("/").pop() || path;
    for (const ex of excludePaths) {
      if (!ex) continue;
      const exKey = normalisePhotoPathForDedupe(ex, jobId);
      if (pathKey && exKey && pathKey === exKey) return true;
      if (path.includes(ex) || ex.includes(path)) return true;
      if (fileTail && ex.includes(fileTail)) return true;
    }
    return false;
  };

  const filtered = meta.filter((m) => {
    if (shouldExclude(m.storagePath)) return false;
    if (includeIds && !includeIds.has(m.id)) return false;
    return true;
  });

  const results: JobPhotoForPdf[] = [];
  // Sequential to keep memory pressure sane on jobs with lots of photos.
  for (const m of filtered) {
    try {
      const signed = await createSubmissionPhotoSignedUrl(
        m.bucket ? `storage://${m.bucket}/${m.storagePath}` : (m.fallbackUrl || m.storagePath),
        jobId,
        3600,
      );
      const url = signed?.signedUrl || m.fallbackUrl;
      if (!url) continue;
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const compressed = await compressForPdf(blob, maxEdgePx, quality);
      results.push({
        ...m,
        dataUrl: compressed.dataUrl,
        format: "JPEG",
        natW: compressed.width,
        natH: compressed.height,
        bytes: compressed.bytes,
      });
    } catch {
      // Skip broken images silently — one bad photo shouldn't fail the whole report.
    }
  }
  return results;
}

/**
 * Best-effort collection of storage paths already referenced inside submitted
 * job-sheet responses (photo_gallery columns, photo fields, etc.). Used to
 * dedupe against the job-level Photos section.
 *
 * We scan the raw JSON blob for any substring that looks like a submissions
 * storage path, plus every string that looks like a filename tail. This is
 * intentionally broad — a false positive just means one photo appears once
 * instead of twice.
 */
export function collectEmbeddedPhotoPaths(
  sheetResponses: Array<{ responses: unknown }>,
  jobId?: string,
): Set<string> {
  const out = new Set<string>();
  const pathRe = /(?:[a-f0-9-]{36}\/)?[a-f0-9-]{8,}\/[^"'\\\s]+\.(?:jpg|jpeg|png|webp|gif|heic|heif)/gi;
  const scan = (value: unknown, key = "") => {
    if (key.startsWith("_site_photo")) return;
    if (typeof value === "string") {
      const ref = getStorageRef(value, "submissions");
      if (ref?.path && isImageName(ref.path)) out.add(normalisePhotoPathForDedupe(ref.path, jobId) || ref.path);
      const matches = value.match(pathRe);
      if (matches) matches.forEach((m) => out.add(normalisePhotoPathForDedupe(m, jobId) || m));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v) => scan(v, key));
      return;
    }
    if (value && typeof value === "object") {
      Object.entries(value as Record<string, unknown>).forEach(([k, v]) => scan(v, k));
    }
  };
  for (const r of sheetResponses) {
    try {
      scan(r.responses ?? {});
    } catch {
      // ignore
    }
  }
  return out;
}
