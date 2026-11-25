/** Crops transparent/white padding from a logo so it prints at its real ink size. */
export async function trimLogoToInk(src: string): Promise<string> {
  if (!src) return src;
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d"); if (!ctx) return src;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      if (data[p + 3] > 20 && !(data[p] > 245 && data[p + 1] > 245 && data[p + 2] > 245)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return src;
    const o = document.createElement("canvas"); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
    o.getContext("2d")!.drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
    return o.toDataURL("image/png");
  } catch { return src; }
}
