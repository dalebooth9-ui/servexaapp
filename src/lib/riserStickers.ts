import jsPDF from "jspdf";
import QRCode from "qrcode";
import vivaStickerLogo from '@/assets/vivafire-sticker-logo.png';

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
/** Fixed print geometry inside each label; never derive logo size from source-image whitespace. */
export const STICKER_CONTENT = { padding: 0.6, qrSize: 20, quiet: 0.6, logoWidth: 22.4, logoMaxHeight: 8, idFontSize: 16 } as const;

/** Sticker-only crop; the full Viva logo remains unchanged on all paperwork. */
export function stickerLogoUrl(url: string): string {
  return /\/images\/vivafire-logo-new\.png(?:[?#]|$)/.test(url) ? vivaStickerLogo : url;
}

export function stickerLogoSize(width:number,height:number){
  const scale=Math.min(STICKER_CONTENT.logoWidth/width,STICKER_CONTENT.logoMaxHeight/height);
  return {width:width*scale,height:height*scale};
}

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
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    // Remove blank margins; Viva's sticker source already excludes the tagline.
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let left=canvas.width,top=canvas.height,right=-1,bottom=-1;
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
      const i=(y*canvas.width+x)*4;
      if(Math.min(pixels[i],pixels[i+1],pixels[i+2])<235){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
    }
    if(right<left||bottom<top)return null;
    const cropped=document.createElement('canvas');cropped.width=right-left+1;cropped.height=bottom-top+1;
    const croppedCtx=cropped.getContext('2d');if(!croppedCtx)return null;
    croppedCtx.drawImage(canvas,left,top,cropped.width,cropped.height,0,0,cropped.width,cropped.height);
    return { data: cropped.toDataURL("image/png"), w: cropped.width, h: cropped.height };
  } catch { return null; }
}

export type StickerItem = { asset_tag: string; riserId?: string; outletNumber?: number };

/** Selected labels only; sort numerically and leave unused cells before the next riser. */
export function stickerSlots(items: StickerItem[], startPosition = 1) {
  const ordered = [...items].sort((a, b) => {
    const aRiser = a.riserId ?? a.asset_tag.split('-')[0];
    const bRiser = b.riserId ?? b.asset_tag.split('-')[0];
    return aRiser.localeCompare(bRiser) || (a.outletNumber ?? (Number(a.asset_tag.split('-')[1]) || 0)) - (b.outletNumber ?? (Number(b.asset_tag.split('-')[1]) || 0));
  });
  let slot = Math.max(1, Math.min(LABELS_PER_SHEET, Math.floor(startPosition))) - 1;
  let previous: string | undefined;
  return ordered.map(item => {
    const riser = item.riserId ?? item.asset_tag.split('-')[0];
    if (previous !== undefined && riser !== previous) slot = Math.ceil(slot / L4778.cols) * L4778.cols;
    previous = riser;
    return { item, index: slot++ };
  });
}

/**
 * Build the sticker pack PDF. `logoUrl` null → QR + ID only.
 * `testPage` → plain-paper alignment test with dotted label outlines.
 */
export async function buildStickerPackPdf(opts: {
  items: StickerItem[];
  logoUrl: string | null;
  offsets: StickerOffsets;
  testPage?: boolean;
  startPosition?: number;
}): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = opts.logoUrl ? await loadImage(stickerLogoUrl(opts.logoUrl)) : null;
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
  stickerSlots(items, opts.startPosition).forEach(({item, index}) => {
    const p = labelPosition(index, opts.offsets);
    if (p.sheet > currentSheet) {
      doc.addPage();
      currentSheet = p.sheet;
    }
    const pad = STICKER_CONTENT.padding;
    drawQr(doc, stickerUrl(item.asset_tag), p.x + pad, p.y + pad, STICKER_CONTENT.qrSize);
    const textX = p.x + pad + STICKER_CONTENT.qrSize + 2;
    const textW = L4778.labelW - (textX - p.x) - pad;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(STICKER_CONTENT.idFontSize);
    if (doc.getTextWidth(item.asset_tag) > textW) doc.setFontSize(STICKER_CONTENT.idFontSize * textW / doc.getTextWidth(item.asset_tag));
    const tagY = p.y + 7;
    doc.text(item.asset_tag, textX + textW / 2, tagY, { align: "center" });
    if (logo) {
      const {width:w,height:h}=stickerLogoSize(logo.w,logo.h);
      // Centre the logo in the space below the number, rather than bottom-aligning it.
      const logoTop = 8.5;
      const logoAreaHeight = L4778.labelH - pad - logoTop;
      doc.addImage(logo.data, "PNG", textX + (textW - w) / 2, p.y + logoTop + (logoAreaHeight - h) / 2, w, h);
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
