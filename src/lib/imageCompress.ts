/**
 * Client-side image downscale + JPEG re-encode for form photo uploads.
 * Mirrors the pattern used in jobPhotos.compressForPdf but returns a Blob
 * suitable for direct storage upload. Bails out (returns null) if the image
 * is already small enough or if decoding fails — callers should fall back
 * to the original File.
 */
export async function compressImageForUpload(
  file: File | Blob,
  maxEdgePx = 2000,
  quality = 0.85,
): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const longest = Math.max(width, height);
    // If the image is already small AND already a jpeg, don't waste CPU.
    if (longest <= maxEdgePx && (file as File).type === "image/jpeg") {
      bitmap.close?.();
      return null;
    }
    const scale = longest > maxEdgePx ? maxEdgePx / longest : 1;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close?.(); return null; }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
    });
  } catch {
    return null;
  }
}
