// Render every page of a PDF File into JPEG File objects using pdfjs-dist from CDN.
// Also exposes a helper to normalise a mixed drop (images + PDFs) into a flat
// list of page-image Files so callers can treat each element as "one page".

let pdfjsPromise: Promise<any> | null = null;

async function loadPdfJs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib: any = await import(
        /* @vite-ignore */ "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/+esm"
      );
      lib.GlobalWorkerOptions.workerSrc =
        "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
      return lib;
    })();
  }
  return pdfjsPromise;
}

export async function renderPdfToJpegFiles(
  file: File,
  opts?: { scale?: number; quality?: number; maxPages?: number },
): Promise<File[]> {
  const scale = opts?.scale ?? 1.6;
  const quality = opts?.quality ?? 0.82;
  const maxPages = opts?.maxPages ?? 200;

  const pdfjs = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;

  const out: File[] = [];
  const total = Math.min(pdf.numPages, maxPages);
  const stem = file.name.replace(/\.[^.]+$/, "") || "scan";

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
    if (!blob) continue;
    out.push(
      new File([blob], `${stem}-p${String(i).padStart(3, "0")}.jpg`, {
        type: "image/jpeg",
      }),
    );
  }

  return out;
}

/** Expand a user drop (images + PDFs) into a flat list of page-image files. */
export async function expandDropToPageFiles(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const f of files) {
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
      try {
        const pages = await renderPdfToJpegFiles(f);
        out.push(...pages);
      } catch (err) {
        console.warn("PDF render failed for", f.name, err);
      }
    } else if (f.type.startsWith("image/")) {
      out.push(f);
    }
  }
  return out;
}
