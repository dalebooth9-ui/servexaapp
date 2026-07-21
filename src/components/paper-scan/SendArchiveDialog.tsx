// SendArchiveDialog — email the electronic PDF of an archived document to
// the linked customer. Reuses the existing `send-customer-email` edge
// function (same branding, same sender identity as job "Send to Customer")
// and logs the send onto `archived_documents.header_data._email_sends` so
// the office can see it's gone.
//
// Attach model matches the north star: PDF is the product (always attached
// if available); the original scan pages are an opt-in extra.

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
import { Send, Mail, Loader2, FileText, Images, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { resolveSubmissionsSignedUrl } from "@/lib/resolveSubmissionsPath";

interface Props {
  archivedId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Optional preloaded default email (skips a fetch when caller has it). */
  defaultEmail?: string;
}

type ArchiveRow = {
  id: string;
  customer_id: string | null;
  site_id: string | null;
  document_date: string | null;
  template_name: string | null;
  title: string | null;
  file_paths: string[];
  report_pdf_path: string | null;
  header_data: Record<string, any>;
  customers: { id: string; name: string; email: string | null } | null;
  sites: { id: string; name: string | null; address: string | null } | null;
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

export default function SendArchiveDialog({
  archivedId,
  open,
  onOpenChange,
  defaultEmail,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [row, setRow] = useState<ArchiveRow | null>(null);
  const [email, setEmail] = useState(defaultEmail || "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [includeScan, setIncludeScan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const poRef = useMemo<string | null>(() => {
    const h = row?.header_data || {};
    return (
      h.po_ref || h.po_number || h.customer_po || h.customerPo || null
    );
  }, [row]);

  const reference = useMemo(() => {
    if (poRef) return String(poRef);
    if (row?.title) return row.title;
    return row?.template_name || "Report";
  }, [poRef, row]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error } = await supabase
        .from("archived_documents")
        .select(
          "id, customer_id, site_id, document_date, template_name, title, file_paths, report_pdf_path, header_data, customers(id,name,email), sites(id,name,address)",
        )
        .eq("id", archivedId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setError(error?.message || "Couldn't load archived document.");
        setLoading(false);
        return;
      }
      const r = data as unknown as ArchiveRow;
      setRow(r);
      const seedEmail = defaultEmail || r.customers?.email || "";
      setEmail(seedEmail);

      const customerName = r.customers?.name || "Customer";
      const siteName = r.sites?.name || r.sites?.address || "";
      const templateName = r.template_name || "Report";
      const ref = (r.header_data?.po_ref ||
        r.header_data?.customer_po ||
        r.title ||
        templateName) as string;

      const subjectBits = [templateName];
      if (siteName) subjectBits.push(siteName);
      setSubject(`${ref} — ${subjectBits.join(" — ")}`);

      const dateStr = r.document_date
        ? new Date(r.document_date).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })
        : "";
      setMessage(
        `Dear ${customerName},\n\nPlease find attached the ${templateName}${siteName ? ` for ${siteName}` : ""}${dateStr ? ` dated ${dateStr}` : ""}${poRef ? ` (PO ${poRef})` : ""}.\n\nAny questions, just give us a call or drop us an email.\n\nKind regards,`,
      );
      setIncludeScan(false);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, archivedId, defaultEmail]);

  const canSend =
    !loading && !sending && !!row?.report_pdf_path && email.trim().length > 3;

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
    setSending(true);
    setError(null);
    try {
      const attachments: { filename: string; content: string }[] = [];

      // 1. Electronic PDF (required)
      if (row.report_pdf_path) {
        const signed = await resolveSubmissionsSignedUrl(row.report_pdf_path);
        if (!signed?.signedUrl) throw new Error("Couldn't retrieve the electronic PDF.");
        const b64 = await urlToBase64(signed.signedUrl);
        if (!b64) throw new Error("Couldn't read the electronic PDF file.");
        const stub = (row.template_name || "electronic-report")
          .toLowerCase()
          .replace(/[^\w\-. ]+/g, "-")
          .replace(/\s+/g, "-");
        attachments.push({ filename: `${stub}.pdf`, content: b64 });
      } else {
        throw new Error("This document has no electronic PDF yet.");
      }

      // 2. Original scan pages (optional)
      if (includeScan && row.file_paths?.length) {
        for (let i = 0; i < row.file_paths.length; i++) {
          const path = row.file_paths[i];
          const signed = await resolveSubmissionsSignedUrl(path);
          if (!signed) continue;
          const b64 = await urlToBase64(signed);
          if (!b64) continue;
          const ext = path.split(".").pop() || "jpg";
          attachments.push({
            filename: `original-scan-page-${i + 1}.${ext}`,
            content: b64,
          });
        }
      }

      const { error: sendError } = await supabase.functions.invoke(
        "send-customer-email",
        {
          body: {
            customerEmail: email.trim(),
            customerName: row.customers?.name || "Customer",
            subject: subject.trim() || "Report",
            htmlBody: message.replace(/\n/g, "<br/>"),
            attachments,
            emailType: "archive_report",
          },
        },
      );
      if (sendError) throw sendError;

      // 3. Log the send onto header_data._email_sends
      const { data: current } = await supabase
        .from("archived_documents")
        .select("header_data")
        .eq("id", row.id)
        .maybeSingle();
      const existing = ((current?.header_data as any)?._email_sends || []) as any[];
      const { data: userData } = await supabase.auth.getUser();
      const entry = {
        sent_at: new Date().toISOString(),
        sent_by: userData?.user?.id || null,
        sent_by_email: userData?.user?.email || null,
        recipient: email.trim(),
        subject: subject.trim(),
        included_scan: includeScan,
      };
      const nextHeader = {
        ...(current?.header_data as any || {}),
        _email_sends: [...existing, entry],
      };
      await supabase
        .from("archived_documents")
        .update({ header_data: nextHeader })
        .eq("id", row.id);

      toast({
        title: "Email sent",
        description: `Report sent to ${email.trim()}.`,
      });
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

  const sends = (row?.header_data?._email_sends as any[]) || [];

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> Send report to customer
          </DialogTitle>
          <DialogDescription>
            Emails the electronic PDF to the customer using your usual sender
            branding.
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
            <div>{error || "Couldn't load document."}</div>
          </div>
        ) : !row.report_pdf_path ? (
          <div className="rounded border border-amber-400 bg-amber-50 text-amber-900 text-sm p-3 flex gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              This document doesn't have an electronic PDF yet. Convert it
              first, then try again.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              Reference: <span className="font-medium">{reference}</span>
              {row.customers?.name ? ` · ${row.customers.name}` : ""}
              {row.sites?.name ? ` · ${row.sites.name}` : ""}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="archive-send-to">Customer email</Label>
              <Input
                id="archive-send-to"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
              {!row.customers?.email && (
                <p className="text-xs text-muted-foreground">
                  No email on file for this customer — add one to send.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="archive-send-subject">Subject</Label>
              <Input
                id="archive-send-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="archive-send-message">Message</Label>
              <Textarea
                id="archive-send-message"
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Electronic report (PDF)</span>
                <span className="text-xs text-muted-foreground">
                  · always attached
                </span>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={includeScan}
                  onCheckedChange={(v) => setIncludeScan(v === true)}
                  disabled={!row.file_paths?.length}
                />
                <Images className="h-4 w-4 text-muted-foreground" />
                <span>
                  Also attach the original scanned sheet
                  {row.file_paths?.length
                    ? ` (${row.file_paths.length} page${row.file_paths.length === 1 ? "" : "s"})`
                    : " (none available)"}
                </span>
              </label>
            </div>

            {error && (
              <div className="rounded border border-destructive/40 bg-destructive/5 text-destructive text-sm p-2 flex gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="flex-1">{error}</div>
              </div>
            )}

            {sends.length > 0 && (
              <div className="text-xs text-muted-foreground border-t pt-2">
                <div className="font-medium mb-1">Previously sent:</div>
                <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                  {sends
                    .slice()
                    .reverse()
                    .map((s, i) => (
                      <li key={i}>
                        {new Date(s.sent_at).toLocaleString("en-GB")} → {s.recipient}
                        {s.included_scan ? " (with scan)" : ""}
                      </li>
                    ))}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={sending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className="gap-1.5"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {sending ? "Sending…" : error ? "Retry send" : "Send email"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
