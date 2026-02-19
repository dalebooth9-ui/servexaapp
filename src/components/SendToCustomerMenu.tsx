import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
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

type SendType = "report" | "quote" | "invoice" | null;

export default function SendToCustomerMenu({ jobId, job, customerEmail }: Props) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sendType, setSendType] = useState<SendType>(null);
  const [sending, setSending] = useState(false);
  const [email, setEmail] = useState(customerEmail || "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [includeReport, setIncludeReport] = useState(false);
  const [reportBase64, setReportBase64] = useState<string | null>(null);
  const [reportFileName, setReportFileName] = useState("");
  const [generatingReport, setGeneratingReport] = useState(false);

  // Fetch invoices for this job
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<string>("");
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const openDialog = async (type: SendType) => {
    setSendType(type);
    setEmail(customerEmail || "");
    setReportBase64(null);
    setIncludeReport(false);
    setSelectedInvoice("");

    if (type === "report") {
      setSubject(`Job Report — ${job.reference_number}`);
      setMessage(`Dear ${job.customer || "Customer"},\n\nPlease find attached the report for job ${job.reference_number} (${job.name}).\n\nIf you have any questions, please don't hesitate to get in touch.\n\nKind regards,\nFieldReport`);
      setIncludeReport(true);
    } else if (type === "quote") {
      setSubject(`Quote for Further Works — ${job.reference_number}`);
      setMessage(`Dear ${job.customer || "Customer"},\n\nFollowing our recent inspection/works (${job.reference_number}), please find our recommendations for further works required.\n\nPlease review and let us know if you'd like to proceed.\n\nKind regards,\nFieldReport`);
    } else if (type === "invoice") {
      setSubject(`Invoice — ${job.reference_number}`);
      setMessage(`Dear ${job.customer || "Customer"},\n\nPlease find attached your invoice for job ${job.reference_number}.\n\nKind regards,\nFieldReport`);
      // Load invoices for this job
      setLoadingInvoices(true);
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, total, status")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });
      setInvoices(data || []);
      if (data && data.length > 0) setSelectedInvoice(data[0].id);
      setLoadingInvoices(false);
    }
    setDialogOpen(true);
  };

  const handleSend = async () => {
    if (!email.trim()) {
      toast({ title: "Error", description: "Customer email is required.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      // Build attachments array
      const attachments: { filename: string; content: string }[] = [];

      // Generate report PDF if included
      if (includeReport && reportBase64) {
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
          emailType: sendType,
          invoiceId: sendType === "invoice" ? selectedInvoice : undefined,
        },
      });

      if (error) throw error;

      toast({ title: "Email sent", description: `${sendType === "report" ? "Report" : sendType === "quote" ? "Quote" : "Invoice"} sent to ${email}.` });
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to send email.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="default" className="gap-1.5">
            <Send className="h-4 w-4" /> Send to Customer
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Send Documents</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => openDialog("report")} className="gap-2">
            <FileText className="h-4 w-4" /> Send Report
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openDialog("quote")} className="gap-2">
            <ClipboardList className="h-4 w-4" /> Send Quote
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openDialog("invoice")} className="gap-2">
            <Receipt className="h-4 w-4" /> Send Invoice
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              {sendType === "report" && "Send Customer Report"}
              {sendType === "quote" && "Send Quote for Further Works"}
              {sendType === "invoice" && "Send Invoice"}
            </DialogTitle>
            <DialogDescription>
              Email will be sent via FieldReport to the customer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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

            {/* Report attachment toggle */}
            {(sendType === "report" || sendType === "quote") && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="attach-report"
                  checked={includeReport}
                  onCheckedChange={(v) => setIncludeReport(!!v)}
                />
                <Label htmlFor="attach-report" className="text-sm">
                  Attach Customer Report PDF
                </Label>
                {includeReport && !reportBase64 && (
                  <CustomerReportPdf
                    jobId={jobId}
                    job={job}
                    onPdfGenerated={(base64, fileName) => {
                      setReportBase64(base64);
                      setReportFileName(fileName);
                      toast({ title: "Report ready", description: "PDF attached." });
                    }}
                    trigger={
                      <Button type="button" size="sm" variant="outline" className="ml-2 gap-1">
                        {generatingReport ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                        Generate PDF
                      </Button>
                    }
                  />
                )}
                {reportBase64 && (
                  <span className="text-xs font-medium ml-2 text-primary">✓ PDF attached</span>
                )}
              </div>
            )}

            {/* Invoice selection */}
            {sendType === "invoice" && (
              <div>
                <Label>Select Invoice</Label>
                {loadingInvoices ? (
                  <p className="text-sm text-muted-foreground">Loading invoices…</p>
                ) : invoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No invoices found for this job. Create one first.</p>
                ) : (
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={selectedInvoice}
                    onChange={(e) => setSelectedInvoice(e.target.value)}
                  >
                    {invoices.map((inv: any) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_number} — £{Number(inv.total).toFixed(2)} ({inv.status})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSend}
                disabled={sending || (sendType === "invoice" && !selectedInvoice)}
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
