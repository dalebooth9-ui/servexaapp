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

export type JobPhoto = {
  id: string;
  storagePath: string;
  fileName: string;
  caption: string;
  createdAt: string;
  engineerId: string | null;
  engineerName: string;
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
  /** Max output pixels on the longer edge (default 1400). */
  maxEdgePx?: number;
  /** JPEG quality 0..1 (default 0.72). */
  quality?: number;
};

/** Fetch the raw photo submission list for a job (no image download). */
export async function fetchJobPhotoMeta(jobId: string): Promise<JobPhoto[]> {
  const { data: subs } = await supabase
    .from("submissions")
    .select("id, file_url, file_name, content, created_at, engineer_id")
    .eq("job_id", jobId)
    .eq("type", "photo")
    .order("created_at", { ascending: true });

  const rows = (subs || []).filter((s: any) => !!s.file_url) as any[];
  if (!rows.length) return [];

  const engIds = [...new Set(rows.map((r) => r.engineer_id).filter(Boolean))];
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
    .map((r) => {
      const storagePath = extractStoragePath(r.file_url) || "";
      return {
        id: r.id as string,
        storagePath,
        fileName: (r.file_name as string) || "Photo",
        caption: (r.content as string) || "",
        createdAt: r.created_at as string,
        engineerId: (r.engineer_id as string) || null,
        engineerName: (r.engineer_id && nameMap[r.engineer_id]) || "",
      } as JobPhoto;
    })
    .filter((p) => p.storagePath.length > 0);
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
  const { jobId, excludePaths, maxEdgePx = 1400, quality = 0.72 } = opts;
  const meta = await fetchJobPhotoMeta(jobId);
  if (!meta.length) return [];

  const shouldExclude = (path: string): boolean => {
    if (!excludePaths || excludePaths.size === 0) return false;
    if (excludePaths.has(path)) return true;
    // Fuzzy fallback: any excluded string containing this storage path (or
    // its filename portion) means it's already embedded elsewhere.
    const fileTail = path.split("/").pop() || path;
    for (const ex of excludePaths) {
      if (!ex) continue;
      if (path.includes(ex) || ex.includes(path)) return true;
      if (fileTail && ex.includes(fileTail)) return true;
    }
    return false;
  };

  const filtered = meta.filter((m) => !shouldExclude(m.storagePath));

  const results: JobPhotoForPdf[] = [];
  // Sequential to keep memory pressure sane on jobs with lots of photos.
  for (const m of filtered) {
    try {
      const { data: signed } = await supabase.storage
        .from("submissions")
        .createSignedUrl(m.storagePath, 3600);
      if (!signed?.signedUrl) continue;
      const res = await fetch(signed.signedUrl);
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
): Set<string> {
  const out = new Set<string>();
  const pathRe = /[a-f0-9-]{8,}\/[^"'\\\s]+\.(?:jpg|jpeg|png|webp|heic|heif)/gi;
  for (const r of sheetResponses) {
    try {
      const blob = JSON.stringify(r.responses ?? {});
      const matches = blob.match(pathRe);
      if (matches) matches.forEach((m) => out.add(m));
    } catch {
      // ignore
    }
  }
  return out;
}
