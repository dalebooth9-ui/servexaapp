/**
 * Canvas 2D perspective correction ("deskew") plus document enhancement.
 * No WebGL, no external libraries — works on iOS Safari and Android Chrome.
 */

import type { Point, Quad } from "@/lib/documentEdgeDetection";

export type ScanMode = "color" | "grey" | "bw";

/** Solve an 8x8 linear system with Gaussian elimination. */
function solve(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const m = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-10) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const pv = m[col][col];
    for (let c = col; c <= n; c++) m[col][c] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col];
      if (!f) continue;
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row) => row[n]);
}

/**
 * Homography mapping destination (u,v) -> source (x,y).
 * dst corners are the rectangle 0..w, 0..h; src corners are the document quad.
 */
export function computeInverseHomography(src: Quad, w: number, h: number): number[] | null {
  const dst: Quad = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = dst[i];
    const { x, y } = src[i];
    a.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    a.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }
  const s = solve(a, b);
  return s ? [...s, 1] : null;
}

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Sensible output size derived from the quad, capped for performance. */
export function outputSizeForQuad(quad: Quad, maxSide = 1800): { width: number; height: number } {
  const width = Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2]));
  const height = Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2]));
  let w = Math.max(320, Math.round(width));
  let h = Math.max(320, Math.round(height));
  const scale = Math.min(1, maxSide / Math.max(w, h));
  w = Math.round(w * scale);
  h = Math.round(h * scale);
  return { width: w, height: h };
}

/** Bilinear sample from source pixel data. */
function sample(src: ImageData, x: number, y: number, out: number[]) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(src.width - 1, x0 + 1);
  const y1 = Math.min(src.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const cx0 = Math.min(src.width - 1, Math.max(0, x0));
  const cy0 = Math.min(src.height - 1, Math.max(0, y0));
  const i00 = (cy0 * src.width + cx0) * 4;
  const i10 = (cy0 * src.width + x1) * 4;
  const i01 = (y1 * src.width + cx0) * 4;
  const i11 = (y1 * src.width + x1) * 4;
  const d = src.data;
  for (let c = 0; c < 3; c++) {
    const top = d[i00 + c] * (1 - fx) + d[i10 + c] * fx;
    const bottom = d[i01 + c] * (1 - fx) + d[i11 + c] * fx;
    out[c] = top * (1 - fy) + bottom * fy;
  }
}

/** Brightness normalisation + contrast boost, then optional greyscale/B&W. */
function enhance(image: ImageData, mode: ScanMode) {
  const d = image.data;
  const n = d.length;

  // Percentile-ish black/white points from a luminance histogram.
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i += 4) {
    hist[(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0]++;
  }
  const total = n / 4;
  const lowCut = total * 0.02;
  const highCut = total * 0.02;
  let acc = 0;
  let black = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= lowCut) { black = v; break; } }
  acc = 0;
  let white = 255;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= highCut) { white = v; break; } }
  if (white - black < 24) { black = 0; white = 255; }
  const scale = 255 / (white - black);

  const contrast = 1.12;
  for (let i = 0; i < n; i += 4) {
    for (let c = 0; c < 3; c++) {
      let v = (d[i + c] - black) * scale;
      v = (v - 128) * contrast + 128;
      d[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
    if (mode !== "color") {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const out = mode === "bw" ? (g > 150 ? 255 : 0) : g;
      d[i] = d[i + 1] = d[i + 2] = out;
    }
  }
}

/** 3x3 sharpen convolution. */
function sharpen(image: ImageData): ImageData {
  const { width: w, height: h } = image;
  const src = image.data;
  const out = new ImageData(w, h);
  const dst = out.data;
  const k = [0, -0.35, 0, -0.35, 2.4, -0.35, 0, -0.35, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2]; dst[i + 3] = 255;
        continue;
      }
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let ki = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++, ki++) {
            sum += src[((y + dy) * w + (x + dx)) * 4 + c] * k[ki];
          }
        }
        dst[i + c] = sum < 0 ? 0 : sum > 255 ? 255 : sum;
      }
      dst[i + 3] = 255;
    }
  }
  return out;
}

/**
 * Warp the quad region of `source` into a flat rectangle and enhance it.
 * Returns the output canvas, or null if the geometry is degenerate.
 */
export function warpDocument(
  source: HTMLCanvasElement,
  quad: Quad,
  mode: ScanMode = "color",
  applySharpen = true,
): HTMLCanvasElement | null {
  const { width, height } = outputSizeForQuad(quad);
  const h = computeInverseHomography(quad, width, height);
  if (!h) return null;

  const sctx = source.getContext("2d", { willReadFrequently: true });
  if (!sctx) return null;
  const srcData = sctx.getImageData(0, 0, source.width, source.height);

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const octx = out.getContext("2d");
  if (!octx) return null;
  const dest = octx.createImageData(width, height);
  const dd = dest.data;
  const rgb = [0, 0, 0];

  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) {
      const denom = h[6] * u + h[7] * v + h[8];
      const x = (h[0] * u + h[1] * v + h[2]) / denom;
      const y = (h[3] * u + h[4] * v + h[5]) / denom;
      const i = (v * width + u) * 4;
      if (x < 0 || y < 0 || x > source.width - 1 || y > source.height - 1) {
        dd[i] = dd[i + 1] = dd[i + 2] = 255;
        dd[i + 3] = 255;
        continue;
      }
      sample(srcData, x, y, rgb);
      dd[i] = rgb[0];
      dd[i + 1] = rgb[1];
      dd[i + 2] = rgb[2];
      dd[i + 3] = 255;
    }
  }

  enhance(dest, mode);
  octx.putImageData(applySharpen && mode !== "bw" ? sharpen(dest) : dest, 0, 0);
  return out;
}

export function canvasToBlob(canvas: HTMLCanvasElement, mode: ScanMode): Promise<Blob | null> {
  const type = mode === "bw" ? "image/png" : "image/jpeg";
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, 0.9));
}
