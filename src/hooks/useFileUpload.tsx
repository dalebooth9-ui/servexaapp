import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { isImageFile, isVideoFile, isAllowedFile, extractStoragePath } from "@/lib/fileUtils";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";
import { buildDurableRef, parseStorageRef } from "@/lib/durableStorageRef";
import { getGpsPosition, jpegFileName, stampPhoto } from "@/lib/photoStamp";

interface UseFileUploadOptions {
  bucket?: string;
  onComplete?: () => void;
  jobRef?: string;
}

export function useFileUpload({ bucket = "submissions", onComplete, jobRef }: UseFileUploadOptions = {}) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const uploadFilesAsSubmissions = async (
    files: File[],
    jobId: string,
    userId: string
  ): Promise<number> => {
    setUploading(true);
    let uploadedCount = 0;
    let resolvedJobRef = jobRef?.trim() || "";
    let gpsPromise: Promise<{ lat: number; lng: number } | null> | null = null;
    let jobRefPromise: Promise<string> | null = null;

    for (const originalFile of files) {
      if (!isAllowedFile(originalFile)) {
        toast({
          title: "Unsupported file",
          description: `${originalFile.name} is not a supported format or exceeds the size limit.`,
          variant: "destructive",
        });
        continue;
      }

      let file = originalFile;
      if (originalFile.type.startsWith("image/")) {
        gpsPromise ||= getGpsPosition();
        if (!resolvedJobRef) {
          jobRefPromise ||= supabase
            .from("jobs")
            .select("reference_number")
            .eq("id", jobId)
            .maybeSingle()
            .then(({ data }) => String((data as any)?.reference_number || ""));
        }
        try {
          const [gps, fetchedJobRef] = await Promise.all([
            gpsPromise,
            resolvedJobRef ? Promise.resolve(resolvedJobRef) : jobRefPromise,
          ]);
          resolvedJobRef = fetchedJobRef || resolvedJobRef;
          const stamped = await stampPhoto(originalFile, resolvedJobRef || undefined, gps);
          file = new File([stamped], jpegFileName(originalFile.name), { type: "image/jpeg" });
        } catch (error) {
          toast({
            title: "Photo processing failed",
            description: error instanceof Error ? error.message : `Failed to prepare ${originalFile.name}.`,
            variant: "destructive",
          });
          continue;
        }
      }

      const filePath = `${jobId}/${Date.now()}-${file.name}`;
      const storagePath = await buildOrgPathAsync(filePath);
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, file);

      if (uploadError) {
        toast({
          title: "Upload failed",
          description: `Failed to upload ${file.name}.`,
          variant: "destructive",
        });
        continue;
      }

      const { error: insertError } = await supabase.from("submissions").insert({
        job_id: jobId,
        engineer_id: userId,
        type: isVideoFile(file.name) ? "video" : isImageFile(file.name) ? "photo" : "document",
        file_url: buildDurableRef(bucket, storagePath),
        file_name: file.name,
      });

      if (insertError) {
        toast({
          title: "Error",
          description: `Failed to save record for ${file.name}.`,
          variant: "destructive",
        });
      } else {
        uploadedCount++;
      }
    }

    if (uploadedCount > 0) {
      toast({
        title: "Upload complete",
        description: `${uploadedCount} file(s) uploaded.`,
      });
      onComplete?.();
    }
    setUploading(false);
    return uploadedCount;
  };

  const uploadToCustomerDocs = async (
    file: File,
    customerId: string,
    userId: string
  ): Promise<boolean> => {
    const filePath = `customer-docs/${customerId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file);

    if (uploadError) {
      toast({
        title: "Upload failed",
        description: `Failed to upload ${file.name}.`,
        variant: "destructive",
      });
      return false;
    }

    await supabase.from("customer_documents").insert({
      customer_id: customerId,
      file_name: file.name,
      file_url: filePath,
      file_size: file.size,
      uploaded_by: userId,
    } as any);

    return true;
  };

  const deleteSubmissionFile = async (fileUrl: string): Promise<void> => {
    const ref = parseStorageRef(fileUrl, bucket);
    const path = ref?.path || extractStoragePath(fileUrl);
    if (path) {
      await supabase.storage.from(ref?.bucket || bucket).remove([path]);
    }
  };

  return {
    uploading,
    setUploading,
    uploadFilesAsSubmissions,
    uploadToCustomerDocs,
    deleteSubmissionFile,
  };
}
