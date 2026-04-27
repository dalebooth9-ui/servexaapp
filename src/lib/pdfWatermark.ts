import jsPDF from "jspdf";
import type { RgbTriple } from "@/lib/extractLogoColors";

/** Shared watermark opacity values — accreditation logos use the same scale
 *  so they blend identically to the Viva Flame watermark on every template. */
export const WATERMARK_OPACITY = 0.10;
export const WATERMARK_OPACITY_UNTINTED = 0.08;

// --- Colour helpers (self-contained) ---
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): RgbTriple {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  return [
    Math.round(hue2rgb(h + 1/3) * 255),
    Math.round(hue2rgb(h) * 255),
    Math.round(hue2rgb(h - 1/3) * 255),
  ];
}

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
 * Recolour the watermark pixel-by-pixel so every shade in the image maps to a
 * corresponding shade of the brand colour (same hue/saturation, varying lightness).
 * Bright/light pixels → light tint; dark pixels → deep shade.
 */
function tintWatermark(watermark: HTMLImageElement, color: RgbTriple): string {
  const canvas = document.createElement("canvas");
  canvas.width = watermark.naturalWidth;
  canvas.height = watermark.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.drawImage(watermark, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Extract hue & saturation from brand colour; we'll vary lightness per pixel
  const [h, s] = rgbToHsl(color[0], color[1], color[2]);
  // Boost saturation so shades are vivid
  const sat = Math.max(s, 0.6);

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 10) continue; // skip fully transparent pixels

    // Perceived luminance of original pixel (0 = black, 1 = white)
    const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;

    // Map luminance to lightness range: dark pixels → deep shade, light → pale tint
    const targetL = 0.12 + lum * 0.65; // range ~0.12 (deep) … 0.77 (pale)

    const [nr, ng, nb] = hslToRgb(h, sat, targetL);
    data[i] = nr;
    data[i + 1] = ng;
    data[i + 2] = nb;
  }

  ctx.putImageData(imageData, 0, 0);
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

  const tintedDataUrl = brandColor ? tintWatermark(watermark, brandColor) : null;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const opacity = tintedDataUrl ? WATERMARK_OPACITY : WATERMARK_OPACITY_UNTINTED;
    const gState = (doc as any).GState({ opacity });
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
