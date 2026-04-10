import { useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface PhotoLightboxProps {
  photos: { id: string; url: string; fileName?: string; date?: string; engineer?: string }[];
  currentIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
}

export default function PhotoLightbox({ photos, currentIndex, open, onOpenChange, onIndexChange }: PhotoLightboxProps) {
  const photo = photos[currentIndex];

  const goNext = useCallback(() => {
    if (currentIndex < photos.length - 1) onIndexChange(currentIndex + 1);
  }, [currentIndex, photos.length, onIndexChange]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) onIndexChange(currentIndex - 1);
  }, [currentIndex, onIndexChange]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, goNext, goPrev, onOpenChange]);

  if (!photo) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()} className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none flex flex-col items-center justify-center gap-0">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 z-50 rounded-full bg-black/50 p-2 text-white hover:bg-black/80"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="relative flex w-full flex-1 items-center justify-center min-h-0 p-4">
          {currentIndex > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 z-40 rounded-full bg-black/50 text-white hover:bg-black/80"
              onClick={goPrev}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          )}

          <img
            src={photo.url}
            alt={photo.fileName || "Photo"}
            className="max-h-[80vh] max-w-full rounded object-contain"
          />

          {currentIndex < photos.length - 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 z-40 rounded-full bg-black/50 text-white hover:bg-black/80"
              onClick={goNext}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          )}
        </div>

        <div className="w-full bg-black/70 px-6 py-3 text-center text-white">
          <p className="text-sm font-medium">{photo.fileName || "Untitled"}</p>
          <p className="text-xs text-white/60">
            {photo.date && new Date(photo.date).toLocaleString()}
            {photo.engineer && ` • ${photo.engineer}`}
            {` • ${currentIndex + 1} of ${photos.length}`}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
