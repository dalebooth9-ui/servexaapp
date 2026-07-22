// Render every page of a PDF File into JPEG File objects using the locally
// bundled pdfjs-dist. Rendering-based splitting is codec-agnostic — it works
// for image PDFs, mixed PDFs, and scanner-native black-and-white PDFs that
// use CCITT G4 or JBIG2 fax compression (which pdf.js decodes internally).
//
// Memory: pages are rendered sequentially and each canvas is released before
// the next page is opened, so peak memory stays at ~one page worth of pixels.

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

let workerConfigured = false;
function ensureWorker() {
  if (workerConfigured) return;
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  workerConfigured = true;
}

export interface PdfRenderReport {
  pages: File[];
  totalPages: number;
  errors: string[];
  fatal?: string;
}

/** Target ~150 DPI equivalent. PDF user units are 1/72", so scale = DPI/72. */
const DEFAULT_SCALE = 150 / 72;
const MAX_CANVAS_PIXELS = 4200 * 4200; // guard against huge scanner pages

function releaseCanvas(canvas: HTMLCanvasElement) {
  // Free GPU/CPU-backed pixel memory before the next page renders.
  canvas.width = 0;
  canvas.height = 0;
}

export async function renderPdfToJpegFilesDetailed(
  file: File,
  opts?: { scale?: number; quality?: number; maxPages?: number },
): Promise<PdfRenderReport> {
  const baseScale = opts?.scale ?? DEFAULT_SCALE;
  const quality = opts?.quality ?? 0.82;
  const maxPages = opts?.maxPages ?? 200;

  const report: PdfRenderReport = { pages: [], totalPages: 0, errors: [] };

  try {
    ensureWorker();
  } catch (e: any) {
    report.fatal = `pdf.js worker failed to initialise: ${e?.message || e}`;
    console.error(report.fatal, e);
    return report;
  }

  let pdf: any;
  try {
    const buf = await file.arrayBuffer();
    pdf = await (pdfjsLib as any).getDocument({
      data: new Uint8Array(buf),
      isEvalSupported: false,
      disableFontFace: true,
    }).promise;
  } catch (e: any) {
    report.fatal = `Could not open PDF "${file.name}": ${e?.message || e}`;
    console.error("[pdfToImages] getDocument failed", file.name, e);
    return report;
  }

  report.totalPages = pdf.numPages;
  const total = Math.min(pdf.numPages, maxPages);
  const stem = file.name.replace(/\.[^.]+$/, "") || "scan";

  for (let i = 1; i <= total; i++) {
    let canvas: HTMLCanvasElement | null = null;
    let page: any = null;
    try {
      page = await pdf.getPage(i);

      // Clamp scale so absurdly large pages don't blow up memory.
      let scale = baseScale;
      let viewport = page.getViewport({ scale });
      const pixels = viewport.width * viewport.height;
      if (pixels > MAX_CANVAS_PIXELS) {
        scale = scale * Math.sqrt(MAX_CANVAS_PIXELS / pixels);
        viewport = page.getViewport({ scale });
      }

      canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        report.errors.push(`page ${i}: no 2d canvas context`);
        continue;
      }
      // White backdrop so bitonal scanner pages export as B/W-on-white JPEG.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;

      const blob: Blob | null = await new Promise((resolve) =>
        canvas!.toBlob((b) => resolve(b), "image/jpeg", quality),
      );
      if (!blob) {
        report.errors.push(`page ${i}: canvas.toBlob returned null`);
        continue;
      }
      report.pages.push(
        new File([blob], `${stem}-p${String(i).padStart(3, "0")}.jpg`, {
          type: "image/jpeg",
        }),
      );
    } catch (e: any) {
      const msg = `page ${i}: ${e?.message || e}`;
      report.errors.push(msg);
      console.warn("[pdfToImages] page render failed", file.name, i, e);
    } finally {
      // Release memory before rendering the next page.
      if (canvas) releaseCanvas(canvas);
      try {
        page?.cleanup?.();
      } catch {}
    }
  }

  try {
    await pdf.cleanup?.();
    await pdf.destroy?.();
  } catch {}

  return report;
}

export async function renderPdfToJpegFiles(
  file: File,
  opts?: { scale?: number; quality?: number; maxPages?: number },
): Promise<File[]> {
  const rep = await renderPdfToJpegFilesDetailed(file, opts);
  return rep.pages;
}

export interface ExpandReport {
  pages: File[];
  /** PDFs that produced zero pages — good candidates for a "file as-is" fallback. */
  unrenderable: { file: File; reason: string }[];
  /** All non-fatal errors collected across inputs. */
  errors: string[];
}

/** Expand a user drop (images + PDFs) into a flat list of page-image files, with a diagnostic report. */
export async function expandDropToPageFilesDetailed(
  files: File[],
): Promise<ExpandReport> {
  const out: File[] = [];
  const unrenderable: { file: File; reason: string }[] = [];
  const errors: string[] = [];
  for (const f of files) {
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
      const rep = await renderPdfToJpegFilesDetailed(f);
      if (rep.pages.length > 0) {
        out.push(...rep.pages);
      } else {
        unrenderable.push({
          file: f,
          reason:
            rep.fatal ||
            rep.errors[0] ||
            "No pages rendered (unknown reason)",
        });
      }
      errors.push(...rep.errors);
      if (rep.fatal) errors.push(rep.fatal);
    } else if (f.type.startsWith("image/")) {
      out.push(f);
    }
  }
  return { pages: out, unrenderable, errors };
}

/** Expand a user drop (images + PDFs) into a flat list of page-image files. */
export async function expandDropToPageFiles(files: File[]): Promise<File[]> {
  const rep = await expandDropToPageFilesDetailed(files);
  return rep.pages;
}
