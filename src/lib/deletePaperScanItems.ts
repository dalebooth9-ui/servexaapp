// Bulk delete for paper_scan_batch_items.
//
// Removes the queue rows and best-effort cleans up their source images
// from the `submissions` bucket. Storage cleanup failures are logged
// but never block row deletion — the row is the primary UX artefact.
import { supabase } from "@/integrations/supabase/client";

export async function deletePaperScanItems(ids: string[]): Promise<void> {
  if (!ids.length) return;

  const { data: rows, error: fetchErr } = await (supabase as any)
    .from("paper_scan_batch_items")
    .select("id, image_paths")
    .in("id", ids);
  if (fetchErr) throw fetchErr;

  const paths: string[] = [];
  for (const r of (rows as any[]) || []) {
    for (const p of r.image_paths || []) {
      if (typeof p === "string" && p.length > 0) paths.push(p);
    }
  }

  if (paths.length > 0) {
    // Chunk to keep the URL manageable
    const CHUNK = 100;
    for (let i = 0; i < paths.length; i += CHUNK) {
      const slice = paths.slice(i, i + CHUNK);
      const { error: rmErr } = await supabase.storage
        .from("submissions")
        .remove(slice);
      if (rmErr) {
        console.warn("[deletePaperScanItems] storage cleanup failed", rmErr);
      }
    }
  }

  const { error: delErr } = await (supabase as any)
    .from("paper_scan_batch_items")
    .delete()
    .in("id", ids);
  if (delErr) throw delErr;
}
