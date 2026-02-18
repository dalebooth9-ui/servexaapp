import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ArrowLeft, Download, Send, Loader2 } from "lucide-react";
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
  const printRef = useRef<HTMLDivElement>(null);

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
      toast({ title: "No email", description: "Customer email is not set on this invoice.", variant: "destructive" });
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

      // Mark as sent
      if (invoice.status === "draft") {
        await handleStatusChange("sent");
      }
      toast({ title: "Invoice sent", description: `Email sent to ${invoice.customer_email}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to send invoice.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>;
  if (!invoice) return <div className="flex h-64 items-center justify-center text-muted-foreground">Invoice not found.</div>;

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link to="/">Dashboard</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link to="/invoices">Invoices</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{invoice.invoice_number}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Actions bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{invoice.invoice_number}</h1>
          <p className="text-sm text-muted-foreground">
            {invoice.customer_name}
            {invoice.job_id && (
              <> • <Link to={`/jobs/${invoice.job_id}`} className="text-primary hover:underline">View Job</Link></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {userRole === "admin" && (
            <Select value={invoice.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={generatingPdf}>
            <Download className="mr-1.5 h-4 w-4" />
            {generatingPdf ? "Generating..." : "PDF"}
          </Button>
          {userRole === "admin" && (
            <Button size="sm" onClick={handleSendEmail} disabled={sending || !invoice.customer_email}>
              {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              {sending ? "Sending..." : "Email Invoice"}
            </Button>
          )}
        </div>
      </div>

      {/* Printable invoice */}
      <Card>
        <CardContent className="p-0">
          <div ref={printRef} className="bg-white p-8 text-foreground" style={{ color: "#1a1a1a" }}>
            {/* Header */}
            <div className="mb-8 flex justify-between">
              <div>
                <h2 className="text-2xl font-bold" style={{ color: "#1a1a1a" }}>INVOICE</h2>
                <p className="text-lg font-mono" style={{ color: "#555" }}>{invoice.invoice_number}</p>
              </div>
              <div className="text-right text-sm" style={{ color: "#555" }}>
                <p className="font-semibold" style={{ color: "#1a1a1a" }}>FieldReport</p>
                <p>Date: {format(new Date(invoice.created_at), "dd MMM yyyy")}</p>
                {invoice.due_date && <p>Due: {format(new Date(invoice.due_date), "dd MMM yyyy")}</p>}
                <Badge variant="secondary" className={`mt-1 ${statusStyles[invoice.status]}`}>
                  {invoice.status}
                </Badge>
              </div>
            </div>

            {/* Bill to */}
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase" style={{ color: "#888" }}>Bill To</p>
              <p className="font-semibold" style={{ color: "#1a1a1a" }}>{invoice.customer_name}</p>
              {invoice.customer_email && <p className="text-sm" style={{ color: "#555" }}>{invoice.customer_email}</p>}
              {invoice.customer_address && <p className="text-sm whitespace-pre-line" style={{ color: "#555" }}>{invoice.customer_address}</p>}
            </div>

            {/* Line items */}
            <table className="w-full mb-6" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e5e5" }}>
                  <th className="py-2 text-left text-xs font-semibold uppercase" style={{ color: "#888" }}>Description</th>
                  <th className="py-2 text-right text-xs font-semibold uppercase" style={{ color: "#888" }}>Qty</th>
                  <th className="py-2 text-right text-xs font-semibold uppercase" style={{ color: "#888" }}>Unit Price</th>
                  <th className="py-2 text-right text-xs font-semibold uppercase" style={{ color: "#888" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td className="py-2.5 text-sm" style={{ color: "#1a1a1a" }}>{item.description}</td>
                    <td className="py-2.5 text-sm text-right" style={{ color: "#555" }}>{Number(item.quantity)}</td>
                    <td className="py-2.5 text-sm text-right" style={{ color: "#555" }}>£{Number(item.unit_price).toFixed(2)}</td>
                    <td className="py-2.5 text-sm text-right font-medium" style={{ color: "#1a1a1a" }}>£{Number(item.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="flex justify-end">
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
                <div className="flex justify-between border-t pt-1 text-base font-bold" style={{ borderColor: "#e5e5e5", color: "#1a1a1a" }}>
                  <span>Total</span>
                  <span>£{Number(invoice.total).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="mt-8 rounded border p-3 text-sm" style={{ borderColor: "#e5e5e5", color: "#555" }}>
                <p className="text-xs font-semibold uppercase mb-1" style={{ color: "#888" }}>Notes</p>
                <p className="whitespace-pre-line">{invoice.notes}</p>
              </div>
            )}

            {/* Payment info */}
            {invoice.paid_at && (
              <p className="mt-4 text-xs" style={{ color: "#888" }}>
                Paid on {format(new Date(invoice.paid_at), "dd MMM yyyy 'at' HH:mm")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
