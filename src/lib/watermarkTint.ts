import type { RgbTriple } from '@/lib/extractLogoColors';

/** Printed watermark opacity (12%). */
export const PRINT_WATERMARK_OPACITY = 0.12;
/** Used when a company has no saved brand colour. */
export const NEUTRAL_WATERMARK_GREY: RgbTriple = [128, 128, 128];

/**
 * Watermark ink colour for a brand colour: same hue, saturation raised to at
 * least 70% and lightness fixed at 50%, so dark/navy brand colours read as a
 * clear colour (not grey) once drawn at ~12% opacity. No colour → neutral grey.
 */
export function watermarkTint(colour: RgbTriple | null | undefined): RgbTriple {
  if (!colour) return NEUTRAL_WATERMARK_GREY;
  const [r, g, b] = colour.map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 0.04) return NEUTRAL_WATERMARK_GREY; // brand colour is itself grey/black/white
  const l = (max + min) / 2; const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : max === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6;
  const S = Math.max(s, 0.7), L = 0.5;
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S, p = 2 * L - q;
  const f = (t: number) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1/6 ? p + (q - p) * 6 * t : t < 1/2 ? q : t < 2/3 ? p + (q - p) * (2/3 - t) * 6 : p; };
  return [Math.round(f(h + 1/3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1/3) * 255)];
}
