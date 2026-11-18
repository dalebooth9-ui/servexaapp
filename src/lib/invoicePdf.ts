import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { getGeneratingOrgBranding } from "@/lib/generatingOrgBranding";

const NAVY: [number, number, number] = [33, 61, 99];
const gbp = (n: unknown) => `£${(Number(n) || 0).toFixed(2)}`;
const ukDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "");

/**
 * Builds an invoice PDF straight from the saved invoice (used when the report
 * and invoice are sent together from the job page). Layout mirrors the invoice
 * page: company name, INVOICE, Bill To, number/date/due/PO, lines, totals.
 */
export async function buildInvoicePdf(invoiceId: string): Promise<{ base64: string; fileName: string; invoice: any }> {
  const [invRes, itemsRes, brand] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", invoiceId).single(),
    supabase.from("invoice_line_items").select("*").eq("invoice_id", invoiceId).order("sort_order"),
    getGeneratingOrgBranding(),
  ]);
  if (invRes.error || !invRes.data) throw new Error(invRes.error?.message || "Invoice not found");
  const inv: any = invRes.data;
  const items: any[] = itemsRes.data || [];

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = 15, R = 195;
  let y = 20;
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  if (brand.name) { doc.text(brand.name, L, y); y += 8; }
  doc.setFontSize(13); doc.text("INVOICE", L, y);
  y += 3; doc.setDrawColor(...NAVY); doc.setLineWidth(0.6); doc.line(L, y, R, y); y += 8;

  doc.setFontSize(8); doc.setTextColor(136, 136, 136); doc.text("BILL TO", L, y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...NAVY);
  doc.text(inv.invoice_number || "", R, y, { align: "right" });
  let ly = y + 5, ry = y + 5;
  doc.setTextColor(26, 26, 26); doc.text(inv.customer_name || "", L, ly); ly += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(85, 85, 85);
  if (inv.customer_email) { doc.text(inv.customer_email, L, ly); ly += 4.5; }
  if (inv.customer_address) for (const line of doc.splitTextToSize(inv.customer_address, 100)) { doc.text(line, L, ly); ly += 4.5; }
  const meta = [`Date: ${ukDate(inv.created_at)}`];
  if (inv.due_date) meta.push(`Due: ${ukDate(inv.due_date)}`);
  if (inv.customer_po) meta.push(`PO: ${inv.customer_po}`);
  for (const m of meta) { doc.text(m, R, ry, { align: "right" }); ry += 4.5; }
  y = Math.max(ly, ry) + 6;

  const cols = { qty: 135, unit: 165, amt: R };
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...NAVY);
  doc.text("DESCRIPTION", L, y); doc.text("QTY", cols.qty, y, { align: "right" });
  doc.text("UNIT PRICE", cols.unit, y, { align: "right" }); doc.text("AMOUNT", cols.amt, y, { align: "right" });
  y += 2; doc.line(L, y, R, y); y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(26, 26, 26);
  for (const it of items) {
    const desc = doc.splitTextToSize(it.description || "", 105);
    if (y + desc.length * 4.5 > 270) { doc.addPage(); y = 20; }
    doc.text(desc, L, y);
    doc.text(String(Number(it.quantity) || 0), cols.qty, y, { align: "right" });
    doc.text(gbp(it.unit_price), cols.unit, y, { align: "right" });
    doc.text(gbp(it.amount), cols.amt, y, { align: "right" });
    y += desc.length * 4.5 + 2;
    doc.setDrawColor(240, 240, 240); doc.setLineWidth(0.2); doc.line(L, y - 1, R, y - 1);
  }
  y += 4;
  const tot = (label: string, val: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, 150, y); doc.text(val, R, y, { align: "right" }); y += 5;
  };
  tot("Subtotal", gbp(inv.subtotal));
  if (Number(inv.tax_rate) > 0) tot(`VAT (${Number(inv.tax_rate)}%)`, gbp(inv.tax_amount));
  doc.setTextColor(...NAVY); tot("Total", gbp(inv.total), true);
  if (inv.notes) {
    y += 4; doc.setTextColor(85, 85, 85); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize(inv.notes, R - L), L, y);
  }
  return { base64: doc.output("datauristring").split(",")[1], fileName: `${inv.invoice_number || "invoice"}.pdf`, invoice: inv };
}
