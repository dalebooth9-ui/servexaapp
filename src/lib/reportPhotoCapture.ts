/** Report photo helpers: fast phone uploads, optional "Save to phone" via the share sheet. */
import { compressImageForUpload } from "@/lib/imageCompress";

/** Long-edge size for uploaded report photos — quick on weak signal. */
export const REPORT_PHOTO_MAX_EDGE = 1600;

export const PHOTO_TIP = "Tip: take photos with your phone's Camera app and use Choose from library to keep a copy on your phone.";

/** Shrink a photo to ~1600px JPEG; returns the original if it can't be shrunk. */
export async function prepareReportPhoto(file: File): Promise<File> {
  const blob = await compressImageForUpload(file, REPORT_PHOTO_MAX_EDGE, 0.82);
  if (!blob) return file;
  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}

/** True only when this device can hand an image file to the share sheet. */
export function canSaveToPhone(file: File | null | undefined): boolean {
  if (!file || typeof navigator === "undefined") return false;
  const nav = navigator as any;
  if (typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
  try { return !!nav.canShare({ files: [file] }); } catch { return false; }
}

/** Open the share sheet so the engineer can tap "Save Image". Cancelling is fine. */
export async function saveToPhone(file: File): Promise<void> {
  try { await (navigator as any).share({ files: [file] }); } catch { /* cancelled */ }
}

/** Count stored photos on a report: site photos plus answered photo questions. */
export function countSavedReportPhotos(formData: Record<string, any>, photoFieldIds: string[]): number {
  const site = Array.isArray(formData._site_photo_paths) ? formData._site_photo_paths.filter(Boolean).length : 0;
  const fields = photoFieldIds.filter((id) => typeof formData[id] === "string" && formData[id]).length;
  return site + fields;
}
