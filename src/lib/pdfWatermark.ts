import jsPDF from "jspdf";

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

export function addWatermarkToAllPages(doc: jsPDF, watermark: HTMLImageElement) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  // Full-page watermark centered
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
}
