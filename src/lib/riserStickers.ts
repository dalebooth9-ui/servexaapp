import jsPDF from "jspdf";
import QRCode from "qrcode";

/** Public URL encoded in every riser sticker. Always the primary domain so
 *  stickers keep working whichever host printed them. */
export const STICKER_BASE_URL = "https://servexaapp.com/r/";
export const stickerUrl = (tag: string) => `${STICKER_BASE_URL}${encodeURIComponent(tag)}`;

/** Avery L4778: A4, 45.7 x 21.2 mm labels, 4 across x 12 down. */
export const L4778 = {
  pageW: 210,
  pageH: 297,
  labelW: 45.7,
  labelH: 21.2,
  cols: 4,
  rows: 12,
  marginTop: 21.5,
  marginLeft: 9.7,
  gapX: 2.5,
  gapY: 0,
} as const;

export const LABELS_PER_SHEET = L4778.cols * L4778.rows;

export type StickerOffsets = { top: number; left: number };

/** Top-left corner (mm) of label `index` (0-based) on its sheet. */
export function labelPosition(index: number, offsets: StickerOffsets = { top: 0, left: 0 }) {
  const i = index % LABELS_PER_SHEET;
  const col = i % L4778.cols;
  const row = Math.floor(i / L4778.cols);
  return {
    sheet: Math.floor(index / LABELS_PER_SHEET),
    x: L4778.marginLeft + offsets.left + col * (L4778.labelW + L4778.gapX),
    y: L4778.marginTop + offsets.top + row * (L4778.labelH + L4778.gapY),
  };
}

/** Draw a QR code as solid black vector squares with a white background. */
export function drawQr(doc: jsPDF, text: string, x: number, y: number, size: number) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const cell = size / n;
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, size, size, "F");
  doc.setFillColor(0, 0, 0);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) doc.rect(x + c * cell, y + r * cell, cell + 0.01, cell + 0.01, "F");
    }
  }
}

async function loadImage(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); img.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return { data: canvas.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight };
  } catch { return null; }
}

export type StickerItem = { asset_tag: string };

/**
 * Build the sticker pack PDF. `logoUrl` null → QR + ID only.
 * `testPage` → plain-paper alignment test with dotted label outlines.
 */
export async function buildStickerPackPdf(opts: {
  items: StickerItem[];
  logoUrl: string | null;
  offsets: StickerOffsets;
  testPage?: boolean;
}): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = opts.logoUrl ? await loadImage(opts.logoUrl) : null;
  const items = opts.testPage && opts.items.length === 0 ? [] : opts.items;

  if (opts.testPage) {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    (doc as any).setLineDashPattern?.([1, 1], 0);
    for (let i = 0; i < LABELS_PER_SHEET; i++) {
      const p = labelPosition(i, opts.offsets);
      doc.rect(p.x, p.y, L4778.labelW, L4778.labelH);
    }
    (doc as any).setLineDashPattern?.([], 0);
  }

  let currentSheet = 0;
  items.forEach((item, idx) => {
    const p = labelPosition(idx, opts.offsets);
    if (p.sheet > currentSheet) {
      doc.addPage();
      currentSheet = p.sheet;
    }
    const pad = 1.5;
    const qrSize = L4778.labelH - pad * 2; // ~18.2mm, includes quiet zone below
    const quiet = 1;
    drawQr(doc, stickerUrl(item.asset_tag), p.x + pad + quiet, p.y + pad + quiet, qrSize - quiet * 2);
    const textX = p.x + pad + qrSize + 1.5;
    const textW = L4778.labelW - (textX - p.x) - pad;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    const tagY = logo ? p.y + 9 : p.y + L4778.labelH / 2 + 2;
    doc.text(item.asset_tag, textX + textW / 2, tagY, { align: "center" });
    if (logo) {
      const maxW = textW, maxH = 8;
      const ratio = Math.min(maxW / logo.w, maxH / logo.h);
      const w = logo.w * ratio, h = logo.h * ratio;
      doc.addImage(logo.data, "PNG", textX + (textW - w) / 2, p.y + L4778.labelH - pad - h, w, h);
    }
  });
  return doc;
}

const OFFSET_KEY = "sticker_offsets_l4778";
export function loadOffsets(): StickerOffsets {
  try {
    const v = JSON.parse(localStorage.getItem(OFFSET_KEY) || "");
    return { top: Number(v.top) || 0, left: Number(v.left) || 0 };
  } catch { return { top: 0, left: 0 }; }
}
export function saveOffsets(o: StickerOffsets) {
  localStorage.setItem(OFFSET_KEY, JSON.stringify(o));
}

export const LABEL_STATUS_LABEL: Record<string, string> = { none: "None", printed: "Printed", placed: "Placed" };
