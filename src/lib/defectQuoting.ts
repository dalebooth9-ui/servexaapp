import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/** Create a single draft quote containing every supplied defect. */
export async function batchQuoteDefects(defectIds: string[]): Promise<string | null> {
  if (!defectIds.length) {
    toast.error("Nothing to quote — every defect already has a quote.");
    return null;
  }
  const { data, error } = await supabase.rpc("draft_quote_from_defects", {
    _defect_ids: defectIds,
  });
  if (error) {
    toast.error(error.message || "Couldn't create the quote. Please try again.");
    return null;
  }
  toast.success("Draft quote created", {
    description: `${defectIds.length} item${defectIds.length === 1 ? "" : "s"} added. Add prices before sending.`,
  });
  return data as unknown as string;
}

/** Add defects to an existing draft quote as extra lines. */
export async function attachDefectsToQuote(defectIds: string[], quoteId: string): Promise<boolean> {
  if (!defectIds.length) return false;
  const { error } = await supabase.rpc("attach_defects_to_quote", {
    _defect_ids: defectIds,
    _quote_id: quoteId,
  });
  if (error) {
    toast.error(error.message || "Couldn't add to that quote. Please try again.");
    return false;
  }
  toast.success("Added to quote");
  return true;
}

export type OpenQuote = {
  id: string;
  invoice_number: string;
  customer_name: string;
  status: string;
  total: number | null;
};

/** Draft/sent quotes the user can add defects to. */
export async function listOpenQuotes(): Promise<OpenQuote[]> {
  const { data } = await supabase
    .from("invoices")
    .select("id, invoice_number, customer_name, status, total")
    .eq("document_type", "quote")
    .in("status", ["draft", "sent"])
    .order("created_at", { ascending: false })
    .limit(50);
  return (data || []) as OpenQuote[];
}
