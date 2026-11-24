import { supabase } from "@/integrations/supabase/client";

export type SheetItem = { id: string; batch_id: string; org_id?: string; status: string; image_paths: string[]; detected_template_id?: string | null; mode?: string | null };

const EDITABLE = new Set(["ready", "low_confidence", "failed", "pending"]);
export const canEditSheet = (i: Pick<SheetItem, "status">) => EDITABLE.has(i.status);

/** Page order within a scan comes from the stored page file name (page-001, page-002…). */
export function orderInBatch<T extends Pick<SheetItem, "image_paths">>(items: T[]): T[] {
  return [...items].sort((a, b) => String(a.image_paths?.[0] || "").localeCompare(String(b.image_paths?.[0] || "")));
}

/** The sheet immediately before this one in the same scan, if it can still be edited. */
export function previousSheet<T extends SheetItem>(item: T, all: T[]): T | null {
  const same = orderInBatch(all.filter((x) => x.batch_id === item.batch_id));
  const idx = same.findIndex((x) => x.id === item.id);
  const prev = idx > 0 ? same[idx - 1] : null;
  return prev && canEditSheet(prev) ? prev : null;
}

async function reread(batchId: string) {
  await supabase.from("paper_scan_batches").update({ status: "processing" } as any).eq("id", batchId);
  supabase.functions.invoke("process-paper-scan-batch", { body: { batch_id: batchId } }).catch((e) => console.error("re-read failed", e));
}

const cleared = { status: "pending", extracted: {}, header_data: {}, confidence: null, error: null } as any;

/** Join this sheet's pages onto the end of the previous sheet and re-read it. */
export async function mergeWithPrevious(item: SheetItem, prev: SheetItem) {
  if (!canEditSheet(item) || !canEditSheet(prev)) throw new Error("Only sheets that haven't been filed yet can be merged.");
  const { error } = await supabase.from("paper_scan_batch_items").update({ ...cleared, image_paths: [...prev.image_paths, ...item.image_paths] }).eq("id", prev.id);
  if (error) throw error;
  const { error: delErr } = await supabase.from("paper_scan_batch_items").delete().eq("id", item.id);
  if (delErr) throw delErr;
  await reread(item.batch_id);
}

/** Split a multi-page sheet into one sheet per page and re-read each. */
export async function splitIntoPages(item: SheetItem & { org_id: string }) {
  if (!canEditSheet(item)) throw new Error("Only sheets that haven't been filed yet can be split.");
  if (item.image_paths.length < 2) throw new Error("This sheet has only one page.");
  const [first, ...rest] = item.image_paths;
  const { error } = await supabase.from("paper_scan_batch_items").update({ ...cleared, image_paths: [first] }).eq("id", item.id);
  if (error) throw error;
  const { error: insErr } = await supabase.from("paper_scan_batch_items").insert(
    rest.map((p) => ({ batch_id: item.batch_id, org_id: item.org_id, image_paths: [p], detected_template_id: item.detected_template_id ?? null, mode: item.mode || "job" })) as any,
  );
  if (insErr) throw insErr;
  await reread(item.batch_id);
}
