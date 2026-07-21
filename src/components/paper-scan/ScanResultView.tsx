// ScanResultView — the final screen of the paper-scan happy path.
//
// After the reviewer taps "Looks good", the PDF is built and this view
// takes over the review dialog. The PDF is the product: it's front-and-
// centre with Download / Send to customer / Open destination.
//
// Everything that used to be blocking (attach-to-existing prompt, defect
// review, missing-signature) is presented here as a dismissible follow-up
// card, never as a modal that gates the PDF.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import PdfPreviewDialog from "@/components/PdfPreviewDialog";
import SendArchiveDialog from "@/components/paper-scan/SendArchiveDialog";
import {
  CheckCircle2,
  Download,
  Eye,
  ExternalLink,
  Mail,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export type ScanResultDestination =
  | { kind: "job"; jobId: string; jobRef: string }
  | { kind: "archive"; archivedId: string }
  | { kind: "unmatched"; archivedId: string };

export interface ScanResultViewProps {
  reportPdfPath: string | null;
  destination: ScanResultDestination;
  templateName: string | null;
  onScanAnother: () => void;
  onClose: () => void;
}

export default function ScanResultView({
  reportPdfPath,
  destination,
  templateName,
  onScanAnother,
  onClose,
}: ScanResultViewProps) {
  const navigate = useNavigate();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  useEffect(() => {
    if (!reportPdfPath) {
      setSignedUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage
        .from("submissions")
        .createSignedUrl(reportPdfPath, 60 * 60);
      if (!cancelled) setSignedUrl(data?.signedUrl || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [reportPdfPath]);

  const fileName = useMemo(() => {
    const stub = (templateName || "electronic-report")
      .toLowerCase()
      .replace(/[^\w\-. ]+/g, "-")
      .replace(/\s+/g, "-");
    return `${stub}.pdf`;
  }, [templateName]);

  const openDestination = () => {
    if (destination.kind === "job") {
      navigate(`/jobs/${destination.jobId}`);
    } else {
      navigate(`/paper-scans?tab=history&doc=${destination.archivedId}`);
    }
    onClose();
  };

  const sendToCustomer = () => {
    if (destination.kind === "job") {
      // Deep-link to the job — existing SendToCustomerMenu picks up from here.
      navigate(`/jobs/${destination.jobId}?send=1`);
      onClose();
      return;
    }
    // Archive-only: open the archive-specific send dialog inline. No
    // navigating away, no dead-end.
    setSendOpen(true);
  };

  const archivedId =
    destination.kind === "archive" || destination.kind === "unmatched"
      ? destination.archivedId
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border bg-emerald-500/10 border-emerald-500/40 p-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
            Electronic report ready
          </p>
          <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80">
            {destination.kind === "job" && (
              <>Filed as completed job <strong>{destination.jobRef}</strong>.</>
            )}
            {destination.kind === "archive" && (
              <>Filed to the archive.</>
            )}
            {destination.kind === "unmatched" && (
              <>Filed to the archive as unmatched.</>
            )}
            {reportPdfPath
              ? " The PDF is ready to view, download or send."
              : " Filing complete — no clean PDF was generated for this sheet."}
          </p>
        </div>
      </div>

      {/* PDF preview thumbnail card */}
      <div className="rounded-lg border overflow-hidden bg-muted/20">
        <div className="aspect-[4/3] w-full bg-muted flex items-center justify-center">
          {reportPdfPath && signedUrl ? (
            <iframe
              title="Electronic report preview"
              src={signedUrl}
              className="h-full w-full"
            />
          ) : (
            <div className="text-center text-muted-foreground text-xs px-6">
              <Loader2 className="h-5 w-5 mx-auto animate-spin mb-2 opacity-60" />
              {reportPdfPath
                ? "Loading preview…"
                : "No electronic PDF for this sheet (scan filed as-is)."}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => setPreviewOpen(true)}
          disabled={!reportPdfPath}
          className="min-h-11"
        >
          <Eye className="mr-1.5 h-4 w-4" /> View full PDF
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (signedUrl) {
              const a = document.createElement("a");
              a.href = signedUrl;
              a.download = fileName;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }
          }}
          disabled={!signedUrl}
          className="min-h-11"
        >
          <Download className="mr-1.5 h-4 w-4" /> Download
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={sendToCustomer}
          className="min-h-11"
        >
          <Mail className="mr-1.5 h-4 w-4" /> Send to customer
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={openDestination}
          className="min-h-11"
        >
          <ExternalLink className="mr-1.5 h-4 w-4" />
          {destination.kind === "job" ? "Open job" : "Open archive entry"}
        </Button>
      </div>

      <div className="flex items-center justify-between pt-3 border-t">
        <Button type="button" variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button type="button" variant="outline" onClick={onScanAnother}>
          <RefreshCw className="mr-1.5 h-4 w-4" /> Scan another
        </Button>
      </div>

      <PdfPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        url={signedUrl}
        fileName={fileName}
        title={templateName || "Electronic report"}
      />

      {archivedId && (
        <SendArchiveDialog
          archivedId={archivedId}
          open={sendOpen}
          onOpenChange={setSendOpen}
        />
      )}
    </div>
  );
}
