/**
 * Lightweight, client-only document edge detection.
 *
 * The frame is downscaled to a small working canvas, converted to greyscale,
 * run through a Sobel filter and the strongest edge pixels are reduced to the
 * four extreme corners of a rotated quadrilateral. This is fast enough to run
 * at ~10fps on a mid-range phone and good enough for rectangular documents
 * (compliance plates, certificates, sign-off sheets) on a contrasting surface.
 */

export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point]; // TL, TR, BR, BL

const WORK_W = 320;
const WORK_H = 240;

let workCanvas: HTMLCanvasElement | null = null;

function getWorkCtx(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!workCanvas) {
    workCanvas = document.createElement("canvas");
    workCanvas.width = WORK_W;
    workCanvas.height = WORK_H;
  }
  return workCanvas.getContext("2d", { willReadFrequently: true });
}

/** Sobel edge magnitude map of a greyscale buffer. */
function sobel(grey: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = grey[i - w - 1], t = grey[i - w], tr = grey[i - w + 1];
      const l = grey[i - 1], r = grey[i + 1];
      const bl = grey[i + w - 1], b = grey[i + w], br = grey[i + w + 1];
      const gx = -tl - 2 * l - bl + tr + 2 * r + br;
      const gy = -tl - 2 * t - tr + bl + 2 * b + br;
      out[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return out;
}

function orderQuad(points: Point[]): Quad {
  const bySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...points].sort((a, b) => a.x - a.y - (b.x - b.y));
  return [bySum[0], byDiff[byDiff.length - 1], bySum[bySum.length - 1], byDiff[0]] as Quad;
}

function quadArea(q: Quad): number {
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

/**
 * Detect the largest document-like quadrilateral in a video frame or image.
 * Returns corners in source (full-resolution) coordinates, or null.
 */
export function detectDocumentQuad(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): Quad | null {
  if (!sourceWidth || !sourceHeight) return null;
  const ctx = getWorkCtx();
  if (!ctx) return null;

  ctx.drawImage(source, 0, 0, WORK_W, WORK_H);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, WORK_W, WORK_H).data;
  } catch {
    return null; // tainted canvas
  }

  const grey = new Float32Array(WORK_W * WORK_H);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    grey[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  const edges = sobel(grey, WORK_W, WORK_H);

  // Adaptive threshold: keep the strongest ~4% of edge pixels.
  let max = 0;
  for (let i = 0; i < edges.length; i++) if (edges[i] > max) max = edges[i];
  if (max < 40) return null; // flat scene, nothing to lock on to
  const threshold = Math.max(40, max * 0.35);

  const pts: Point[] = [];
  const margin = 4;
  for (let y = margin; y < WORK_H - margin; y++) {
    for (let x = margin; x < WORK_W - margin; x++) {
      if (edges[y * WORK_W + x] >= threshold) pts.push({ x, y });
    }
  }
  if (pts.length < 200) return null;

  // Extreme points of the rotated bounding quadrilateral.
  let minSum = pts[0], maxSum = pts[0], minDiff = pts[0], maxDiff = pts[0];
  for (const p of pts) {
    const s = p.x + p.y;
    const d = p.x - p.y;
    if (s < minSum.x + minSum.y) minSum = p;
    if (s > maxSum.x + maxSum.y) maxSum = p;
    if (d < minDiff.x - minDiff.y) minDiff = p;
    if (d > maxDiff.x - maxDiff.y) maxDiff = p;
  }

  const quadSmall = orderQuad([minSum, maxDiff, maxSum, minDiff]);
  const area = quadArea(quadSmall);
  const frameArea = WORK_W * WORK_H;
  // Reject tiny specks and near-full-frame "detections" that are just noise.
  if (area < frameArea * 0.08 || area > frameArea * 0.985) return null;

  const sx = sourceWidth / WORK_W;
  const sy = sourceHeight / WORK_H;
  return quadSmall.map((p) => ({
    x: Math.min(sourceWidth, Math.max(0, p.x * sx)),
    y: Math.min(sourceHeight, Math.max(0, p.y * sy)),
  })) as Quad;
}

/** Default corners: a small inset of the whole frame. */
export function fullFrameQuad(width: number, height: number, inset = 0.04): Quad {
  const ix = width * inset;
  const iy = height * inset;
  return [
    { x: ix, y: iy },
    { x: width - ix, y: iy },
    { x: width - ix, y: height - iy },
    { x: ix, y: height - iy },
  ];
}

export { orderQuad, quadArea };
