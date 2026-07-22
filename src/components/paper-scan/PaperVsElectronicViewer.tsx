// PaperVsElectronicViewer — restores the "original scan vs generated
// electronic report" side-by-side view that existed before the paper-scans
// consolidation. Used from the History tab (ArchivedDocuments) and from the
// job details page (JobDocuments) so any filed item is always openable in a
// two-pane view: handwritten source on the left, clean electronic PDF on the
// right.

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Download, FileText, Images, Loader2 } from "lucide-react";
import PdfCanvasViewer from "@/components/PdfCanvasViewer";
import ZoomPane from "@/components/ZoomPane";

interface PaperVsElectronicViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  subtitle?: string;
  loading?: boolean;
  scanUrls: string[];
  scanFailedCount?: number;
  /** Single electronic PDF (back-compat). Prefer `electronicPdfUrls` when a
   *  job has multiple digitised sheets so the right pane matches the left. */
  electronicPdfUrl?: string | null;
  /** All electronic/digitised sheets for the item, in the same order as
   *  `scanUrls`. Rendered stacked and scrollable. */
  electronicPdfUrls?: string[];
}

export default function PaperVsElectronicViewer({
  open,
  onOpenChange,
  title,
  subtitle,
  loading = false,
  scanUrls,
  scanFailedCount = 0,
  electronicPdfUrl,
  electronicPdfUrls,
}: PaperVsElectronicViewerProps) {
  const pdfList = (electronicPdfUrls && electronicPdfUrls.length > 0)
    ? electronicPdfUrls
    : (electronicPdfUrl ? [electronicPdfUrl] : []);
  const multi = pdfList.length > 1;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {title || "Paper scan vs electronic report"}
          </DialogTitle>
          {subtitle && (
            <div className="text-sm text-muted-foreground">{subtitle}</div>
          )}
        </DialogHeader>

        {loading ? (
          <div className="flex-1 py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2" /> Loading…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 overflow-hidden">
            {/* Left: original handwritten scan pages */}
            <div className="flex flex-col min-h-0 border rounded-md bg-muted/20 overflow-hidden">
              <div className="px-3 py-2 border-b bg-muted/40 text-xs font-medium flex items-center gap-1.5">
                <Images className="h-3.5 w-3.5" /> Original scan
                {scanUrls.length > 1 && (
                  <span className="text-muted-foreground font-normal">
                    · {scanUrls.length} sheets
                  </span>
                )}
              </div>
              {scanUrls.length === 0 ? (
                <div className="m-2 rounded border border-amber-300 bg-amber-50 text-amber-900 text-xs p-3 flex gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium">Scan pages unavailable</div>
                    <div className="mt-1">
                      {scanFailedCount > 0
                        ? `Couldn't load ${scanFailedCount} page${scanFailedCount === 1 ? "" : "s"} from storage.`
                        : "No original scan pages are attached to this item."}
                    </div>
                  </div>
                </div>
              ) : (
                <ZoomPane className="flex-1 min-h-0">
                  <div className="p-2 space-y-3">
                    {scanUrls.map((url, i) => (
                      <div key={i} className="space-y-1">
                        {scanUrls.length > 1 && (
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-0.5">
                            Sheet {i + 1} of {scanUrls.length}
                          </div>
                        )}
                        <img
                          src={url}
                          alt={`Scan page ${i + 1}`}
                          className="w-full rounded border bg-white select-none"
                          draggable={false}
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                </ZoomPane>
              )}
            </div>

            {/* Right: generated electronic report(s) */}
            <div className="flex flex-col min-h-0 border rounded-md bg-muted/20 overflow-hidden">
              <div className="px-3 py-2 border-b bg-muted/40 text-xs font-medium flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" /> Electronic report
                  {multi && (
                    <span className="text-muted-foreground font-normal">
                      · {pdfList.length} sheets
                    </span>
                  )}
                </span>
                {pdfList.length === 1 && (
                  <a
                    href={pdfList[0]}
                    download
                    className="inline-flex items-center text-xs text-primary hover:underline"
                  >
                    <Download className="h-3 w-3 mr-1" /> Download
                  </a>
                )}
              </div>
              <div className="flex-1 min-h-0">
                {pdfList.length === 0 ? (
                  <div className="p-4 text-xs text-muted-foreground">
                    No electronic report has been generated for this item yet.
                  </div>
                ) : (
                  <ZoomPane className="h-full w-full">
                    <div className="space-y-3">
                      {pdfList.map((url, i) => (
                        <div key={`${i}-${url}`} className="space-y-1">
                          {multi && (
                            <div className="flex items-center justify-between px-1">
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Sheet {i + 1} of {pdfList.length}
                              </div>
                              <a
                                href={url}
                                download
                                className="inline-flex items-center text-[10px] text-primary hover:underline"
                              >
                                <Download className="h-3 w-3 mr-1" /> Download
                              </a>
                            </div>
                          )}
                          <PdfCanvasViewer
                            src={url}
                            title={`Electronic report ${multi ? i + 1 : ""}`.trim()}
                            className="w-full"
                          />
                        </div>
                      ))}
                    </div>
                  </ZoomPane>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

