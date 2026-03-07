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
 * Tint a watermark image with the given brand colour by drawing it onto a canvas
 * using "multiply" compositing so the flame silhouette adopts the logo's hue.
 * Returns a data URL of the tinted PNG.
 */
function tintWatermark(watermark: HTMLImageElement, color: RgbTriple): string {
  const canvas = document.createElement("canvas");
  canvas.width = watermark.naturalWidth;
  canvas.height = watermark.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Draw the original watermark
  ctx.drawImage(watermark, 0, 0);

  // Overlay the brand colour using "multiply" blend mode so it tints the image
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Restore alpha from the original image so transparency is preserved
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(watermark, 0, 0);

  return canvas.toDataURL("image/png");
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

  // Pre-tint the watermark if a brand colour is provided
  const tintedDataUrl = brandColor ? tintWatermark(watermark, brandColor) : null;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const gState = (doc as any).GState({ opacity: 0.08 });
    doc.saveGraphicsState();
    (doc as any).setGState(gState);
    if (tintedDataUrl) {
      doc.addImage(tintedDataUrl, "PNG", x, yPos, wmW, wmH);
    } else {
      doc.addImage(watermark, "PNG", x, yPos, wmW, wmH);
    }
    doc.restoreGraphicsState();
  }
}
