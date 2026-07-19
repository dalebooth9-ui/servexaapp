import { supabase } from "@/integrations/supabase/client";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";

export type DetectedSheet = {
  page_indices: number[];
  template_id: string | null;
  template_name?: string;
  confidence: number;
  needs_matching?: boolean;
  reason?: string;
};

/**
 * Upload page-image files and create a paper_scan_batches row + one item per
 * detected sheet, then kick the background processor. Returns the batch id.
 */
export async function createScanBatchFromSheets(params: {
  orgId: string;
  userId: string;
  pageFiles: File[]; // ordered by page index
  sheets: DetectedSheet[];
  sourceLabel?: string;
  mode?: "job" | "archive";
}): Promise<string> {
  const { orgId, userId, pageFiles, sheets, sourceLabel, mode = "job" } = params;
  if (!orgId || pageFiles.length === 0 || sheets.length === 0) {
    throw new Error("Nothing to batch.");
  }


  // 1. Create batch row.
  const { data: batch, error: batchErr } = await supabase
    .from("paper_scan_batches")
    .insert({
      org_id: orgId,
      created_by: userId,
      status: "processing",
      total_items: sheets.length,
      processed_items: 0,
      mode,
    } as any)
    .select("id")
    .single();
  if (batchErr) throw batchErr;
  const batchId = (batch as any).id as string;


  // 2. Upload every page once, remember its stored path.
  const stamp = Date.now();
  const uploadedPaths: string[] = [];
  for (let i = 0; i < pageFiles.length; i++) {
    const f = pageFiles[i];
    const extRaw = f.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const ext = extRaw.length > 4 ? "jpg" : extRaw;
    const rel = `paper-batches/${batchId}/page-${String(i + 1).padStart(3, "0")}-${stamp}.${ext}`;
    const fullPath = await buildOrgPathAsync(rel);
    const { error: upErr } = await supabase.storage
      .from("submissions")
      .upload(fullPath, f, {
        upsert: true,
        contentType: f.type || "image/jpeg",
      });
    if (upErr) throw upErr;
    uploadedPaths.push(rel);
  }

  // 3. Create one item per detected sheet, referencing its page paths.
  const itemRows = sheets.map((s) => ({
    batch_id: batchId,
    org_id: orgId,
    image_paths: s.page_indices
      .map((idx) => uploadedPaths[idx])
      .filter(Boolean),
    detected_template_id: s.template_id,
    confidence: s.confidence,
    mode,
    // status left at default so the processor picks it up
  }));


  const { error: itemsErr } = await supabase
    .from("paper_scan_batch_items")
    .insert(itemRows as any);
  if (itemsErr) throw itemsErr;

  // 4. Kick the processor (fire-and-forget).
  supabase.functions
    .invoke("process-paper-scan-batch", { body: { batch_id: batchId } })
    .catch((e) => console.error("processor kick-off failed", e));

  if (sourceLabel) {
    // Best-effort audit trail; ignore failure.
    try {
      await supabase.from("job_activity_log").insert({
        entity_type: "paper_scan_batch",
        entity_id: batchId,
        action: "batch_created",
        actor_id: userId,
        details: { source: sourceLabel, sheets: sheets.length, pages: pageFiles.length },
      } as any);
    } catch {}
  }

  return batchId;
}
