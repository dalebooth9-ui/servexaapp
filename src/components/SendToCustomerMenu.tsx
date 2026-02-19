import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Send, FileText, Receipt, ClipboardList, Loader2, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CustomerReportPdf from "./CustomerReportPdf";

interface Props {
  jobId: string;
  job: any;
  customerEmail?: string;
}

type DocOption = "report" | "quote" | "invoice";

export default function SendToCustomerMenu({ jobId, job, customerEmail }: Props) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<Set<DocOption>>(new Set());
  const [sending, setSending] = useState(false);
  const [email, setEmail] = useState(customerEmail || "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [reportBase64, setReportBase64] = useState<string | null>(null);
  const [reportFileName, setReportFileName] = useState("");

  // Invoice selection
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState("");
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const toggleDoc = (doc: DocOption) => {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(doc)) next.delete(doc);
      else next.add(doc);
      return next;
    });
  };

  const openDialog = async () => {
    setEmail(customerEmail || "");
    setReportBase64(null);
    setSelectedInvoice("");
    setSelectedDocs(new Set());
    setDialogOpen(true);

    // Pre-load invoices
    setLoadingInvoices(true);
    const { data } = await supabase
      .from("invoices")
      .select("id, invoice_number, total, status, document_type")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    setInvoices(data || []);
    if (data && data.length > 0) setSelectedInvoice(data[0].id);
    setLoadingInvoices(false);
  };

  // Build subject line based on selections
  const getAutoSubject = () => {
    const parts: string[] = [];
    if (selectedDocs.has("report")) parts.push("Report");
    if (selectedDocs.has("quote")) parts.push("Quote");
    if (selectedDocs.has("invoice")) parts.push("Invoice");
    if (parts.length === 0) return `Documents — ${job.reference_number}`;
    return `${parts.join(" & ")} — ${job.reference_number}`;
  };

  const getAutoMessage = () => {
    const items: string[] = [];
    if (selectedDocs.has("report")) items.push("the report");
    if (selectedDocs.has("quote")) items.push("our quote for further works");
    if (selectedDocs.has("invoice")) items.push("your invoice");
    const itemStr = items.length > 0 ? items.join(", ") : "the documents";
    return `Dear ${job.customer || "Customer"},\n\nPlease find attached ${itemStr} for job ${job.reference_number} (${job.name}).\n\nIf you have any questions, please don't hesitate to get in touch.\n\nKind regards,\nFieldReport`;
  };

  // Update subject/message when selections change
  const handleDocToggle = (doc: DocOption) => {
    toggleDoc(doc);
    // Defer to next tick so state is updated
    setTimeout(() => {
      setSubject(getAutoSubject());
      setMessage(getAutoMessage());
    }, 0);
  };

  // We need a version that reads from the toggled set directly
  const handleDocToggleImmediate = (doc: DocOption) => {
    const next = new Set(selectedDocs);
    if (next.has(doc)) next.delete(doc);
    else next.add(doc);
    setSelectedDocs(next);

    const parts: string[] = [];
    if (next.has("report")) parts.push("Report");
    if (next.has("quote")) parts.push("Quote");
    if (next.has("invoice")) parts.push("Invoice");
    setSubject(parts.length === 0 ? `Documents — ${job.reference_number}` : `${parts.join(" & ")} — ${job.reference_number}`);

    const items: string[] = [];
    if (next.has("report")) items.push("the report");
    if (next.has("quote")) items.push("our quote for further works");
    if (next.has("invoice")) items.push("your invoice");
    const itemStr = items.length > 0 ? items.join(", ") : "the documents";
    setMessage(`Dear ${job.customer || "Customer"},\n\nPlease find attached ${itemStr} for job ${job.reference_number} (${job.name}).\n\nIf you have any questions, please don't hesitate to get in touch.\n\nKind regards,\nFieldReport`);
  };

  const handleSend = async () => {
    if (!email.trim()) {
      toast({ title: "Error", description: "Customer email is required.", variant: "destructive" });
      return;
    }
    if (selectedDocs.size === 0) {
      toast({ title: "Error", description: "Select at least one document to send.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const attachments: { filename: string; content: string }[] = [];

      if (selectedDocs.has("report") && reportBase64) {
        attachments.push({ filename: reportFileName || `${job.reference_number}-report.pdf`, content: reportBase64 });
      }

      const { error } = await supabase.functions.invoke("send-customer-email", {
        body: {
          customerEmail: email.trim(),
          customerName: job.customer || "Customer",
          subject: subject.trim(),
          htmlBody: message.replace(/\n/g, "<br/>"),
          attachments,
          jobId,
          emailType: Array.from(selectedDocs).join(","),
          invoiceId: selectedDocs.has("invoice") ? selectedInvoice : undefined,
        },
      });

      if (error) throw error;

      const docNames = Array.from(selectedDocs).map((d) => d.charAt(0).toUpperCase() + d.slice(1));
      toast({ title: "Email sent", description: `${docNames.join(", ")} sent to ${email}.` });
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to send email.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const invoiceOptions = invoices.filter((i) => (i.document_type || "invoice") === "invoice");
  const quoteOptions = invoices.filter((i) => i.document_type === "quote");

  return (
    <>
      <Button size="sm" variant="default" className="gap-1.5" onClick={openDialog}>
        <Send className="h-4 w-4" /> Send to Customer
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Send to Customer
            </DialogTitle>
            <DialogDescription>
              Select documents to include and customise the email.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Document selection */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">Include Documents</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <Checkbox
                    checked={selectedDocs.has("report")}
                    onCheckedChange={() => handleDocToggleImmediate("report")}
                  />
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Job Report</p>
                    <p className="text-xs text-muted-foreground">Customer report PDF for this job</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <Checkbox
                    checked={selectedDocs.has("quote")}
                    onCheckedChange={() => handleDocToggleImmediate("quote")}
                  />
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Quote</p>
                    <p className="text-xs text-muted-foreground">Quote for further works</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <Checkbox
                    checked={selectedDocs.has("invoice")}
                    onCheckedChange={() => handleDocToggleImmediate("invoice")}
                  />
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Invoice</p>
                    <p className="text-xs text-muted-foreground">Invoice for completed work</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Report PDF generation */}
            {selectedDocs.has("report") && (
              <div className="rounded-md border border-dashed p-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Customer Report PDF</span>
                {reportBase64 ? (
                  <span className="text-xs font-medium text-primary">✓ PDF ready</span>
                ) : (
                  <CustomerReportPdf
                    jobId={jobId}
                    job={job}
                    onPdfGenerated={(base64, fileName) => {
                      setReportBase64(base64);
                      setReportFileName(fileName);
                      toast({ title: "Report ready", description: "PDF attached." });
                    }}
                    trigger={
                      <Button type="button" size="sm" variant="outline" className="gap-1">
                        <FileText className="h-3 w-3" /> Generate PDF
                      </Button>
                    }
                  />
                )}
              </div>
            )}

            {/* Quote selection */}
            {selectedDocs.has("quote") && (
              <div>
                <Label>Select Quote</Label>
                {quoteOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-1">No quotes found for this job. Create one first.</p>
                ) : (
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm mt-1"
                    value={selectedInvoice}
                    onChange={(e) => setSelectedInvoice(e.target.value)}
                  >
                    {quoteOptions.map((q: any) => (
                      <option key={q.id} value={q.id}>
                        {q.invoice_number} — £{Number(q.total).toFixed(2)} ({q.status})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Invoice selection */}
            {selectedDocs.has("invoice") && (
              <div>
                <Label>Select Invoice</Label>
                {loadingInvoices ? (
                  <p className="text-sm text-muted-foreground mt-1">Loading…</p>
                ) : invoiceOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-1">No invoices found for this job. Create one first.</p>
                ) : (
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm mt-1"
                    value={selectedInvoice}
                    onChange={(e) => setSelectedInvoice(e.target.value)}
                  >
                    {invoiceOptions.map((inv: any) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_number} — £{Number(inv.total).toFixed(2)} ({inv.status})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Email fields */}
            <div>
              <Label>Customer Email *</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="customer@example.com"
              />
            </div>

            <div>
              <Label>Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div>
              <Label>Message</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSend}
                disabled={sending || selectedDocs.size === 0}
                className="gap-1.5"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? "Sending…" : "Send Email"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
