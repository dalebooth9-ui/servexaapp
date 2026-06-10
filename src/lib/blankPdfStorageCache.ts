import { supabase } from "@/integrations/supabase/client";

const BUCKET = "blank-template-pdfs";

/** Stable cache path for a blank-template PDF. */
export function blankPdfStoragePath(
  tpl: { id?: string; updated_at?: string; name?: string },
  handfill: boolean,
): string {
  const id = tpl.id || tpl.name || "unknown";
  const v = (tpl.updated_at || "v0").replace(/[^0-9a-zA-Z_-]/g, "");
  const variant = handfill ? "handfill" : "standard";
  return `${id}/${v}-${variant}.pdf`;
}

/** Returns the cached Blob if present, else null. Network errors → null. */
export async function fetchCachedBlankPdf(path: string): Promise<Blob | null> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/** Best-effort upload — never throws. */
export async function uploadCachedBlankPdf(path: string, blob: Blob): Promise<void> {
  try {
    await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: true,
    });
  } catch {
    /* swallow — cache is best-effort */
  }
}
