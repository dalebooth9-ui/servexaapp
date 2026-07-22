// Crop a signature region out of a source scan image using a bounding box
// returned by the OCR pass. Used by the archive conversion pipeline to carry
// customer/engineer signatures across from a paper original into the generated
// electronic report — see policy: never fabricate, but if the sig IS on the
// scan, embed the actual ink from the source. Percentages are 0-100 of the
// full image dimensions.
import { resolveSubmissionsSignedUrl } from "@/lib/resolveSubmissionsPath";

export type SignatureBBox = {
  x_min?: number;
  y_min?: number;
  x_max?: number;
  y_max?: number;
  page_index?: number;
};

function isValidBox(b: SignatureBBox | null | undefined): b is Required<Pick<SignatureBBox, "x_min" | "y_min" | "x_max" | "y_max">> {
  if (!b) return false;
  const { x_min, y_min, x_max, y_max } = b;
  return (
    typeof x_min === "number" &&
    typeof y_min === "number" &&
    typeof x_max === "number" &&
    typeof y_max === "number" &&
    x_max > x_min &&
    y_max > y_min
  );
}

async function loadImageFromPath(path: string): Promise<HTMLImageElement | null> {
  const resolved = await resolveSubmissionsSignedUrl(path);
  if (!resolved) return null;
  return await new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = resolved.signedUrl;
  });
}

/**
 * Crop a bbox out of the source scan page and return an HTMLImageElement
 * ready to be `addImage`'d into the jsPDF signature slot. Returns null if
 * the bbox is invalid or the source page can't be fetched.
 */
export async function cropSignatureFromScan(
  sourcePaths: string[],
  bbox: SignatureBBox | null | undefined,
): Promise<HTMLImageElement | null> {
  if (!isValidBox(bbox) || sourcePaths.length === 0) return null;
  const pageIdx = Math.max(0, Math.min(sourcePaths.length - 1, Number((bbox as SignatureBBox).page_index) || 0));
  const src = await loadImageFromPath(sourcePaths[pageIdx]);
  if (!src) return null;

  const w = src.naturalWidth;
  const h = src.naturalHeight;
  const x = Math.max(0, Math.floor((bbox.x_min / 100) * w));
  const y = Math.max(0, Math.floor((bbox.y_min / 100) * h));
  const cw = Math.min(w - x, Math.ceil(((bbox.x_max - bbox.x_min) / 100) * w));
  const ch = Math.min(h - y, Math.ceil(((bbox.y_max - bbox.y_min) / 100) * h));
  if (cw < 8 || ch < 8) return null;

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(src, x, y, cw, ch, 0, 0, cw, ch);

  // Blank-signature guard: if the crop has almost no dark ink, the customer
  // never signed the sheet — return null so the PDF leaves the signature
  // slot empty rather than embedding a grey rectangle labelled "Signature
  // carried from original scan".
  try {
    const img = ctx.getImageData(0, 0, cw, ch).data;
    let dark = 0;
    const totalPixels = cw * ch;
    // Sample every 4th pixel to keep this cheap on large crops.
    for (let i = 0; i < img.length; i += 16) {
      const r = img[i], g = img[i + 1], b = img[i + 2], a = img[i + 3];
      if (a < 40) continue;
      // luminance < 140 counts as "ink" (pen on paper is usually well below).
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 140) dark++;
    }
    const sampled = Math.max(1, Math.floor(totalPixels / 4));
    const inkRatio = dark / sampled;
    // Require at least 0.6% dark pixels — typical signatures are 3-15%.
    if (inkRatio < 0.006) return null;
  } catch {
    // getImageData can throw on tainted canvases; fall through and let the
    // downstream flow decide.
  }

  const dataUrl = canvas.toDataURL("image/png");
  return await new Promise((resolve) => {
    const out = new Image();
    out.onload = () => resolve(out);
    out.onerror = () => resolve(null);
    out.src = dataUrl;
  });
}
