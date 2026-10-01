import { useCallback, useEffect, useState } from "react";
import { Loader2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchJobPhotoMeta, createSubmissionPhotoSignedUrl, type JobPhoto } from "@/lib/jobPhotos";

type PickerPhoto = JobPhoto & { signedUrl: string | null };

type Props = {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (photo: JobPhoto) => void | Promise<void>;
};

const NON_IMAGE_NAME_RE = /\.(?:mp4|mov|webm|avi|mkv|m4v|mp3|m4a|wav|ogg|oga|aac|weba|pdf|docx?)(?:\?|$)/i;

export default function JobPhotoPickerDialog({ jobId, open, onOpenChange, onSelect }: Props) {
  const [photos, setPhotos] = useState<PickerPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const meta = (await fetchJobPhotoMeta(jobId))
        .filter((photo) => !NON_IMAGE_NAME_RE.test(photo.fileName || photo.storagePath))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const resolved = await Promise.all(
        meta.map(async (photo) => ({
          ...photo,
          signedUrl: (await createSubmissionPhotoSignedUrl(
            photo.bucket ? `storage://${photo.bucket}/${photo.storagePath}` : photo.storagePath,
            jobId,
            3600,
          ))?.signedUrl || photo.fallbackUrl || null,
        })),
      );
      setPhotos(resolved);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const choose = async (photo: PickerPhoto) => {
    setSelectingId(photo.id);
    try {
      await onSelect(photo);
      onOpenChange(false);
    } finally {
      setSelectingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !selectingId && onOpenChange(next)}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Choose from job photos</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading photos…
          </div>
        ) : photos.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <ImageIcon className="h-8 w-8" />
            <p>No job photos are available yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((photo) => (
              <Button
                key={photo.id}
                type="button"
                variant="ghost"
                disabled={!!selectingId || !photo.signedUrl}
                onClick={() => void choose(photo)}
                className="relative aspect-square h-auto min-h-28 overflow-hidden rounded-md border bg-muted p-0 text-left"
                aria-label={`Use ${photo.caption || photo.fileName}`}
              >
                {photo.signedUrl ? (
                  <img src={photo.signedUrl} alt={photo.caption || photo.fileName} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center text-xs text-muted-foreground">Unavailable</span>
                )}
                <span className="absolute inset-x-0 bottom-0 bg-foreground/80 px-2 py-1.5 text-xs text-background line-clamp-2">
                  {selectingId === photo.id ? "Using photo…" : photo.caption || photo.fileName}
                </span>
              </Button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}