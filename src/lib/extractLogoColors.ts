/**
 * extractLogoColors.ts
 *
 * Extracts the dominant (most-saturated, non-white/grey) colour from a loaded
 * HTMLImageElement by sampling it via an off-screen canvas.
 *
 * Returns an RGB triple [r,g,b] suitable for use in jsPDF colour calls.
 * Falls back to the default brand navy [33, 61, 99] if extraction fails or
 * the logo is monochrome.
 */

export type RgbTriple = [number, number, number];

const DEFAULT_NAVY: RgbTriple = [33, 61, 99];

/** Convert RGB to HSL (all channels 0-1). */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    case b: h = ((r - g) / d + 4) / 6; break;
  }
  return [h, s, l];
}

/**
 * Sample the most vibrant (highest saturation) pixel cluster in the image.
 * Returns a darkened version suitable for headers/titles.
 */
export function extractDominantColor(img: HTMLImageElement): RgbTriple {
  try {
    const size = 80; // downsample for speed
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return DEFAULT_NAVY;

    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    let bestScore = -1;
    let bestR = 33, bestG = 61, bestB = 99;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 128) continue; // skip transparent pixels

      const [, s, l] = rgbToHsl(r, g, b);

      // Skip near-white (l > 0.92) and near-grey (s < 0.15)
      if (l > 0.92 || s < 0.15) continue;

      // Score: prefer high saturation, moderate lightness
      const score = s * 2 + (1 - Math.abs(l - 0.45));
      if (score > bestScore) {
        bestScore = score;
        bestR = r; bestG = g; bestB = b;
      }
    }

    // If no colourful pixel found, fall back
    if (bestScore < 0) return DEFAULT_NAVY;

    // Darken slightly for use as a heading colour (ensure good contrast on white)
    const [h, s, l] = rgbToHsl(bestR, bestG, bestB);
    const targetL = Math.min(l, 0.38); // cap lightness so text is readable
    const darkened = hslToRgb(h, Math.max(s, 0.5), targetL);
    return darkened;
  } catch {
    return DEFAULT_NAVY;
  }
}

function hslToRgb(h: number, s: number, l: number): RgbTriple {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Given an already-loaded logo HTMLImageElement, returns an accent colour
 * triple or DEFAULT_NAVY if the logo is absent or monochrome.
 */
export function getBrandColorFromLogo(
  logoImg: HTMLImageElement | null,
  hasCustomLogo: boolean
): RgbTriple {
  if (!hasCustomLogo || !logoImg) return DEFAULT_NAVY;
  return extractDominantColor(logoImg);
}

/** Format an RgbTriple as `#rrggbb`. */
export function rgbToHex([r, g, b]: RgbTriple): string {
  const to2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/**
 * Load an image URL and extract its dominant brand colour as `#rrggbb`.
 * Returns null when the image can't be loaded or no colourful pixel is
 * confidently found (near-white / near-black / near-grey are ignored so
 * we pick the true brand colour rather than the backdrop).
 */
export async function extractBrandColorHexFromUrl(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("logo load failed"));
      img.src = url;
    });
    const rgb = extractDominantColor(img);
    // extractDominantColor returns DEFAULT_NAVY when nothing colourful was
    // found; treat that as "no confident pick" so callers can leave
    // brand_colour null and fall back to neutral grey.
    if (rgb[0] === DEFAULT_NAVY[0] && rgb[1] === DEFAULT_NAVY[1] && rgb[2] === DEFAULT_NAVY[2]) {
      return null;
    }
    return rgbToHex(rgb);
  } catch {
    return null;
  }
}
