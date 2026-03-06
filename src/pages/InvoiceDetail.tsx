import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArrowLeft, Download, Send, Loader2, RefreshCw, ArrowRightLeft, Pencil, Trash2, Plus, X, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useRef } from "react";

const statusStyles: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/10 text-primary",
  paid: "bg-accent/10 text-accent",
  overdue: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground line-through",
  accepted: "bg-accent/10 text-accent",
  declined: "bg-destructive/10 text-destructive",
};

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [invoice, setInvoice] = useState<any>(null);
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [syncingXero, setSyncingXero] = useState(false);
  const [converting, setConverting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [editItems, setEditItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  // Inline line item editing (read-only view)
  const [inlineEditIdx, setInlineEditIdx] = useState<number | null>(null);
  const [inlineEditData, setInlineEditData] = useState<any>(null);
  const [inlineSaving, setInlineSaving] = useState(false);

  const isQuote = invoice?.document_type === "quote";

  const fetchData = async () => {
    if (!id) return;
    const [invRes, itemsRes] = await Promise.all([
      supabase.from("invoices").select("*").eq("id", id).single(),
      supabase.from("invoice_line_items").select("*").eq("invoice_id", id).order("sort_order"),
    ]);
    setInvoice(invRes.data);
    setLineItems(itemsRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id]);

  // --- Edit helpers ---
  const startEditing = () => {
    setEditForm({
      customer_name: invoice.customer_name || "",
      customer_email: invoice.customer_email || "",
      customer_address: invoice.customer_address || "",
      due_date: invoice.due_date || "",
      notes: invoice.notes || "",
      tax_rate: Number(invoice.tax_rate) || 0,
    });
    setEditItems(lineItems.map((it) => ({ ...it })));
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditForm({});
    setEditItems([]);
  };

  const updateEditItem = (idx: number, field: string, value: string | number) => {
    setEditItems((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const removeEditItem = (idx: number) => {
    setEditItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const addEditItem = () => {
    setEditItems((prev) => [...prev, { id: `new-${Date.now()}`, description: "", quantity: 1, unit_price: 0, amount: 0 }]);
  };

  const editSubtotal = editItems.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
  const editTaxAmount = editSubtotal * ((editForm.tax_rate || 0) / 100);
  const editTotal = editSubtotal + editTaxAmount;

  const handleSaveEdit = async () => {
    if (!id) return;
    setSaving(true);
    try {
      // Update invoice record
      const { error: invErr } = await supabase.from("invoices").update({
        customer_name: editForm.customer_name.trim(),
        customer_email: editForm.customer_email.trim() || null,
        customer_address: editForm.customer_address.trim() || null,
        due_date: editForm.due_date || null,
        notes: editForm.notes.trim() || null,
        tax_rate: editForm.tax_rate,
        subtotal: editSubtotal.toFixed(2),
        tax_amount: editTaxAmount.toFixed(2),
        total: editTotal.toFixed(2),
      } as any).eq("id", id);
      if (invErr) throw invErr;

      // Delete existing line items and re-insert
      await supabase.from("invoice_line_items").delete().eq("invoice_id", id);

      const validItems = editItems.filter((it) => it.description?.trim());
      if (validItems.length > 0) {
        const rows = validItems.map((it, idx) => ({
          invoice_id: id,
          description: it.description.trim(),
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
          amount: ((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)).toFixed(2),
          sort_order: idx,
        }));
        const { error: itemsErr } = await supabase.from("invoice_line_items").insert(rows as any);
        if (itemsErr) throw itemsErr;
      }

      toast({ title: "Changes saved" });
      setEditing(false);
      await fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to save.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // --- Inline line item edit ---
  const startInlineEdit = (idx: number) => {
    const item = lineItems[idx];
    setInlineEditIdx(idx);
    setInlineEditData({ description: item.description, quantity: Number(item.quantity), unit_price: Number(item.unit_price) });
  };

  const cancelInlineEdit = () => {
    setInlineEditIdx(null);
    setInlineEditData(null);
  };

  const saveInlineEdit = async () => {
    if (inlineEditIdx === null || !inlineEditData || !id) return;
    const item = lineItems[inlineEditIdx];
    setInlineSaving(true);
    try {
      const qty = Number(inlineEditData.quantity) || 0;
      const price = Number(inlineEditData.unit_price) || 0;
      const amount = (qty * price).toFixed(2);

      const { error: itemErr } = await supabase.from("invoice_line_items").update({
        description: inlineEditData.description.trim(),
        quantity: qty,
        unit_price: price,
        amount: amount,
      } as any).eq("id", item.id);
      if (itemErr) throw itemErr;

      // Recalculate totals
      const updatedItems = lineItems.map((it, i) =>
        i === inlineEditIdx ? { ...it, description: inlineEditData.description.trim(), quantity: qty, unit_price: price, amount: Number(amount) } : it
      );
      const newSubtotal = updatedItems.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_price), 0);
      const newTax = newSubtotal * (Number(invoice.tax_rate) / 100);
      const newTotal = newSubtotal + newTax;

      const { error: invErr } = await supabase.from("invoices").update({
        subtotal: newSubtotal.toFixed(2),
        tax_amount: newTax.toFixed(2),
        total: newTotal.toFixed(2),
      } as any).eq("id", id);
      if (invErr) throw invErr;

      setLineItems(updatedItems);
      setInvoice((prev: any) => ({ ...prev, subtotal: newSubtotal, tax_amount: newTax, total: newTotal }));
      cancelInlineEdit();
      toast({ title: "Line item updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to save.", variant: "destructive" });
    } finally {
      setInlineSaving(false);
    }
  };

  // --- Delete ---
  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await supabase.from("invoice_line_items").delete().eq("invoice_id", id);
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
      toast({ title: `${isQuote ? "Quote" : "Invoice"} deleted` });
      navigate("/invoices");
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to delete.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!id) return;
    const updates: any = { status: newStatus };
    if (newStatus === "paid") updates.paid_at = new Date().toISOString();
    if (newStatus === "sent" && !invoice.sent_at) updates.sent_at = new Date().toISOString();

    const { error } = await supabase.from("invoices").update(updates).eq("id", id);
    if (error) {
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
    } else {
      setInvoice((prev: any) => ({ ...prev, ...updates }));
      toast({ title: "Status updated" });
    }
  };

  const handleConvertToInvoice = async () => {
    if (!invoice) return;
    setConverting(true);
    try {
      const { data: newInv, error: invErr } = await supabase
        .from("invoices")
        .insert({
          job_id: invoice.job_id,
          customer_name: invoice.customer_name,
          customer_email: invoice.customer_email,
          customer_address: invoice.customer_address,
          due_date: invoice.due_date,
          notes: invoice.notes,
          subtotal: invoice.subtotal,
          tax_rate: invoice.tax_rate,
          tax_amount: invoice.tax_amount,
          total: invoice.total,
          created_by: invoice.created_by,
          invoice_number: "",
          document_type: "invoice",
        } as any)
        .select()
        .single();

      if (invErr) throw invErr;

      if (lineItems.length > 0) {
        const newItems = lineItems.map((it, idx) => ({
          invoice_id: newInv.id,
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unit_price,
          amount: it.amount,
          sort_order: idx,
        }));
        const { error: itemsErr } = await supabase.from("invoice_line_items").insert(newItems as any);
        if (itemsErr) throw itemsErr;
      }

      await supabase.from("invoices").update({ status: "accepted" } as any).eq("id", id);
      toast({ title: "Converted to invoice", description: `${newInv.invoice_number} created from quote.` });
      navigate(`/invoices/${newInv.id}`);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to convert.", variant: "destructive" });
    } finally {
      setConverting(false);
    }
  };

  const generatePdf = async (): Promise<jsPDF | null> => {
    if (!printRef.current) return null;
    setGeneratingPdf(true);
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      return pdf;
    } catch (err) {
      console.error("PDF generation error:", err);
      toast({ title: "Error", description: "Failed to generate PDF.", variant: "destructive" });
      return null;
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleDownloadPdf = async () => {
    const pdf = await generatePdf();
    if (pdf) {
      pdf.save(`${invoice.invoice_number}.pdf`);
      toast({ title: "PDF downloaded" });
    }
  };

  const handleSendEmail = async () => {
    if (!invoice.customer_email) {
      toast({ title: "No email", description: "Customer email is not set.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const pdf = await generatePdf();
      if (!pdf) { setSending(false); return; }
      const pdfBase64 = pdf.output("datauristring").split(",")[1];

      const { data, error } = await supabase.functions.invoke("send-invoice-email", {
        body: {
          invoiceId: id,
          customerEmail: invoice.customer_email,
          customerName: invoice.customer_name,
          invoiceNumber: invoice.invoice_number,
          total: invoice.total,
          pdfBase64,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (invoice.status === "draft") {
        await handleStatusChange("sent");
      }
      toast({ title: `${isQuote ? "Quote" : "Invoice"} sent`, description: `Email sent to ${invoice.customer_email}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to send.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleSyncXero = async () => {
    setSyncingXero(true);
    try {
      const { data, error } = await supabase.functions.invoke("xero-sync", {
        body: { action: "sync_invoice", invoiceId: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setInvoice((prev: any) => ({
        ...prev,
        xero_invoice_id: data.xero_invoice_id,
        xero_synced_at: new Date().toISOString(),
      }));
      toast({ title: "Synced to Xero" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to sync.", variant: "destructive" });
    } finally {
      setSyncingXero(false);
    }
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>;
  if (!invoice) return <div className="flex h-64 items-center justify-center text-muted-foreground">Not found.</div>;

  const docLabel = isQuote ? "QUOTE" : "INVOICE";
  const invoiceStatuses = ["draft", "sent", "paid", "overdue", "cancelled"];
  const quoteStatuses = ["draft", "sent", "accepted", "declined"];
  const availableStatuses = isQuote ? quoteStatuses : invoiceStatuses;

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link to="/">Dashboard</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link to="/invoices">Invoices & Quotes</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{invoice.invoice_number}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Actions bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{invoice.invoice_number}</h1>
            {isQuote && <Badge variant="outline">Quote</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {invoice.customer_name}
            {invoice.job_id && (
              <> • <Link to={`/jobs/${invoice.job_id}`} className="text-primary hover:underline">View Job</Link></>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {userRole === "admin" && !editing && (
            <>
              <Select value={invoice.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableStatuses.map((s) => (
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={startEditing}>
                <Pencil className="mr-1.5 h-4 w-4" /> Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
                    <Trash2 className="mr-1.5 h-4 w-4" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {isQuote ? "quote" : "invoice"} {invoice.invoice_number}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete this {isQuote ? "quote" : "invoice"} and all its line items. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {deleting ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          {editing && (
            <>
              <Button size="sm" variant="outline" onClick={cancelEditing}>
                <X className="mr-1.5 h-4 w-4" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Save Changes
              </Button>
            </>
          )}
          {!editing && (
            <>
              {isQuote && userRole === "admin" && (
                <Button size="sm" variant="outline" onClick={handleConvertToInvoice} disabled={converting}>
                  {converting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ArrowRightLeft className="mr-1.5 h-4 w-4" />}
                  Convert to Invoice
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={generatingPdf}>
                <Download className="mr-1.5 h-4 w-4" />
                {generatingPdf ? "Generating..." : "PDF"}
              </Button>
              {userRole === "admin" && (
                <Button size="sm" variant="outline" onClick={handleSyncXero} disabled={syncingXero}>
                  {syncingXero ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                  {invoice.xero_invoice_id ? "Re-sync Xero" : "Send to Xero"}
                </Button>
              )}
              {userRole === "admin" && (
                <Button size="sm" onClick={handleSendEmail} disabled={sending || !invoice.customer_email}>
                  {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                  {sending ? "Sending..." : `Email ${isQuote ? "Quote" : "Invoice"}`}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Edit form */}
      {editing ? (
        <Card>
          <CardContent className="p-6 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Customer Name</Label>
                <Input value={editForm.customer_name} onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })} />
              </div>
              <div>
                <Label>Customer Email</Label>
                <Input type="email" value={editForm.customer_email} onChange={(e) => setEditForm({ ...editForm, customer_email: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Customer Address</Label>
              <Textarea value={editForm.customer_address} onChange={(e) => setEditForm({ ...editForm, customer_address: e.target.value })} rows={2} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>{isQuote ? "Valid Until" : "Due Date"}</Label>
                <Input type="date" value={editForm.due_date} onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })} />
              </div>
              <div>
                <Label>Tax Rate (%)</Label>
                <Input type="number" min={0} max={100} step={0.01} value={editForm.tax_rate} onChange={(e) => setEditForm({ ...editForm, tax_rate: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>

            {/* Editable line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Line Items</Label>
                <Button type="button" size="sm" variant="ghost" onClick={addEditItem}>
                  <Plus className="mr-1 h-3 w-3" /> Add Item
                </Button>
              </div>
              <div className="space-y-2">
                {editItems.map((item, idx) => (
                  <div key={item.id || idx} className="flex items-start gap-2">
                    <div className="flex-1">
                      <Input
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateEditItem(idx, "description", e.target.value)}
                      />
                    </div>
                    <div className="w-20">
                      <Input
                        type="number" min={0} step={0.01} placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => updateEditItem(idx, "quantity", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="w-28">
                      <Input
                        type="number" min={0} step={0.01} placeholder="Price"
                        value={item.unit_price}
                        onChange={(e) => updateEditItem(idx, "unit_price", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="w-24 flex items-center justify-end gap-1 pt-2">
                      <span className="text-sm font-medium">£{((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)).toFixed(2)}</span>
                      {editItems.length > 1 && (
                        <button type="button" onClick={() => removeEditItem(idx)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Edit totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span><span>£{editSubtotal.toFixed(2)}</span>
                </div>
                {editForm.tax_rate > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax ({editForm.tax_rate}%)</span><span>£{editTaxAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1 font-bold">
                  <span>Total</span><span>£{editTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label>Notes</Label>
              <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} placeholder="Payment terms, bank details, etc." />
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Printable document (read-only view) */
        <Card>
          <CardContent className="p-0">
            {/* Watermark + content wrapper */}
            <div
              ref={printRef}
              className="bg-white text-foreground"
              style={{
                color: "#1a1a1a",
                position: "relative",
                padding: "2rem",
                minHeight: "1100px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Blue flame watermark */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: "url('/images/viva-watermark.png')",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center center",
                  backgroundSize: "70%",
                  opacity: 0.07,
                  pointerEvents: "none",
                  zIndex: 0,
                }}
              />

              {/* All content sits above the watermark */}
              <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column" }}>

                {/* ── Viva Fire branded header ─────────────────────────── */}
              <div className="mb-6 flex flex-col items-center">
                <img
                  src="/images/vivafire-logo-new.jpg"
                  alt="Viva Fire"
                  className="mb-2"
                  style={{ maxHeight: 56, maxWidth: 180, objectFit: "contain" }}
                  crossOrigin="anonymous"
                />
                <h2
                  className="text-lg font-bold tracking-widest uppercase"
                  style={{ color: "#213D63", letterSpacing: "0.15em" }}
                >
                  {docLabel}
                </h2>
              </div>
              {/* Brand separator */}
              <div style={{ borderTop: "2px solid #213D63", marginBottom: "1.5rem" }} />

              {/* Doc meta row */}
              <div className="mb-6 flex justify-between items-start">
                <div>
                  <p className="text-xs font-semibold uppercase" style={{ color: "#888" }}>{isQuote ? "Quote For" : "Bill To"}</p>
                  <p className="font-semibold" style={{ color: "#1a1a1a" }}>{invoice.customer_name}</p>
                  {invoice.customer_email && <p className="text-sm" style={{ color: "#555" }}>{invoice.customer_email}</p>}
                  {invoice.customer_address && <p className="text-sm whitespace-pre-line" style={{ color: "#555" }}>{invoice.customer_address}</p>}
                </div>
                <div className="text-right text-sm" style={{ color: "#555" }}>
                  <p className="font-mono font-semibold" style={{ color: "#213D63" }}>{invoice.invoice_number}</p>
                  <p>Date: {format(new Date(invoice.created_at), "dd MMM yyyy")}</p>
                  {invoice.due_date && <p>{isQuote ? "Valid Until" : "Due"}: {format(new Date(invoice.due_date), "dd MMM yyyy")}</p>}
                  <Badge variant="secondary" className={`mt-1 ${statusStyles[invoice.status]}`}>
                    {invoice.status}
                  </Badge>
                </div>
              </div>

              {/* Line items */}
              <table className="w-full mb-6" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #213D63" }}>
                    <th className="py-2 text-left text-xs font-semibold uppercase" style={{ color: "#213D63" }}>Description</th>
                    <th className="py-2 text-right text-xs font-semibold uppercase" style={{ color: "#213D63" }}>Qty</th>
                    <th className="py-2 text-right text-xs font-semibold uppercase" style={{ color: "#213D63" }}>Unit Price</th>
                    <th className="py-2 text-right text-xs font-semibold uppercase" style={{ color: "#213D63" }}>Amount</th>
                    {userRole === "admin" && <th className="py-2 w-20" />}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, idx) => (
                    inlineEditIdx === idx && inlineEditData ? (
                      <tr key={item.id} style={{ borderBottom: "1px solid #f0f0f0" }} className="bg-muted/30">
                        <td className="py-1.5 pr-2">
                          <Input
                            value={inlineEditData.description}
                            onChange={(e) => setInlineEditData({ ...inlineEditData, description: e.target.value })}
                            className="h-8 text-sm"
                          />
                        </td>
                        <td className="py-1.5 px-1">
                          <Input
                            type="number" min={0} step={0.01}
                            value={inlineEditData.quantity}
                            onChange={(e) => setInlineEditData({ ...inlineEditData, quantity: parseFloat(e.target.value) || 0 })}
                            className="h-8 w-20 text-sm text-right ml-auto"
                          />
                        </td>
                        <td className="py-1.5 px-1">
                          <Input
                            type="number" min={0} step={0.01}
                            value={inlineEditData.unit_price}
                            onChange={(e) => setInlineEditData({ ...inlineEditData, unit_price: parseFloat(e.target.value) || 0 })}
                            className="h-8 w-28 text-sm text-right ml-auto"
                          />
                        </td>
                        <td className="py-1.5 text-sm text-right font-medium" style={{ color: "#1a1a1a" }}>
                          £{((Number(inlineEditData.quantity) || 0) * (Number(inlineEditData.unit_price) || 0)).toFixed(2)}
                        </td>
                        <td className="py-1.5 pl-2">
                          <div className="flex items-center gap-1 justify-end">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={saveInlineEdit} disabled={inlineSaving}>
                              {inlineSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={cancelInlineEdit}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr
                        key={item.id}
                        style={{ borderBottom: "1px solid #f0f0f0" }}
                        className={userRole === "admin" ? "cursor-pointer hover:bg-muted/20 transition-colors" : ""}
                        onClick={() => userRole === "admin" && startInlineEdit(idx)}
                      >
                        <td className="py-2.5 text-sm" style={{ color: "#1a1a1a" }}>{item.description}</td>
                        <td className="py-2.5 text-sm text-right" style={{ color: "#555" }}>{Number(item.quantity)}</td>
                        <td className="py-2.5 text-sm text-right" style={{ color: "#555" }}>£{Number(item.unit_price).toFixed(2)}</td>
                        <td className="py-2.5 text-sm text-right font-medium" style={{ color: "#1a1a1a" }}>£{Number(item.amount).toFixed(2)}</td>
                        {userRole === "admin" && (
                          <td className="py-2.5 text-right">
                            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 inline-block" />
                          </td>
                        )}
                      </tr>
                    )
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="flex justify-end mb-8">
                <div className="w-64 space-y-1 text-sm">
                  <div className="flex justify-between" style={{ color: "#555" }}>
                    <span>Subtotal</span>
                    <span>£{Number(invoice.subtotal).toFixed(2)}</span>
                  </div>
                  {Number(invoice.tax_rate) > 0 && (
                    <div className="flex justify-between" style={{ color: "#555" }}>
                      <span>Tax ({Number(invoice.tax_rate)}%)</span>
                      <span>£{Number(invoice.tax_amount).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-1 text-base font-bold" style={{ borderColor: "#213D63", color: "#213D63" }}>
                    <span>Total</span>
                    <span>£{Number(invoice.total).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {invoice.notes && (
                <div className="mb-8 rounded border p-3 text-sm" style={{ borderColor: "#e5e5e5", color: "#555" }}>
                  <p className="text-xs font-semibold uppercase mb-1" style={{ color: "#888" }}>Notes</p>
                  <p className="whitespace-pre-line">{invoice.notes}</p>
                </div>
              )}

              {/* Payment info */}
              {invoice.paid_at && (
                <p className="mb-6 text-xs" style={{ color: "#888" }}>
                  Paid on {format(new Date(invoice.paid_at), "dd MMM yyyy 'at' HH:mm")}
                </p>
              )}

              {/* ── Accreditation logos ────────────────────────────────── */}
              <div style={{ borderTop: "1px solid #e5e5e5", paddingTop: "0.75rem", marginTop: "auto" }}>
                <div className="flex items-center justify-center gap-4">
                  {[
                    "/accreditation/smas-logo.png",
                    "/accreditation/constructionline-logo.png",
                    "/accreditation/iso-9001-logo.jpg",
                    "/accreditation/bafe-logo.jpeg",
                  ].map((src) => (
                    <img
                      key={src}
                      src={src}
                      alt=""
                      crossOrigin="anonymous"
                      style={{ height: 28, objectFit: "contain", opacity: 0.22 }}
                    />
                  ))}
                </div>
              </div>

            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
