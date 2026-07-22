import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import { AlertTriangle, Loader2 } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfCanvasViewerProps {
  src: string | null;
  className?: string;
  title?: string;
  maxPages?: number;
}

export default function PdfCanvasViewer({
  src,
  className,
  title = "PDF preview",
  maxPages,
}: PdfCanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.replaceChildren();
    setError(null);

    if (!src) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let pdf: PDFDocumentProxy | null = null;
    const loadingTask = pdfjsLib.getDocument({ url: src.split("#")[0] });

    const render = async () => {
      setLoading(true);
      try {
        pdf = await loadingTask.promise;
        if (cancelled) return;

        const pageTotal = Math.min(pdf.numPages, maxPages || pdf.numPages);
        const availableWidth = Math.max(container.clientWidth - 32, 320);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let pageNo = 1; pageNo <= pageTotal; pageNo++) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNo);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.min(2, availableWidth / baseViewport.width);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) continue;

          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          canvas.className = "block max-w-full rounded-sm border shadow-sm";
          canvas.setAttribute("aria-label", `${title} page ${pageNo}`);

          const wrapper = document.createElement("div");
          wrapper.className = "flex justify-center py-3";
          wrapper.appendChild(canvas);
          container.appendChild(wrapper);

          await page.render({
            canvas,
            canvasContext: context,
            viewport,
            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
          }).promise;
          page.cleanup();
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not render PDF preview");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    render();

    return () => {
      cancelled = true;
      loadingTask.destroy().catch(() => undefined);
      pdf?.cleanup();
      container.replaceChildren();
    };
  }, [src, title, maxPages]);

  return (
    <div className={className || "h-full w-full"}>
      <div className="relative h-full w-full overflow-auto bg-muted/30">
        <div ref={containerRef} className="min-h-full px-3 py-2" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Rendering PDF…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive/70" />
            <p className="text-sm font-medium">Couldn’t render the PDF</p>
            <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}