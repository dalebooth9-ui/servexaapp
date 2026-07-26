import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import PdfPreviewDialog from "@/components/PdfPreviewDialog";
import { useToast } from "@/hooks/use-toast";
import {
  bulkPrintJobSheets,
  type BulkPrintSelection,
  type BulkPrintResult,
} from "@/lib/bulkPrintJobSheets";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selection: BulkPrintSelection | null;
}

export default function BulkPrintSheetsDialog({ open, onOpenChange, selection }: Props) {
  const { toast } = useToast();
  const [progress, setProgress] = useState<{ done: number; total: number; label?: string }>({
    done: 0,
    total: 0,
  });
  const [result, setResult] = useState<BulkPrintResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!open || !selection) return;
    setResult(null);
    setError(null);
    setProgress({ done: 0, total: selection.visits.length });
    setRunning(true);
    let cancelled = false;
    (async () => {
      try {
        const r = await bulkPrintJobSheets(selection, (p) => {
          if (!cancelled) setProgress({ done: p.done, total: p.total, label: p.currentLabel });
        });
        if (cancelled) return;
        setResult(r);
        setPreviewOpen(true);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Failed to build combined PDF");
        toast({ title: "Bulk print failed", description: e?.message, variant: "destructive" });
      } finally {
        if (!cancelled) setRunning(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selection, toast]);

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <>
      <Dialog open={open && !previewOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" />
              Print job sheets
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {selection && (
              <div className="text-sm text-muted-foreground">{selection.scopeLabel}</div>
            )}
            {running && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>
                    Rendering {progress.done} of {progress.total} jobs
                    {progress.label ? ` — ${progress.label}` : ""}
                  </span>
                </div>
                <Progress value={pct} />
              </div>
            )}
            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {result && !running && !previewOpen && (
              <div className="text-sm">
                Built {result.generatedCount} sheet
                {result.generatedCount === 1 ? "" : "s"}
                {result.missing.length > 0 && (
                  <span className="text-amber-700 dark:text-amber-400">
                    {" "}
                    · {result.missing.length} job{result.missing.length === 1 ? "" : "s"} without a
                    template
                  </span>
                )}
                .
                <div className="mt-3">
                  <Button size="sm" onClick={() => setPreviewOpen(true)}>
                    <Printer className="mr-1.5 h-4 w-4" /> Open preview
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {result && (
        <PdfPreviewDialog
          open={previewOpen}
          onOpenChange={(v) => {
            setPreviewOpen(v);
            if (!v) onOpenChange(false);
          }}
          title={`Job sheets — ${selection?.scopeLabel || ""}`}
          blob={result.blob}
          fileName={result.fileName}
        />
      )}
    </>
  );
}
