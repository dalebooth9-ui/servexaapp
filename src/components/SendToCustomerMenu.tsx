import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import { Send, FileText, Receipt, ClipboardList, Loader2, Mail, ClipboardCheck, ShieldCheck, Award } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CustomerReportPdf from "./CustomerReportPdf";
import { generateJobSheetPdf } from "./JobSheetPdfExport";
import { useJobCategories } from "@/hooks/useJobCategories";

interface Props {
  jobId: string;
  job: any;
  customerEmail?: string;
}

type DocOption = "report" | "quote" | "invoice" | "jobsheets" | "rams" | "certs" | "coc";

export default function SendToCustomerMenu({ jobId, job, customerEmail }: Props) {
  const { toast } = useToast();
  const { categories: jobCategories } = useJobCategories();
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

  // Job sheet responses
  const [sheetResponses, setSheetResponses] = useState<any[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(new Set());
  const [sheetPdfs, setSheetPdfs] = useState<Record<string, { base64: string; fileName: string }>>({}); 

  // RAMS / compliance submissions attached to this job
  const [ramsSubmissions, setRamsSubmissions] = useState<{ id: string; file_name: string; file_url: string }[]>([]);
  const [selectedRams, setSelectedRams] = useState<Set<string>>(new Set());

  // Engineer certificates
  const [certSubmissions, setCertSubmissions] = useState<{ id: string; file_name: string; file_url: string; engineer_id: string }[]>([]);
  const [selectedCerts, setSelectedCerts] = useState<Set<string>>(new Set());

  // Certificate of Conformity
  const [cocCerts, setCocCerts] = useState<any[]>([]);
  const [cocPdfs, setCocPdfs] = useState<Record<string, { base64: string; fileName: string }>>({});

  const buildSubjectAndMessage = (docs: Set<DocOption>) => {
    const parts: string[] = [];
    if (docs.has("report")) parts.push("Report");
    if (docs.has("rams")) parts.push("RAMS");
    if (docs.has("certs")) parts.push("Engineer Certificates");
    if (docs.has("jobsheets")) parts.push("Job Sheets");
    if (docs.has("coc")) parts.push("Certificate of Conformity");
    if (docs.has("quote")) parts.push("Quote");
    if (docs.has("invoice")) parts.push("Invoice");
    setSubject(parts.length === 0 ? `Documents — ${job.reference_number}` : `${parts.join(" & ")} — ${job.reference_number}`);

    const customerName = job.customers?.name || job.customer || "Customer";
    const siteAddress = job.sites?.name
      ? `${job.sites.name}${job.address ? `, ${job.address}` : ""}`
      : job.address || "";
    const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

    const items: string[] = [];
    if (docs.has("report")) items.push("the report");
    if (docs.has("rams")) items.push("the RAMS documents");
    if (docs.has("certs")) items.push("the engineer certificates");
    if (docs.has("jobsheets")) items.push("the completed job sheets");
    if (docs.has("coc")) items.push("the Certificate of Conformity");
    if (docs.has("quote")) items.push("our quote for further works");
    if (docs.has("invoice")) items.push("your invoice");
    const itemStr = items.length > 0 ? items.join(", ") : "the documents";

    const ramsBlock = docs.has("rams")
      ? `\n\nJob Reference: ${job.reference_number}\nJob: ${job.name}\nCustomer: ${customerName}${siteAddress ? `\nSite / Address: ${siteAddress}` : ""}\nDate: ${today}`
      : "";

    setMessage(`Dear ${customerName},\n\nPlease find attached ${itemStr} for job ${job.reference_number} (${job.name}).${ramsBlock}\n\nIf you have any questions, please don't hesitate to get in touch.\n\nKind regards,\nFieldReport`);
  };

  const handleDocToggleImmediate = (doc: DocOption) => {
    const next = new Set(selectedDocs);
    if (next.has(doc)) next.delete(doc);
    else next.add(doc);
    setSelectedDocs(next);
    buildSubjectAndMessage(next);
  };

  const toggleSheet = (id: string) => {
    setSelectedSheets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleRams = (id: string) => {
    setSelectedRams((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCert = (id: string) => {
    setSelectedCerts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openDialog = async () => {
    setEmail(customerEmail || "");
    setReportBase64(null);
    setSelectedInvoice("");
    setSelectedDocs(new Set());
    setSelectedSheets(new Set());
    setSelectedRams(new Set());
    setSelectedCerts(new Set());
    setSheetPdfs({});
    setDialogOpen(true);

    // Pre-load invoices, sheet responses, RAMS submissions, and engineer certs in parallel
    setLoadingInvoices(true);
    const [invRes, sheetsRes, ramsRes, certsRes] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, invoice_number, total, status, document_type")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false }),
      supabase
        .from("job_sheet_responses")
        .select("id, template_id, submitted_at, status, job_sheet_templates(id, name, fields, branding)")
        .eq("job_id", jobId)
        .eq("status", "submitted")
        .order("submitted_at", { ascending: false }),
      supabase
        .from("submissions")
        .select("id, file_name, file_url")
        .eq("job_id", jobId)
        .eq("type", "document")
        .order("created_at", { ascending: false }),
      supabase
        .from("submissions")
        .select("id, file_name, file_url, engineer_id")
        .eq("job_id", jobId)
        .eq("type", "document")
        .like("file_name", "[Cert]%")
        .order("created_at", { ascending: false }),
    ]);
    setInvoices(invRes.data || []);
    if (invRes.data && invRes.data.length > 0) setSelectedInvoice(invRes.data[0].id);
    setSheetResponses(sheetsRes.data || []);
    // Exclude [Cert] files from RAMS list
    setRamsSubmissions((ramsRes.data || []).filter((s: any) => s.file_name && s.file_url && !s.file_name.startsWith("[Cert]")));
    setCertSubmissions((certsRes.data || []).filter((s: any) => s.file_name && s.file_url));
    setLoadingInvoices(false);

    // Load CoC certificates
    const { data: cocData } = await supabase
      .from("conformity_certificates" as any)
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    setCocCerts((cocData as any[]) || []);
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

      // Attach selected RAMS / compliance documents
      if (selectedDocs.has("rams") && selectedRams.size > 0) {
        for (const subId of selectedRams) {
          const sub = ramsSubmissions.find((s) => s.id === subId);
          if (!sub) continue;
          // Extract the storage path from the public URL
          const urlMatch = sub.file_url.match(/\/object\/(?:public|sign)\/submissions\/(.+?)(?:\?|$)/);
          const storagePath = urlMatch ? urlMatch[1] : null;
          if (!storagePath) continue;
          const { data: signed } = await supabase.storage.from("submissions").createSignedUrl(storagePath, 3600);
          if (!signed?.signedUrl) continue;
          try {
            const res = await fetch(signed.signedUrl);
            const blob = await res.blob();
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
              reader.readAsDataURL(blob);
            });
            attachments.push({ filename: sub.file_name || "document.pdf", content: base64 });
          } catch {}
        }
      }

      // Attach selected engineer certificates
      if (selectedDocs.has("certs") && selectedCerts.size > 0) {
        for (const subId of selectedCerts) {
          const sub = certSubmissions.find((s) => s.id === subId);
          if (!sub) continue;
          const urlMatch = sub.file_url.match(/\/object\/(?:public|sign)\/submissions\/(.+?)(?:\?|$)/);
          const storagePath = urlMatch ? urlMatch[1] : null;
          if (!storagePath) continue;
          const { data: signed } = await supabase.storage.from("submissions").createSignedUrl(storagePath, 3600);
          if (!signed?.signedUrl) continue;
          try {
            const res = await fetch(signed.signedUrl);
            const blob = await res.blob();
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
              reader.readAsDataURL(blob);
            });
            // Clean the display filename — strip "[Cert] " prefix and " — filename" suffix
            const withoutPrefix = (sub.file_name || "").replace(/^\[Cert\]\s*/, "");
            const sepIdx = withoutPrefix.lastIndexOf(" — ");
            const cleanName = sepIdx > -1 ? withoutPrefix.slice(0, sepIdx) : withoutPrefix;
            attachments.push({ filename: cleanName || sub.file_name || "certificate.pdf", content: base64 });
          } catch {}
        }
      }

      // Auto-generate job sheet PDFs on send
      if (selectedDocs.has("jobsheets") && selectedSheets.size > 0) {
        for (const sheetId of selectedSheets) {
          // Use cached PDF if already generated, otherwise generate now
          if (sheetPdfs[sheetId]) {
            attachments.push({ filename: sheetPdfs[sheetId].fileName, content: sheetPdfs[sheetId].base64 });
            continue;
          }
          const response = sheetResponses.find((r: any) => r.id === sheetId);
          if (!response) continue;
          const { data: fullResponse } = await supabase
            .from("job_sheet_responses")
            .select("*")
            .eq("id", sheetId)
            .single();
          if (!fullResponse) continue;
          const template = response.job_sheet_templates as any;
          const formData = (fullResponse.responses as Record<string, any>) || {};
          const { base64, fileName } = await generateJobSheetPdf(
            { id: template.id, name: template.name, description: null, fields: template.fields || [], branding: template.branding || {} },
            formData,
            { address: job.address, customer: job.customer, customers: job.customers, reference_number: job.reference_number, site: job.sites },
            jobId, undefined, fullResponse.submitted_at,
            jobCategories.find((c: any) => c.slug === job.category)?.name
              || (job.category ? job.category.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : ""),
          );
          attachments.push({ filename: fileName, content: base64 });
        }
      }

      const { error } = await supabase.functions.invoke("send-customer-email", {
        body: {
          customerEmail: email.trim(),
          customerName: job.customers?.name || job.customer || "Customer",
          subject: subject.trim(),
          htmlBody: message.replace(/\n/g, "<br/>"),
          attachments,
          jobId,
          emailType: Array.from(selectedDocs).join(","),
          invoiceId: selectedDocs.has("invoice") ? selectedInvoice : undefined,
        },
      });

      if (error) throw error;

      const docNames = Array.from(selectedDocs).map((d) => {
        if (d === "jobsheets") return "Job Sheets";
        return d.charAt(0).toUpperCase() + d.slice(1);
      });
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

  // allSheetsReady removed — sheets auto-generate on send

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
                    <p className="text-sm font-medium">Customer Report</p>
                    <p className="text-xs text-muted-foreground">Customer report PDF for this job</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <Checkbox
                    checked={selectedDocs.has("rams")}
                    onCheckedChange={() => handleDocToggleImmediate("rams")}
                  />
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">RAMS / Compliance Docs</p>
                    <p className="text-xs text-muted-foreground">
                      Attached documents for this job ({ramsSubmissions.length} available)
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <Checkbox
                    checked={selectedDocs.has("jobsheets")}
                    onCheckedChange={() => handleDocToggleImmediate("jobsheets")}
                  />
                  <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Job Sheets</p>
                    <p className="text-xs text-muted-foreground">
                      Completed job sheet PDFs ({sheetResponses.length} submitted)
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <Checkbox
                    checked={selectedDocs.has("certs")}
                    onCheckedChange={() => handleDocToggleImmediate("certs")}
                  />
                  <Award className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Engineer Certificates</p>
                    <p className="text-xs text-muted-foreground">
                      Attached engineer certification documents ({certSubmissions.length} available)
                    </p>
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

            {/* RAMS selection */}
            {selectedDocs.has("rams") && (
              <div className="space-y-2">
                <Label className="text-sm">Select RAMS / Compliance Documents to Attach</Label>
                {ramsSubmissions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No documents attached to this job yet. Attach compliance docs from the Compliance page first.</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {ramsSubmissions.map((sub) => (
                      <label key={sub.id} className="flex items-center gap-3 rounded-md border p-2.5 cursor-pointer hover:bg-muted/50 transition-colors">
                        <Checkbox
                          checked={selectedRams.has(sub.id)}
                          onCheckedChange={() => toggleRams(sub.id)}
                        />
                        <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <p className="text-sm truncate">{sub.file_name}</p>
                      </label>
                    ))}
                  </div>
                )}
                {selectedRams.size > 0 && (
                  <p className="text-xs text-muted-foreground">{selectedRams.size} document(s) will be attached</p>
                )}
              </div>
            )}

            {/* Engineer certificates selection */}
            {selectedDocs.has("certs") && (
              <div className="space-y-2">
                <Label className="text-sm">Select Engineer Certificates to Attach</Label>
                {certSubmissions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No engineer certificates attached to this job yet. Attach them via the engineer assignment badges.</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {certSubmissions.map((cert) => {
                      const withoutPrefix = cert.file_name.replace(/^\[Cert\]\s*/, "");
                      const sepIdx = withoutPrefix.lastIndexOf(" — ");
                      const displayName = sepIdx > -1 ? withoutPrefix.slice(0, sepIdx) : withoutPrefix;
                      return (
                        <label key={cert.id} className="flex items-center gap-3 rounded-md border p-2.5 cursor-pointer hover:bg-muted/50 transition-colors">
                          <Checkbox
                            checked={selectedCerts.has(cert.id)}
                            onCheckedChange={() => toggleCert(cert.id)}
                          />
                          <Award className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <p className="text-sm truncate">{displayName}</p>
                        </label>
                      );
                    })}
                  </div>
                )}
                {selectedCerts.size > 0 && (
                  <p className="text-xs text-muted-foreground">{selectedCerts.size} certificate(s) will be attached</p>
                )}
              </div>
            )}

            {/* Job sheet selection */}
            {selectedDocs.has("jobsheets") && (
              <div className="space-y-2">
                <Label className="text-sm">Select Job Sheets to Attach</Label>
                {sheetResponses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No submitted job sheets for this job.</p>
                ) : (
                  <>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {sheetResponses.map((resp: any) => {
                        const tpl = resp.job_sheet_templates;
                        const submittedDate = resp.submitted_at
                          ? new Date(resp.submitted_at).toLocaleDateString("en-GB")
                          : "—";
                        return (
                          <label
                            key={resp.id}
                            className="flex items-center gap-3 rounded-md border p-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                          >
                            <Checkbox
                              checked={selectedSheets.has(resp.id)}
                              onCheckedChange={() => toggleSheet(resp.id)}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{tpl?.name || "Job Sheet"}</p>
                              <p className="text-xs text-muted-foreground">Submitted {submittedDate}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    {selectedSheets.size > 0 && (
                      <p className="text-xs text-muted-foreground pt-1">
                        {selectedSheets.size} sheet{selectedSheets.size !== 1 ? "s" : ""} will be generated automatically on send
                      </p>
                    )}
                  </>
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
