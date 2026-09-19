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
import { maybeShowMobileDataAdvisory } from "@/lib/mobileDataNotice";
import { getGpsPosition, stampPhoto } from "@/lib/photoStamp";


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
    jobRef?: string;
  }): Promise<PhotoUploadResult> => {
    let preparedInput = input;
    if ((input.contentType || input.blob.type).startsWith("image/")) {
      try {
        const stamped = await stampPhoto(input.blob, input.jobRef, await getGpsPosition());
        preparedInput = {
          ...input,
          path: input.path.replace(/\.[^./]+$/, ".jpg"),
          blob: stamped,
          contentType: "image/jpeg",
        };
      } catch (error) {
        return { ok: false, queued: false, error };
      }
    }
    // Prefix the path with the current org id so per-object RLS can enforce
    // isolation. buildOrgPathAsync is idempotent — callers that already
    // prefixed will not get double-prefixed.
    const scopedPath = await buildOrgPathAsync(preparedInput.path);
    const scopedInput = { ...preparedInput, path: scopedPath };
    // Gentle one-off notice when uploading over cellular so field users
    // aren't caught out by data-plan usage.
    maybeShowMobileDataAdvisory("photo uploads");
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const item = await enqueuePhoto(scopedInput);
      toast.info("Photo saved locally — will upload when back online");
      return { ok: true, queued: true, queueId: item.id, localUrl: URL.createObjectURL(scopedInput.blob) };
    }

    try {
      const res = await supabase.storage.from(scopedInput.bucket).upload(scopedInput.path, scopedInput.blob, {
        contentType: scopedInput.contentType || scopedInput.blob.type || "image/jpeg",
        upsert: true,
      });
      if (res.error) {
        if (isNetworkError(res.error)) {
          const item = await enqueuePhoto(scopedInput);
          toast.info("Photo saved locally — will upload when back online");
          return { ok: true, queued: true, queueId: item.id, localUrl: URL.createObjectURL(scopedInput.blob) };
        }
        return { ok: false, queued: false, error: res.error };
      }
      return { ok: true, queued: false, path: scopedInput.path };
    } catch (e) {
      if (isNetworkError(e)) {
        const item = await enqueuePhoto(scopedInput);
        toast.info("Photo saved locally — will upload when back online");
        return { ok: true, queued: true, queueId: item.id, localUrl: URL.createObjectURL(scopedInput.blob) };
      }
      return { ok: false, queued: false, error: e };
    }
  }, []);

  return { upload };
}
