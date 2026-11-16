// Clean up a phone photo of a handwritten sheet before the AI reads it:
// find the page, fix the perspective (which also straightens it), even out
// shadows and glare, stretch contrast and sharpen. The original photo is never
// changed — callers keep it as evidence and only send the cleaned copy.
//
// Pure greyscale helpers are exported for tests; `prepareSheetImage` is the
// browser wrapper that uses a canvas.

export type Gray = { w: number; h: number; d: Float32Array };
export type Pt = { x: number; y: number };

export type SheetQuality = {
  /** Variance of the Laplacian on a normalised-size copy. Low = blurry. */
  sharpness: number;
  /** Mean brightness 0–255 of the original. */
  brightness: number;
  /** Share of blown-out (near white) pixels — glare. */
  glare: number;
  pageFound: boolean;
  /** Residual rotation corrected after the perspective fix, degrees. */
  skewDeg: number;
  /** Plain-English problems, empty when the photo looks usable. */
  issues: string[];
  tooPoor: boolean;
};

export function toGray(rgba: Uint8ClampedArray, w: number, h: number): Gray {
  const d = new Float32Array(w * h);
  for (let i = 0, j = 0; i < d.length; i++, j += 4) d[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
  return { w, h, d };
}

/** Box blur via an integral image. */
export function boxBlur(g: Gray, r: number): Gray {
  const { w, h, d } = g;
  const W = w + 1;
  const ii = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += d[y * w + x];
      ii[(y + 1) * W + x + 1] = ii[y * W + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const s = ii[y1 * W + x1] - ii[y0 * W + x1] - ii[y1 * W + x0] + ii[y0 * W + x0];
      out[y * w + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return { w, h, d: out };
}

export function resizeGray(g: Gray, w: number, h: number): Gray {
  const out = new Float32Array(w * h);
  const sx = g.w / w, sy = g.h / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = sample(g, (x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5);
  return { w, h, d: out };
}

function sample(g: Gray, x: number, y: number): number {
  const { w, h, d } = g;
  if (x < 0) x = 0; if (y < 0) y = 0; if (x > w - 1) x = w - 1; if (y > h - 1) y = h - 1;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const a = d[y0 * w + x0], b = d[y0 * w + x1], c = d[y1 * w + x0], e = d[y1 * w + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + e) * fx * fy;
}

export function otsu(g: Gray): number {
  const hist = new Array(256).fill(0);
  for (const v of g.d) hist[Math.max(0, Math.min(255, v | 0))]++;
  const total = g.d.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, t = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; t = i; }
  }
  return t;
}

/** Corners of the paper (TL, TR, BR, BL) in `g` coordinates, or null when no
 *  clear page stands out from the background. */
export function findPageCorners(g: Gray): Pt[] | null {
  const S = 240;
  const scale = S / Math.max(g.w, g.h);
  const sw = Math.max(8, Math.round(g.w * scale)), sh = Math.max(8, Math.round(g.h * scale));
  const small = boxBlur(resizeGray(g, sw, sh), 2);
  const t = otsu(small);
  const mask = new Uint8Array(sw * sh);
  for (let i = 0; i < mask.length; i++) mask[i] = small.d[i] > t ? 1 : 0;
  // Largest bright connected region = the page.
  const label = new Int32Array(sw * sh);
  let bestLabel = 0, bestSize = 0, next = 1;
  const stack: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || label[i]) continue;
    let size = 0; stack.push(i); label[i] = next;
    while (stack.length) {
      const p = stack.pop()!; size++;
      const x = p % sw, y = (p - x) / sw;
      const nb = [x > 0 ? p - 1 : -1, x < sw - 1 ? p + 1 : -1, y > 0 ? p - sw : -1, y < sh - 1 ? p + sw : -1];
      for (const q of nb) if (q >= 0 && mask[q] && !label[q]) { label[q] = next; stack.push(q); }
    }
    if (size > bestSize) { bestSize = size; bestLabel = next; }
    next++;
  }
  const frac = bestSize / (sw * sh);
  if (frac < 0.2) return null;
  // Corner = the region pixel farthest from the centre in each quadrant —
  // works for pages turned up to ~40°, unlike x+y extremes.
  let cx = 0, cy = 0;
  for (let i = 0; i < label.length; i++) if (label[i] === bestLabel) { cx += i % sw; cy += Math.floor(i / sw); }
  cx /= bestSize; cy /= bestSize;
  const far = [0, 1, 2, 3].map(() => ({ x: cx, y: cy, v: -1 }));
  for (let i = 0; i < label.length; i++) {
    if (label[i] !== bestLabel) continue;
    const x = i % sw, y = (i - x) / sw;
    const dx = x - cx, dy = y - cy;
    const q = dy < 0 ? (dx < 0 ? 0 : 1) : (dx >= 0 ? 2 : 3); // TL, TR, BR, BL
    const v = dx * dx + dy * dy;
    if (v > far[q].v) far[q] = { x, y, v };
  }
  const [tl, tr, br, bl] = far;
  const quad = [tl, tr, br, bl].map((p) => ({ x: (p.x + 0.5) / scale, y: (p.y + 0.5) / scale }));
  const area = Math.abs(quad.reduce((a, p, i) => { const q = quad[(i + 1) % 4]; return a + p.x * q.y - q.x * p.y; }, 0)) / 2;
  // A page that fills (almost) the whole frame gives no useful edges — keep
  // the full photo. Tiny or odd shapes are not a page either.
  if (area < 0.3 * g.w * g.h || area > 0.97 * g.w * g.h) return null;
  return quad;
}

/** Homography mapping the unit rectangle (0..W,0..H) to the quad. */
function homography(src: Pt[], dst: Pt[]): number[] {
  // Solve 8x8 for h such that dst = H * src.
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  return [...b.map((v, i) => v / A[i][i]), 1];
}

export function warpToRect(g: Gray, quad: Pt[], outW: number, outH: number): Gray {
  const H = homography([{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }], quad);
  const out = new Float32Array(outW * outH);
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    const den = H[6] * x + H[7] * y + H[8];
    out[y * outW + x] = sample(g, (H[0] * x + H[1] * y + H[2]) / den, (H[3] * x + H[4] * y + H[5]) / den);
  }
  return { w: outW, h: outH, d: out };
}

export function rotateGray(g: Gray, deg: number): Gray {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const cx = g.w / 2, cy = g.h / 2;
  const out = new Float32Array(g.w * g.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const dx = x - cx, dy = y - cy;
    const sx = c * dx + s * dy + cx, sy = -s * dx + c * dy + cy;
    out[y * g.w + x] = sx < 0 || sy < 0 || sx > g.w - 1 || sy > g.h - 1 ? 255 : sample(g, sx, sy);
  }
  return { w: g.w, h: g.h, d: out };
}

/** Angle (degrees) that makes text lines most horizontal. */
export function estimateSkew(g: Gray, maxDeg = 6, step = 0.5): number {
  const small = resizeGray(g, Math.min(500, g.w), Math.round(g.h * Math.min(500, g.w) / g.w));
  const t = otsu(small);
  const ink: Pt[] = [];
  for (let y = 0; y < small.h; y++) for (let x = 0; x < small.w; x++) if (small.d[y * small.w + x] < t - 20) ink.push({ x, y });
  if (ink.length < 200) return 0;
  let best = 0, bestScore = -1;
  for (let deg = -maxDeg; deg <= maxDeg + 1e-9; deg += step) {
    const a = (deg * Math.PI) / 180, s = Math.sin(a), c = Math.cos(a);
    const bins = new Float64Array(small.h * 2 + 10);
    for (const p of ink) {
      const r = Math.round(-s * p.x + c * p.y + small.h * 0.5);
      if (r >= 0 && r < bins.length) bins[r]++;
    }
    let score = 0;
    for (let i = 1; i < bins.length; i++) score += (bins[i] - bins[i - 1]) ** 2;
    if (score > bestScore) { bestScore = score; best = deg; }
  }
  return best;
}

/** Remove shadows/glare by dividing by the local background, stretch the
 *  contrast between the 1st and 99th percentile, then sharpen. */
export function enhance(g: Gray): Gray {
  const r = Math.max(8, Math.round(Math.max(g.w, g.h) / 40));
  const bg = boxBlur(g, r);
  const norm = new Float32Array(g.d.length);
  for (let i = 0; i < norm.length; i++) norm[i] = Math.min(255, (g.d[i] / Math.max(1, bg.d[i])) * 235);
  const sorted = Float32Array.from(norm).sort();
  const lo = sorted[Math.floor(sorted.length * 0.01)], hi = sorted[Math.floor(sorted.length * 0.99)];
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < norm.length; i++) norm[i] = Math.max(0, Math.min(255, ((norm[i] - lo) / span) * 255));
  const stretched = { w: g.w, h: g.h, d: norm };
  const blur = boxBlur(stretched, 1);
  const out = new Float32Array(norm.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, norm[i] + 0.9 * (norm[i] - blur.d[i])));
  return { w: g.w, h: g.h, d: out };
}

export function measureQuality(g: Gray, pageFound: boolean, skewDeg: number): SheetQuality {
  const n = resizeGray(g, 600, Math.max(8, Math.round((g.h * 600) / g.w)));
  let sum = 0, sum2 = 0, cnt = 0, mean = 0, glare = 0;
  for (let i = 0; i < n.d.length; i++) { mean += n.d[i]; if (n.d[i] > 250) glare++; }
  mean /= n.d.length;
  for (let y = 1; y < n.h - 1; y++) for (let x = 1; x < n.w - 1; x++) {
    const i = y * n.w + x;
    const lap = 4 * n.d[i] - n.d[i - 1] - n.d[i + 1] - n.d[i - n.w] - n.d[i + n.w];
    sum += lap; sum2 += lap * lap; cnt++;
  }
  const sharpness = sum2 / cnt - (sum / cnt) ** 2;
  const glareFrac = glare / n.d.length;
  const issues: string[] = [];
  if (sharpness < 25) issues.push("The photo is blurred");
  if (mean < 60) issues.push("The photo is very dark");
  if (glareFrac > 0.35) issues.push("Glare is washing out part of the sheet");
  if (!pageFound) issues.push("The page edges weren't clear, so the whole photo was used");
  const tooPoor = sharpness < 8 || mean < 30;
  return { sharpness: Math.round(sharpness), brightness: Math.round(mean), glare: Number(glareFrac.toFixed(3)), pageFound, skewDeg, issues, tooPoor };
}

/** Full clean-up on a greyscale image. */
export function cleanSheet(g: Gray, outLong = 1800): { page: Gray; quality: SheetQuality } {
  const corners = findPageCorners(g);
  let page: Gray;
  if (corners) {
    const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
    const wPx = (dist(corners[0], corners[1]) + dist(corners[3], corners[2])) / 2;
    const hPx = (dist(corners[0], corners[3]) + dist(corners[1], corners[2])) / 2;
    const k = outLong / Math.max(wPx, hPx);
    page = warpToRect(g, corners, Math.round(wPx * k), Math.round(hPx * k));
  } else {
    const k = Math.min(1, outLong / Math.max(g.w, g.h));
    page = k < 1 ? resizeGray(g, Math.round(g.w * k), Math.round(g.h * k)) : g;
  }
  let enhanced = enhance(page);
  const skew = estimateSkew(enhanced);
  if (Math.abs(skew) >= 0.5) enhanced = rotateGray(enhanced, -skew);
  return { page: enhanced, quality: measureQuality(g, Boolean(corners), skew) };
}

/** Overlapping horizontal strips (top → bottom) for a zoomed second read. */
export function stripBounds(h: number, count = 3, overlap = 0.12): Array<{ y: number; h: number }> {
  const base = h / count;
  const pad = Math.round(base * overlap);
  return Array.from({ length: count }, (_, i) => {
    const y = Math.max(0, Math.round(i * base) - pad);
    const y1 = Math.min(h, Math.round((i + 1) * base) + pad);
    return { y, h: y1 - y };
  });
}

// ── Browser wrapper ─────────────────────────────────────────────────────────

export type PreparedSheet = {
  enhanced: { image_base64: string; mime_type: string };
  /** Zoomed strips of the cleaned page for a retry read. */
  strips: { image_base64: string; mime_type: string }[];
  /** Object URL of the cleaned page, for crops in the review screen. */
  enhancedUrl: string;
  width: number;
  height: number;
  quality: SheetQuality;
};

function grayToCanvas(g: Gray, x = 0, y = 0, w = g.w, h = g.h, outW = w): HTMLCanvasElement {
  const outH = Math.round((h * outW) / w);
  const src = document.createElement("canvas");
  src.width = w; src.height = h;
  const ctx = src.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const v = g.d[(yy + y) * g.w + xx + x];
    const j = (yy * w + xx) * 4;
    img.data[j] = img.data[j + 1] = img.data[j + 2] = v; img.data[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  if (outW === w) return src;
  const out = document.createElement("canvas");
  out.width = outW; out.height = outH;
  const octx = out.getContext("2d")!;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(src, 0, 0, outW, outH);
  return out;
}

const toB64 = (c: HTMLCanvasElement, q = 0.9) => c.toDataURL("image/jpeg", q).split(",")[1];

export async function loadImage(src: string | Blob): Promise<HTMLImageElement | ImageBitmap> {
  if (typeof src !== "string") return await createImageBitmap(src, { imageOrientation: "from-image" } as any);
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Couldn't open the photo (${res.status})`);
  return await createImageBitmap(await res.blob(), { imageOrientation: "from-image" } as any);
}

export async function prepareSheetImage(src: string | Blob): Promise<PreparedSheet> {
  const img = await loadImage(src);
  const iw = (img as any).width, ih = (img as any).height;
  const k = Math.min(1, 2200 / Math.max(iw, ih));
  const w = Math.round(iw * k), h = Math.round(ih * k);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img as any, 0, 0, w, h);
  const g = toGray(ctx.getImageData(0, 0, w, h).data, w, h);
  const { page, quality } = cleanSheet(g);
  const full = grayToCanvas(page);
  const strips = stripBounds(page.h).map((b) => ({
    image_base64: toB64(grayToCanvas(page, 0, b.y, page.w, b.h, Math.min(2000, Math.round(page.w * 1.5)))),
    mime_type: "image/jpeg",
  }));
  const blob: Blob = await new Promise((r) => full.toBlob((b) => r(b!), "image/jpeg", 0.9));
  return {
    enhanced: { image_base64: toB64(full), mime_type: "image/jpeg" },
    strips,
    enhancedUrl: URL.createObjectURL(blob),
    width: page.w,
    height: page.h,
    quality,
  };
}
