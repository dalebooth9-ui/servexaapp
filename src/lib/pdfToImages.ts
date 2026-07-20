// Render every page of a PDF File into JPEG File objects using pdfjs-dist from CDN.
// Also exposes a helper to normalise a mixed drop (images + PDFs) into a flat
// list of page-image Files so callers can treat each element as "one page".
//
// Scanner-produced PDFs (CCITT G4, JBIG2, or otherwise unusual) can fail to
// rasterise here — we surface the underlying error to the console and to the
// caller instead of silently returning an empty list.

let pdfjsPromise: Promise<any> | null = null;

const PDFJS_VERSION = "3.11.174";
const PDFJS_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}`;

async function loadPdfJs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib: any = await import(
        /* @vite-ignore */ (`${PDFJS_CDN}/+esm` as any)
      );
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/build/pdf.worker.min.js`;
      return lib;
    })();
  }
  return pdfjsPromise;
}

export interface PdfRenderReport {
  pages: File[];
  totalPages: number;
  errors: string[];
  fatal?: string;
}

export async function renderPdfToJpegFilesDetailed(
  file: File,
  opts?: { scale?: number; quality?: number; maxPages?: number },
): Promise<PdfRenderReport> {
  const scale = opts?.scale ?? 1.6;
  const quality = opts?.quality ?? 0.82;
  const maxPages = opts?.maxPages ?? 200;

  const report: PdfRenderReport = { pages: [], totalPages: 0, errors: [] };

  let pdfjs: any;
  try {
    pdfjs = await loadPdfJs();
  } catch (e: any) {
    report.fatal = `pdf.js failed to load: ${e?.message || e}`;
    console.error(report.fatal, e);
    return report;
  }

  let pdf: any;
  try {
    const buf = await file.arrayBuffer();
    pdf = await pdfjs.getDocument({
      data: buf,
      cMapUrl: `${PDFJS_CDN}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS_CDN}/standard_fonts/`,
      isEvalSupported: false,
    }).promise;
  } catch (e: any) {
    report.fatal =
      `Could not open PDF "${file.name}": ${e?.message || e}. ` +
      `This is common for scanner PDFs that use CCITT G4 or JBIG2 fax compression.`;
    console.error("[pdfToImages] getDocument failed", file.name, e);
    return report;
  }

  report.totalPages = pdf.numPages;
  const total = Math.min(pdf.numPages, maxPages);
  const stem = file.name.replace(/\.[^.]+$/, "") || "scan";

  for (let i = 1; i <= total; i++) {
    try {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        report.errors.push(`page ${i}: no 2d canvas context`);
        continue;
      }
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
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
    }
  }

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
      }
      if (rep.pages.length === 0) {
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
