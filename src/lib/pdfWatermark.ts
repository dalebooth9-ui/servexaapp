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
      // Add cache-busting to avoid stale cached versions
      img.src = "/images/viva-watermark.png?v=2";
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
  // Moderate size so it doesn't overwhelm table/text content
  const wmW = pageWidth * 0.55;
  const wmH = (watermark.naturalHeight / watermark.naturalWidth) * wmW;
  const x = (pageWidth - wmW) / 2;
  const yPos = (pageHeight - wmH) / 2;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const gState = (doc as any).GState({ opacity: 0.12 });
    doc.saveGraphicsState();
    (doc as any).setGState(gState);
    doc.addImage(watermark, "PNG", x, yPos, wmW, wmH);
    doc.restoreGraphicsState();
    // Reset font state to avoid watermark GState leaking into other pages
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
  }
}
