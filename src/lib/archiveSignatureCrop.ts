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

  const dataUrl = canvas.toDataURL("image/png");
  return await new Promise((resolve) => {
    const out = new Image();
    out.onload = () => resolve(out);
    out.onerror = () => resolve(null);
    out.src = dataUrl;
  });
}
