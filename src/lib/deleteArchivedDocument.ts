// Admin-only delete for an archived document.
//
// Storage safety:
//   • Removes copies made by archiveScanConfirm (paths under `archive/`)
//     and the generated electronic PDF report.
//   • NEVER removes the source paper_scan_batch_items originals — those
//     live under `paper-batches/…` and may still be referenced by the batch
//     item history.
import { supabase } from "@/integrations/supabase/client";

const isArchiveOwnedPath = (p: string): boolean => {
  // Archive copies are stored under `<orgId>/archive/…` or bare `archive/…`.
  // Match either shape without accidentally sweeping `paper-batches/`.
  return /(^|\/)archive\//.test(p);
};

export async function deleteArchivedDocument(id: string): Promise<void> {
  const { data: row, error: fetchErr } = await (supabase as any)
    .from("archived_documents")
    .select("id, file_paths, report_pdf_path")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!row) return;

  const paths: string[] = [];
  for (const p of (row as any).file_paths || []) {
    if (typeof p === "string" && p.length > 0 && isArchiveOwnedPath(p)) {
      paths.push(p);
    }
  }
  const pdfPath: string | null = (row as any).report_pdf_path || null;
  if (pdfPath && isArchiveOwnedPath(pdfPath)) paths.push(pdfPath);

  if (paths.length > 0) {
    const { error: rmErr } = await supabase.storage
      .from("submissions")
      .remove(paths);
    if (rmErr) {
      // Don't block the row delete on storage cleanup — surface a console
      // warning; the row is what the user sees.
      console.warn("[deleteArchivedDocument] storage cleanup failed", rmErr);
    }
  }

  const { error: delErr } = await (supabase as any)
    .from("archived_documents")
    .delete()
    .eq("id", id);
  if (delErr) throw delErr;
}
