import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_INVOICE_VAT, defaultInvoiceDueDate, jobPoValue, syncInvoiceToXero } from "@/lib/invoiceHelpers";

/**
 * Creates a draft invoice for a finished job. If the job has an accepted quote,
 * its lines and totals are copied; otherwise a blank draft with the customer's
 * details is created for the office to price. Returns the new invoice id.
 */
export async function createInvoiceForJob(job: {
  id: string; customer_id?: string | null; site_id?: string | null;
  customer?: string | null; customers?: { name?: string | null; email?: string | null } | null;
  name?: string | null; customer_po?: string | null; po_value?: number | string | null;
}): Promise<string> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Please sign in again before creating an invoice.');
  const { data: existing } = await supabase.from("invoices").select("id")
    .eq("document_type", "invoice").eq("job_id", job.id).limit(1);
  if (existing && existing.length) return existing[0].id;

  const { data: quotes } = await supabase.from("invoices").select("*")
    .eq("document_type", "quote").eq("job_id", job.id).eq("status", "accepted")
    .order("created_at", { ascending: false }).limit(1);
  const q: any = quotes?.[0];
  // No accepted quote: price the single job line from the customer's PO value
  // (customers have their own prices); with no PO value the line stays unpriced.
  const poValue = q ? null : jobPoValue(job);
  const rate = q?.tax_rate ?? DEFAULT_INVOICE_VAT;
  const sub = q ? Number(q.subtotal) || 0 : poValue ?? 0;
  const tax = q ? Number(q.tax_amount) || 0 : Math.round(sub * rate) / 100;

  const { data: inv, error } = await supabase.from("invoices").insert({
    created_by: auth.user.id,
    job_id: job.id,
    customer_id: q?.customer_id ?? job.customer_id ?? null,
    site_id: q?.site_id ?? job.site_id ?? null,
    customer_name: q?.customer_name ?? job.customers?.name ?? job.customer ?? null,
    customer_email: q?.customer_email ?? job.customers?.email ?? null,
    customer_address: q?.customer_address ?? null,
    notes: q?.notes ?? null,
    subtotal: sub,
    tax_rate: rate,
    tax_amount: tax,
    total: q ? Number(q.total) || 0 : sub + tax,
    due_date: defaultInvoiceDueDate(),
    customer_po: job.customer_po || null,
    invoice_number: "",
    document_type: "invoice",
  } as any).select("id").single();
  if (error) throw error;

  if (q) {
    const { data: lines } = await supabase.from("invoice_line_items").select("*")
      .eq("invoice_id", q.id).order("sort_order");
    if (lines?.length) {
      const { error: lErr } = await supabase.from("invoice_line_items").insert(lines.map((it: any, i: number) => ({
        invoice_id: inv.id, description: it.description, quantity: it.quantity,
        unit_price: it.unit_price, amount: it.amount, sort_order: i,
      })) as any);
      if (lErr) throw lErr;
    }
  }
  if (!q && poValue != null) {
    const { error: lErr } = await supabase.from("invoice_line_items").insert({
      invoice_id: inv.id, description: job.name || "Works as per purchase order",
      quantity: 1, unit_price: poValue, amount: poValue, sort_order: 0,
    } as any);
    if (lErr) throw lErr;
  }
  void syncInvoiceToXero(inv.id);
  return inv.id;
}
