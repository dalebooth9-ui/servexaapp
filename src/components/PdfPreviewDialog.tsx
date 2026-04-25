import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Loader2 } from "lucide-react";

export interface PdfPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Title shown in the dialog header. */
  title?: string;
  /** A direct URL to the document (PDF / image / etc.). One of `url` or `blob` is required. */
  url?: string | null;
  /** A Blob to render — useful for in-memory generated PDFs (no upload). */
  blob?: Blob | null;
  /** Suggested file name for the download button. */
  fileName?: string;
  /** MIME type — used to decide between iframe (PDF / HTML) and <img>. Defaults to application/pdf. */
  mimeType?: string;
}

/**
 * Lightweight in-app document preview shown in a large dialog.
 *
 * Renders PDFs and images directly via an <iframe>/<img>, so the user can
 * view documents without saving or downloading them first. A Download button
 * is always available inside the dialog for the cases where they do want a copy.
 */
export default function PdfPreviewDialog({
  open,
  onOpenChange,
  title,
  url: urlProp,
  blob,
  fileName,
  mimeType = "application/pdf",
}: PdfPreviewDialogProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setObjectUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setObjectUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  const isImage = mimeType.startsWith("image/");
  const downloadName = fileName || "document";
  // Append the filename as a URL fragment so the browser's built-in PDF
  // viewer (and any fallback UI) shows a human-readable name instead of the
  // blob UUID. The fragment is ignored when fetching the blob.
  const rawSrc = objectUrl || urlProp || null;
  const src = rawSrc
    ? `${rawSrc}${rawSrc.includes("#") ? "" : `#filename=${encodeURIComponent(downloadName)}`}`
    : null;

  const handleDownload = () => {
    if (!rawSrc) return;
    const a = document.createElement("a");
    a.href = rawSrc;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpenInTab = () => {
    if (rawSrc) window.open(rawSrc, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-4 py-3 border-b shrink-0 flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-sm truncate pr-4">
            {title || downloadName}
          </DialogTitle>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5"
              onClick={handleOpenInTab}
              disabled={!src}
              title="Open in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Open</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={handleDownload}
              disabled={!src}
              title="Download"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Download</span>
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 min-h-0 bg-muted/40">
          {!src ? (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Preparing preview…
            </div>
          ) : isImage ? (
            <div className="h-full w-full overflow-auto flex items-start justify-center p-4">
              <img src={src} alt={downloadName} className="max-w-full h-auto" />
            </div>
          ) : (
            <iframe
              key={src}
              src={src}
              title={downloadName}
              className="w-full h-full border-0 bg-background"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
