import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { isImageFile, isVideoFile, isAllowedFile, extractStoragePath } from "@/lib/fileUtils";

interface UseFileUploadOptions {
  bucket?: string;
  onComplete?: () => void;
}

export function useFileUpload({ bucket = "submissions", onComplete }: UseFileUploadOptions = {}) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const uploadFilesAsSubmissions = async (
    files: File[],
    jobId: string,
    userId: string
  ): Promise<number> => {
    setUploading(true);
    let uploadedCount = 0;

    for (const file of files) {
      if (!isAllowedFile(file)) {
        toast({
          title: "Unsupported file",
          description: `${file.name} is not a supported format or exceeds the size limit.`,
          variant: "destructive",
        });
        continue;
      }

      const filePath = `${jobId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file);

      if (uploadError) {
        toast({
          title: "Upload failed",
          description: `Failed to upload ${file.name}.`,
          variant: "destructive",
        });
        continue;
      }

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
      const { error: insertError } = await supabase.from("submissions").insert({
        job_id: jobId,
        engineer_id: userId,
        type: isImageFile(file.name) ? "photo" : "document",
        file_url: urlData.publicUrl,
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
    const path = extractStoragePath(fileUrl);
    if (path) {
      await supabase.storage.from(bucket).remove([path]);
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
