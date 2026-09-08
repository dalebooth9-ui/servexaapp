import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type DraftQuoteResult = {
  invoice_id: string;
  line_count: number;
  unpriced_count: number;
  flagged_count: number;
};

/**
 * Ask the AI drafter to turn selected defects into a DRAFT quote.
 * Descriptions and groupings come from the AI; prices only ever come from the
 * org's price book. Nothing is ever sent to the customer automatically.
 */
export async function draftQuoteFromDefects(defectIds: string[]): Promise<DraftQuoteResult | null> {
  if (defectIds.length === 0) {
    toast.error("Select at least one defect first.");
    return null;
  }

  const { data, error } = await supabase.functions.invoke("ai-draft-defect-quote", {
    body: { defect_ids: defectIds },
  });

  if (error) {
    toast.error(
      (data as any)?.error || error.message || "Couldn't draft the quote. Please try again.",
    );
    return null;
  }
  if ((data as any)?.error) {
    toast.error((data as any).error);
    return null;
  }

  const result = data as DraftQuoteResult;
  const bits = [`${result.line_count} line${result.line_count === 1 ? "" : "s"} drafted`];
  if (result.unpriced_count) bits.push(`${result.unpriced_count} need a price`);
  if (result.flagged_count) bits.push(`${result.flagged_count} flagged to check`);
  toast.success("Draft quote created", { description: `${bits.join(" · ")}. Review before sending.` });
  return result;
}
