import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_INVOICE_VAT = 20;
export const DEFAULT_INVOICE_DUE_DAYS = 30;

/** The customer's purchase-order value for a job, or null when there is none. */
export function jobPoValue(job: { po_value?: number | string | null } | null | undefined): number | null {
  const raw = job?.po_value;
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Due date (yyyy-mm-dd) a set number of days from the given date, default 30. */
export function defaultInvoiceDueDate(from: Date = new Date(), days = DEFAULT_INVOICE_DUE_DAYS): string {
  const d = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate() + days));
  return d.toISOString().slice(0, 10);
}

export type XeroSyncResult = { ok: true; xeroInvoiceId: string | null } | { ok: false; skipped: true } | { ok: false; skipped?: false; error: string };

/**
 * Sends an invoice to Xero if the company has Xero connected. Quietly skips
 * when Xero isn't connected. The result (Sent to Xero / the failure reason) is
 * also stored on the invoice, so the invoice page shows it.
 */
export async function syncInvoiceToXero(invoiceId: string): Promise<XeroSyncResult> {
  const { data, error } = await supabase.functions.invoke("xero-sync", { body: { action: "sync_invoice", invoiceId } });
  let msg: string | null = null;
  if (error) {
    try {
      const ctx: any = (error as any).context;
      const text = ctx && typeof ctx.text === "function" ? await ctx.text() : "";
      const parsed = text ? JSON.parse(text) : null;
      msg = parsed?.reason || parsed?.error || error.message;
    } catch { msg = error.message; }
  } else if (data?.error) {
    msg = data.reason || data.error;
  }
  if (msg) {
    if (/not connected/i.test(msg)) return { ok: false, skipped: true };
    console.warn("[xero] invoice sync failed", invoiceId, msg);
    return { ok: false, error: msg };
  }
  return { ok: true, xeroInvoiceId: data?.xero_invoice_id ?? null };
}
