import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CustomerReportPdf from "./CustomerReportPdf";

interface Props {
  jobId: string;
  job: any;
  /** Optional WhatsApp recipient in international format, no + (e.g. 447700900123). */
  phone?: string;
}

/**
 * Generates the field job report PDF (with embedded photos via CustomerReportPdf),
 * names it with a timestamped folder-style path for easy archiving, downloads it,
 * then opens WhatsApp with a prefilled message ready to attach the saved file.
 */
export default function ShareReportWhatsApp({ jobId, job, phone }: Props) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const handlePdfGenerated = (base64: string, _autoName: string) => {
    // Timestamped folder-style filename: reports/<customer>/<YYYY-MM-DD>/<ref>-HHMMSS.pdf
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const safe = (s: string) => (s || "unknown").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    const customer = safe(job?.customers?.name || job?.customer || "customer");
    const ref = safe(job?.reference_number || "job");
    const folderPath = `reports/${customer}/${datePart}/${ref}-${timePart}.pdf`;
    const fileName = folderPath.replace(/\//g, "_");

    // Trigger download
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30000);

    // Prefill WhatsApp
    const siteName = job?.sites?.name || job?.site?.name || "";
    const message =
      `Field job report — ${job?.reference_number || ""}` +
      (siteName ? ` (${siteName})` : "") +
      `\nSaved as: ${folderPath}` +
      `\n\nPlease find the report attached.`;
    const waBase = phone ? `https://wa.me/${phone.replace(/[^\d]/g, "")}` : "https://wa.me/";
    const waUrl = `${waBase}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");

    toast({
      title: "Report ready for WhatsApp",
      description: `${fileName} downloaded — attach it in the WhatsApp tab.`,
    });
    setBusy(false);
  };

  return (
    <CustomerReportPdf
      jobId={jobId}
      job={job}
      onPdfGenerated={(b64, name) => handlePdfGenerated(b64, name)}
      trigger={
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          disabled={busy}
          onClick={() => setBusy(true)}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
          Share via WhatsApp
        </Button>
      }
    />
  );
}
