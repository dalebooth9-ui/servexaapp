import jsPDF from "jspdf";
import type { RgbTriple } from "@/lib/extractLogoColors";

let cachedWatermark: HTMLImageElement | null = null;

export async function loadWatermarkImage(): Promise<HTMLImageElement | null> {
  if (cachedWatermark) return cachedWatermark;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = "/images/viva-watermark.png?v=4";
    });
    cachedWatermark = img;
    return img;
  } catch {
    return null;
  }
}

/**
 * Draw a tinted rectangle behind the watermark when a custom brand colour is given.
 * This creates a subtle hue-wash over the page matching the customer's logo colour.
 */
function addColorWashToAllPages(doc: jsPDF, color: RgbTriple) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const gState = (doc as any).GState({ opacity: 0.04 });
    doc.saveGraphicsState();
    (doc as any).setGState(gState);
    doc.setFillColor(...color);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    doc.restoreGraphicsState();
  }
}

export function addWatermarkToAllPages(
  doc: jsPDF,
  watermark: HTMLImageElement,
  brandColor?: RgbTriple | null
) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const wmH = pageHeight * 0.85;
  const wmW = (watermark.naturalWidth / watermark.naturalHeight) * wmH;
  const x = (pageWidth - wmW) / 2;
  const yPos = (pageHeight - wmH) / 2 + 12;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const gState = (doc as any).GState({ opacity: 0.08 });
    doc.saveGraphicsState();
    (doc as any).setGState(gState);
    doc.addImage(watermark, "PNG", x, yPos, wmW, wmH);
    doc.restoreGraphicsState();
  }

  // Add a very subtle colour wash over the watermark if a custom brand colour exists
  if (brandColor) {
    addColorWashToAllPages(doc, brandColor);
  }
}
