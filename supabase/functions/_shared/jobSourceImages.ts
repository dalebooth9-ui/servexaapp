// Load job photos/documents for the AI sheet readers, server-side, AFTER
// checking the caller is signed in and the job + every file belong to the
// caller's own company. Used by "Convert to digital report" on job media.
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { resolveCaller } from "./callerOrg.ts";

export type JobSource = { job_id?: unknown; submission_ids?: unknown };
type Img = { image_base64: string; mime_type: string };

const MAX_FILES = 8;
const MAX_BYTES = 15 * 1024 * 1024;

function parseRef(raw: string): { bucket: string; path: string } | null {
  const s = (raw || "").trim();
  if (!s) return null;
  if (s.startsWith("storage://")) {
    const rest = s.slice(10);
    const i = rest.indexOf("/");
    return i > 0 ? { bucket: rest.slice(0, i), path: rest.slice(i + 1) } : null;
  }
  const m = s.match(/\/object\/(?:public|sign)\/([^/]+)\/([^?#]+)/);
  if (m) return { bucket: m[1], path: decodeURIComponent(m[2]) };
  if (/^https?:\/\//.test(s)) return null;
  return { bucket: "submissions", path: s };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadJobSourceImages(
  req: Request,
  source: JobSource,
): Promise<{ images: Img[]; orgId: string; userId: string } | { error: string; status: number }> {
  const caller = await resolveCaller(req);
  if ("error" in caller) return caller;
  const jobId = typeof source.job_id === "string" ? source.job_id : "";
  const ids = Array.isArray(source.submission_ids)
    ? (source.submission_ids as unknown[]).filter((x): x is string => typeof x === "string" && UUID.test(x))
    : [];
  if (!UUID.test(jobId) || ids.length === 0) return { error: "Choose at least one photo from the job", status: 400 };
  if (ids.length > MAX_FILES) return { error: `Convert up to ${MAX_FILES} pages at a time`, status: 400 };

  const admin = caller.admin as any;
  const { data: job } = await admin.from("jobs").select("id, org_id").eq("id", jobId).maybeSingle();
  if (!job || job.org_id !== caller.orgId) return { error: "This job does not belong to your company", status: 403 };

  const { data: rows } = await admin.from("submissions").select("id, job_id, file_url, file_name").in("id", ids);
  const byId = new Map(((rows as any[]) || []).map((r) => [r.id, r]));
  const images: Img[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row || row.job_id !== jobId) return { error: "That photo is not on this job", status: 403 };
    const ref = parseRef(row.file_url || "");
    if (!ref || ref.bucket !== "submissions") return { error: "That file can't be read", status: 400 };
    const first = ref.path.split("/")[0];
    // Org-scoped paths start with the owning company id — it must be ours.
    if (UUID.test(first) && first !== caller.orgId && first !== jobId) {
      return { error: "That photo does not belong to your company", status: 403 };
    }
    let { data: blob, error } = await admin.storage.from(ref.bucket).download(ref.path);
    // Older rows point at the pre-company-folder path; files now live under
    // the caller's company folder (never another company's).
    if ((error || !blob) && first !== caller.orgId) {
      ({ data: blob, error } = await admin.storage.from(ref.bucket).download(`${caller.orgId}/${ref.path}`));
    }
    if (error || !blob) return { error: "Couldn't open the photo from storage", status: 404 };
    if (blob.size > MAX_BYTES) return { error: "That photo is too large to read (over 15 MB)", status: 400 };
    const name = String(row.file_name || ref.path).toLowerCase();
    const mime = blob.type && blob.type !== "application/octet-stream"
      ? blob.type
      : name.endsWith(".pdf") ? "application/pdf" : name.endsWith(".png") ? "image/png" : "image/jpeg";
    if (!mime.startsWith("image/") && mime !== "application/pdf") {
      return { error: "Only photos or PDFs can be converted", status: 400 };
    }
    images.push({ image_base64: encode(new Uint8Array(await blob.arrayBuffer())), mime_type: mime });
  }
  return { images, orgId: caller.orgId, userId: caller.userId };
}
