// SendJobScanDialog — the "Send to customer" flow for scans that were filed
// AS JOBS (kind='job' rows on the paper-scan History list). Mirrors the
// look/feel of SendArchiveDialog so the History list has one-click Send for
// every row regardless of destination.
//
// Data source differences vs the archive variant:
//   - Report PDF path comes from the job's `document_type='report'` document
//     (Electronic report — <template>). We stored only a signed URL there, so
//     we parse the storage path back out with submissionsPathFromSignedUrl
//     and re-issue a fresh signed URL via resolveSubmissionsSignedUrl.
//   - Original scan pages come from the job's `document_type='source_scan'`
//     documents in the same way.
//   - Sends are logged into `job_emails` (direction='outbound') so they show
//     up in the job's Emails tab / timeline instead of the archive row.

import { useEffect, useMemo, useState } from "react";
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
import {
  Mail,
  Loader2,
  FileText,
  Images,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import {
  resolveSubmissionsSignedUrl,
} from "@/lib/resolveSubmissionsPath";
import { ensureJobScanReportBundle } from "@/lib/jobScanReports";
import { mergePdfUrlsToBase64 } from "@/lib/pdfMerge";
import {
  getGraphSendStatus,
  sendViaGraph,
  type GraphSendStatus,
} from "@/lib/graphMailSend";

interface Props {
  jobId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSent?: () => void;
}

type JobRow = {
  id: string;
  reference_number: string | null;
  name: string | null;
  customer_po: string | null;
  completed_at: string | null;
  due_date: string | null;
  org_id: string | null;
  customer: { id: string; name: string; email: string | null } | null;
  site: { id: string; name: string | null; address: string | null } | null;
};

async function urlToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve((reader.result as string).split(",")[1] || "");
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export default function SendJobScanDialog({
  jobId,
  open,
  onOpenChange,
  onSent,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [row, setRow] = useState<JobRow | null>(null);
  const [reportPaths, setReportPaths] = useState<string[]>([]);
  const [reportLabel, setReportLabel] = useState<string>("electronic-report");
  const [scanPaths, setScanPaths] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [includeScan, setIncludeScan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graphStatus, setGraphStatus] = useState<GraphSendStatus | null>(null);
  const [route, setRoute] = useState<"graph_send" | "graph_draft" | "app_mailer">(
    "app_mailer",
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const s = await getGraphSendStatus();
      if (cancelled) return;
      setGraphStatus(s);
      if (s.ready && s.mode === "send") setRoute("graph_send");
      else if (s.ready && s.mode === "draft") setRoute("graph_draft");
      else setRoute("app_mailer");
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error } = await supabase
        .from("jobs" as any)
        .select(
          "id, reference_number, name, customer_po, completed_at, due_date, org_id, customer:customers(id,name,email), site:sites(id,name,address)",
        )
        .eq("id", jobId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setError(error?.message || "Couldn't load job.");
        setLoading(false);
        return;
      }
      const j = data as unknown as JobRow;
      setRow(j);

      const { data: userData } = await supabase.auth.getUser();
      const bundle = await ensureJobScanReportBundle(jobId, { userId: userData.user?.id });
      setReportPaths(bundle.reportPaths);
      setScanPaths(bundle.scanPaths);
      const firstLabel = bundle.reportLabels[0] || j.name || "electronic-report";
      setReportLabel(
        (bundle.reportPaths.length > 1
          ? `${j.reference_number || "job"}-electronic-reports`
          : firstLabel.replace(/^electronic report\s*[—-]\s*/i, "")
        )
          .toLowerCase()
          .replace(/\.pdf$/i, "")
          .replace(/[^\w\-. ]+/g, "-")
          .replace(/\s+/g, "-"),
      );

      const seedEmail = j.customer?.email || "";
      setEmail(seedEmail);

      const ref =
        j.customer_po ||
        j.reference_number ||
        j.name ||
        firstLabel ||
        "Report";
      const siteName = j.site?.name || j.site?.address || "";
      const templateName =
        (firstLabel || "")
          .toString()
          .replace(/^electronic report\s*[—-]\s*/i, "") ||
        j.name ||
        "Report";
      const subjectBits = [templateName];
      if (siteName) subjectBits.push(siteName);
      setSubject(`${ref} — ${subjectBits.join(" — ")}`);

      const dateSrc = j.completed_at || j.due_date;
      const dateStr = dateSrc
        ? new Date(dateSrc).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })
        : "";
      setMessage(
        `Dear ${j.customer?.name || "Customer"},\n\nPlease find attached the ${templateName}${siteName ? ` for ${siteName}` : ""}${dateStr ? ` dated ${dateStr}` : ""}${j.customer_po ? ` (PO ${j.customer_po})` : ""}.\n\nAny questions, just give us a call or drop us an email.\n\nKind regards,`,
      );
      setIncludeScan(false);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, jobId]);

  const reference = useMemo(() => {
    if (!row) return "Report";
    return row.customer_po || row.reference_number || row.name || "Report";
  }, [row]);

  const canSend =
    !loading && !sending && reportPaths.length > 0 && email.trim().length > 3;

  const handleSend = async () => {
    if (!row) return;
    if (!email.trim()) {
      toast({
        title: "Recipient required",
        description: "Enter a customer email address.",
        variant: "destructive",
      });
      return;
    }
    if (reportPaths.length === 0) {
      toast({
        title: "No electronic report",
        description: "This job doesn't have an electronic PDF attached yet.",
        variant: "destructive",
      });
      return;
    }
    setSending(true);
    setError(null);
    try {
      const attachments: { filename: string; content: string }[] = [];

      const signedReports = [];
      for (const path of reportPaths) {
        const signed = await resolveSubmissionsSignedUrl(path);
        if (signed?.signedUrl) signedReports.push(signed.signedUrl);
      }
      if (signedReports.length === 0) throw new Error("Couldn't retrieve the electronic PDFs.");
      const b64 = await mergePdfUrlsToBase64(signedReports);
      attachments.push({ filename: `${reportLabel}.pdf`, content: b64 });

      if (includeScan && scanPaths.length) {
        for (let i = 0; i < scanPaths.length; i++) {
          const path = scanPaths[i];
          const s2 = await resolveSubmissionsSignedUrl(path);
          if (!s2?.signedUrl) continue;
          const b = await urlToBase64(s2.signedUrl);
          if (!b) continue;
          const ext = path.split(".").pop() || "jpg";
          attachments.push({
            filename: `original-scan-page-${i + 1}.${ext}`,
            content: b,
          });
        }
      }

      let channel: "app_mailer" | "graph_send" | "graph_draft" = "app_mailer";
      let webLink: string | null = null;

      if (route === "graph_send" || route === "graph_draft") {
        const result = await sendViaGraph({
          toEmail: email.trim(),
          toName: row.customer?.name,
          subject: subject.trim() || "Report",
          htmlBody: message.replace(/\n/g, "<br/>"),
          attachments: attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.filename.toLowerCase().endsWith(".pdf")
              ? "application/pdf"
              : undefined,
          })),
          logContext: {
            kind: "job",
            jobId: row.id,
            emailType: "job_report",
          },
          overrideMode: route === "graph_draft" ? "draft" : "send",
        });
        channel = result.mode === "draft" ? "graph_draft" : "graph_send";
        webLink = result.webLink;
      } else {
        const { error: sendError } = await supabase.functions.invoke(
          "send-customer-email",
          {
            body: {
              customerEmail: email.trim(),
              customerName: row.customer?.name || "Customer",
              subject: subject.trim() || "Report",
              htmlBody: message.replace(/\n/g, "<br/>"),
              attachments,
              emailType: "job_report",
              jobId: row.id,
            },
          },
        );
        if (sendError) throw sendError;
      }

      // Log to job_emails so the send shows on the job Emails tab. The Graph
      // edge function may already log for that channel — a duplicate row is
      // acceptable and clearly attributed by direction.
      if (channel === "app_mailer") {
        try {
          const { data: userData } = await supabase.auth.getUser();
          await supabase.from("job_emails" as any).insert({
            job_id: row.id,
            org_id: row.org_id,
            direction: "outbound",
            from_email: userData?.user?.email || null,
            to_emails: [email.trim()],
            subject: subject.trim(),
            snippet: message.slice(0, 200),
            body_text: message,
            attachment_count: attachments.length,
          });
        } catch (logErr) {
          console.warn("[send-job-scan] job_emails log failed", logErr);
        }
      }

      if (channel === "graph_draft" && webLink) {
        window.open(webLink, "_blank", "noopener");
        toast({
          title: "Draft ready in Outlook",
          description: `Review the draft in ${graphStatus?.mailbox || "Outlook"} and press Send.`,
        });
      } else {
        toast({
          title: "Email sent",
          description:
            channel === "graph_send"
              ? `Sent from ${graphStatus?.mailbox} to ${email.trim()}.`
              : `Report sent to ${email.trim()}.`,
        });
      }
      onSent?.();
      onOpenChange(false);
    } catch (err: any) {
      const msg =
        err?.message ||
        "Couldn't send the email. Check the address and try again.";
      setError(msg);
      toast({
        title: "Send failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> Send report to customer
          </DialogTitle>
          <DialogDescription>
            Emails the job's electronic PDF to the customer using your usual
            sender branding. Filed under job {row?.reference_number || jobId.slice(0, 8)}.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2" />
            Loading…
          </div>
        ) : !row ? (
          <div className="rounded border border-destructive/40 bg-destructive/5 text-destructive text-sm p-3 flex gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>{error || "Couldn't load job."}</div>
          </div>
        ) : !reportPath ? (
          <div className="rounded border border-amber-400 bg-amber-50 text-amber-900 text-sm p-3 flex gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              This job doesn't have an electronic PDF attached yet. Open the job
              to generate one, then try again.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              Reference: <span className="font-medium">{reference}</span>
              {row.customer?.name ? ` · ${row.customer.name}` : ""}
              {row.site?.name ? ` · ${row.site.name}` : ""}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="job-send-to">Customer email</Label>
              <Input
                id="job-send-to"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
              {!row.customer?.email && (
                <p className="text-xs text-muted-foreground">
                  No email on file for this customer — add one to send.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="job-send-subject">Subject</Label>
              <Input
                id="job-send-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="job-send-message">Message</Label>
              <Textarea
                id="job-send-message"
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <div className="text-sm font-medium">Delivery route</div>
              <RadioGroup value={route} onValueChange={(v) => setRoute(v as any)}>
                <label className={`flex items-start gap-2 rounded p-2 cursor-pointer ${!graphStatus?.ready ? "opacity-50" : "hover:bg-muted/50"}`}>
                  <RadioGroupItem value="graph_send" className="mt-1" disabled={!graphStatus?.ready} />
                  <div className="text-sm">
                    <div className="font-medium">
                      Send from {graphStatus?.mailbox || "Microsoft 365"}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Goes out through Outlook and lands in your Sent Items.
                    </p>
                  </div>
                </label>
                <label className={`flex items-start gap-2 rounded p-2 cursor-pointer ${!graphStatus?.ready ? "opacity-50" : "hover:bg-muted/50"}`}>
                  <RadioGroupItem value="graph_draft" className="mt-1" disabled={!graphStatus?.ready} />
                  <div className="text-sm">
                    <div className="font-medium">Create draft in Outlook</div>
                    <p className="text-xs text-muted-foreground">
                      Opens a pre-filled draft in Outlook — review and press Send there.
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-2 rounded p-2 hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="app_mailer" className="mt-1" />
                  <div className="text-sm">
                    <div className="font-medium">Send via Servexa mailer</div>
                    <p className="text-xs text-muted-foreground">
                      Fallback route. Won't appear in your Outlook Sent Items.
                    </p>
                  </div>
                </label>
              </RadioGroup>
              {!graphStatus?.ready && (
                <div className="text-xs text-muted-foreground border-t pt-2 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                  <span>
                    {graphStatus?.message ||
                      "Microsoft 365 isn't connected yet."}{" "}
                    <a
                      href="/settings?tab=email"
                      className="text-primary hover:underline inline-flex items-center gap-0.5"
                    >
                      Set up <ExternalLink className="h-3 w-3" />
                    </a>
                  </span>
                </div>
              )}
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Electronic report (PDF)</span>
                <span className="text-xs text-muted-foreground">
                  · always attached
                </span>
              </div>
              {scanPaths.length > 0 && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={includeScan}
                    onCheckedChange={(v) => setIncludeScan(v === true)}
                  />
                  <Images className="h-4 w-4 text-muted-foreground" />
                  <span>Also attach original scan ({scanPaths.length} page{scanPaths.length === 1 ? "" : "s"})</span>
                </label>
              )}
            </div>

            {error && (
              <div className="rounded border border-destructive/40 bg-destructive/5 text-destructive text-xs p-2 flex gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div>{error}</div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={sending}
              >
                Cancel
              </Button>
              <Button onClick={handleSend} disabled={!canSend}>
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Sending…
                  </>
                ) : route === "graph_draft" ? (
                  <>
                    <Mail className="h-4 w-4 mr-1" /> Create draft
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-1" /> Send
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
