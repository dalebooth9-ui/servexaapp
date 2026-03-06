import jsPDF from "jspdf";

const LOGO_PATHS = [
  "/accreditation/smas-logo.png",
  "/accreditation/constructionline-logo.png",
  "/accreditation/iso-9001-logo.jpg",
  "/accreditation/bafe-logo.jpeg",
];

let cachedLogos: (HTMLImageElement | null)[] | null = null;

export async function loadAccreditationLogos(): Promise<(HTMLImageElement | null)[]> {
  if (cachedLogos) return cachedLogos;
  const results = await Promise.all(
    LOGO_PATHS.map(
      (src) =>
        new Promise<HTMLImageElement | null>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = src;
        })
    )
  );
  cachedLogos = results;
  return results;
}

/**
 * Render a centred row of faded accreditation logos above the footer.
 * @param doc        jsPDF instance
 * @param logos      Pre-loaded images (nulls are skipped)
 * @param rowY       Top Y position for the logo row
 * @param logoH      Height of each logo (default 7mm)
 * @param opacity    Opacity 0–1 (default 0.22 — subtle, like watermark)
 */
export function renderAccreditationLogos(
  doc: jsPDF,
  logos: (HTMLImageElement | null)[],
  rowY: number,
  logoH = 7,
  opacity = 0.22
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const gap = 5; // gap between logos in mm

  // Calculate total width first
  const dims = logos.map((img) => {
    if (!img) return null;
    const aspect = img.naturalWidth / img.naturalHeight;
    return { img, w: aspect * logoH };
  });

  const valid = dims.filter(Boolean) as { img: HTMLImageElement; w: number }[];
  if (valid.length === 0) return;

  const totalW = valid.reduce((sum, d) => sum + d.w, 0) + gap * (valid.length - 1);
  let x = (pageWidth - totalW) / 2;

  const gState = (doc as any).GState({ opacity });
  doc.saveGraphicsState();
  (doc as any).setGState(gState);

  for (const { img, w } of valid) {
    try {
      const fmt = img.src.toLowerCase().endsWith(".jpg") || img.src.toLowerCase().endsWith(".jpeg") ? "JPEG" : "PNG";
      doc.addImage(img, fmt, x, rowY, w, logoH);
    } catch {
      // skip failed images
    }
    x += w + gap;
  }

  doc.restoreGraphicsState();
}

/**
 * Render accreditation logos on every page of the document.
 * Placed just above the footer (footerY is the top of the footer box).
 */
export function addAccreditationLogosToAllPages(
  doc: jsPDF,
  logos: (HTMLImageElement | null)[],
  footerY: number,
  logoH = 7
): void {
  const pageCount = doc.getNumberOfPages();
  const rowY = footerY - logoH - 2; // 2mm gap above footer
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    renderAccreditationLogos(doc, logos, rowY, logoH);
  }
}
