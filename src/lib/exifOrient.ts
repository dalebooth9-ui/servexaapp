/**
 * EXIF-aware image loader used when baking photos into PDFs.
 *
 * The browser <img> rendering path can honour EXIF orientation via the
 * `image-orientation: from-image` CSS property, but jsPDF's `addImage`
 * works on raw pixels and does NOT apply EXIF rotation. Without this
 * helper, portrait photos taken on phones often render sideways in the
 * exported PDF even though they look correct in the UI.
 *
 * `createImageBitmap(..., { imageOrientation: "from-image" })` is the
 * cheapest, most reliable way to get an orientation-corrected bitmap in
 * modern browsers. We then draw it to a canvas and return a JPEG data
 * URL plus the corrected dimensions.
 */

export type OrientedImage = {
  dataUrl: string;
  width: number;
  height: number;
  mimeType: "image/jpeg" | "image/png";
};

const DEFAULT_QUALITY = 0.9;

export async function fetchOrientedImage(url: string): Promise<OrientedImage | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await orientBlob(blob);
  } catch (err) {
    console.warn("fetchOrientedImage failed", err);
    return null;
  }
}

export async function orientBlob(blob: Blob): Promise<OrientedImage | null> {
  const mimeType: "image/jpeg" | "image/png" = (blob.type || "").includes("png")
    ? "image/png"
    : "image/jpeg";

  // Preferred path: createImageBitmap with imageOrientation honours EXIF.
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image",
      } as ImageBitmapOptions);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return await fallbackToImg(blob, mimeType);
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      const dataUrl = canvas.toDataURL(mimeType, DEFAULT_QUALITY);
      return { dataUrl, width: canvas.width, height: canvas.height, mimeType };
    }
  } catch (err) {
    // Some browsers throw on the `imageOrientation` option — fall through.
    console.warn("createImageBitmap orientation failed, falling back", err);
  }

  return await fallbackToImg(blob, mimeType);
}

async function fallbackToImg(
  blob: Blob,
  mimeType: "image/jpeg" | "image/png",
): Promise<OrientedImage | null> {
  // Fallback: read as data URL with no orientation correction.
  return await new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => {
      const dataUrl = fr.result as string;
      const img = new Image();
      img.onload = () => resolve({
        dataUrl,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        mimeType,
      });
      img.onerror = () => resolve({ dataUrl, width: 0, height: 0, mimeType });
      img.src = dataUrl;
    };
    fr.onerror = () => resolve(null);
    fr.readAsDataURL(blob);
  });
}
