/**
 * useOfflinePhotoUpload — Upload a photo Blob to Supabase Storage, falling
 * back to the IndexedDB photo queue when the device is offline.
 */
import { useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { enqueuePhoto } from "@/lib/photoQueue";
import { isNetworkError } from "@/lib/syncQueue";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";

export type PhotoUploadResult =
  | { ok: true; queued: false; path: string }
  | { ok: true; queued: true; queueId: string; localUrl: string }
  | { ok: false; queued: false; error: unknown };

export function useOfflinePhotoUpload() {
  const upload = useCallback(async (input: {
    bucket: string;
    path: string;
    blob: Blob;
    contentType?: string;
    label?: string;
  }): Promise<PhotoUploadResult> => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const item = await enqueuePhoto(input);
      toast.info("Photo saved locally — will upload when back online");
      return { ok: true, queued: true, queueId: item.id, localUrl: URL.createObjectURL(input.blob) };
    }
    try {
      const res = await supabase.storage.from(input.bucket).upload(input.path, input.blob, {
        contentType: input.contentType || input.blob.type || "image/jpeg",
        upsert: true,
      });
      if (res.error) {
        if (isNetworkError(res.error)) {
          const item = await enqueuePhoto(input);
          toast.info("Photo saved locally — will upload when back online");
          return { ok: true, queued: true, queueId: item.id, localUrl: URL.createObjectURL(input.blob) };
        }
        return { ok: false, queued: false, error: res.error };
      }
      return { ok: true, queued: false, path: input.path };
    } catch (e) {
      if (isNetworkError(e)) {
        const item = await enqueuePhoto(input);
        toast.info("Photo saved locally — will upload when back online");
        return { ok: true, queued: true, queueId: item.id, localUrl: URL.createObjectURL(input.blob) };
      }
      return { ok: false, queued: false, error: e };
    }
  }, []);

  return { upload };
}
