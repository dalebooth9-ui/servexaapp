/** Layout reserved exclusively for online report PDFs, not blank paperwork. */
export const LIVE_REPORT_LAYOUT = {
  coverLogoMaxWidth: 100,
  coverLogoMaxHeight: 35,
  continuationScale: 2 / 3,
  logoTop: 5,
  logoGap: 3,
  accreditationHeight: 12,
  accreditationBottomGap: 3,
  declarationClearance: 4,
} as const;

/** Measure visible ink rather than transparent/white padding in saved logos. */
export async function liveReportLogo(source: HTMLImageElement | null): Promise<HTMLImageElement | null> {
  if (!source) return null;
  const canvas = document.createElement('canvas');
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;
  try {
    ctx.drawImage(source, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      if (data[i + 3] > 20 && Math.min(data[i], data[i + 1], data[i + 2]) < 235) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    if (right < left || bottom < top) return source;
    const cropped = document.createElement('canvas');
    cropped.width = right - left + 1; cropped.height = bottom - top + 1;
    const croppedCtx = cropped.getContext('2d');
    if (!croppedCtx) return source;
    croppedCtx.drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
    const img = new Image();
    img.src = cropped.toDataURL('image/png');
    await img.decode();
    return img;
  } catch { return source; }
}