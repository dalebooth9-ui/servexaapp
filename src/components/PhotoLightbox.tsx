import { useEffect, useCallback, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, Download, FileText, Mic, Wrench } from "lucide-react";
import { isVideoFile } from "@/lib/fileUtils";
import { isAudioFile } from "@/lib/mediaKinds";
import TranscriptDialog from "@/components/TranscriptDialog";

export type LightboxPhoto = {
  id: string;
  url: string;
  fileName?: string;
  title?: string;
  date?: string;
  engineer?: string;
  source?: string;
  downloadUrl?: string;
  downloadName?: string;
  /** Full storage path — required for transcription. */
  storagePath?: string;
  /** Submission row id, when the photo comes from `submissions`. */
  submissionId?: string;
};

interface PhotoLightboxProps {
  photos: LightboxPhoto[];
  currentIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
  /** Transcription context — when provided, videos/voice notes offer "Transcribe". */
  jobId?: string;
  surveyId?: string;
  bucket?: string;
  orgId?: string;
  onRemedialsAdded?: () => void;
  /** Job photos only — enables the "Create remedial from photo" action. */
  onCreateRemedial?: (photo: LightboxPhoto) => void;
}

export default function PhotoLightbox({
  photos,
  currentIndex,
  open,
  onOpenChange,
  onIndexChange,
  jobId,
  surveyId,
  bucket,
  orgId,
  onRemedialsAdded,
  onCreateRemedial,
}: PhotoLightboxProps) {

  const photo = photos[currentIndex];
  const currentIsVideo = isVideoFile(photo?.fileName || "");
  const currentIsAudio = isAudioFile(photo?.fileName || "");
  const [zoom, setZoom] = useState(1);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const canTranscribe = (currentIsVideo || currentIsAudio) && !!photo?.storagePath;

  const goNext = useCallback(() => {
    if (currentIndex < photos.length - 1) { onIndexChange(currentIndex + 1); setZoom(1); }
  }, [currentIndex, photos.length, onIndexChange]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) { onIndexChange(currentIndex - 1); setZoom(1); }
  }, [currentIndex, onIndexChange]);

  useEffect(() => { setZoom(1); }, [currentIndex, open]);

  useEffect(() => {
    if (!open || transcriptOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, transcriptOpen, goNext, goPrev, onOpenChange]);

  const download = async () => {
    if (!photo?.downloadUrl && !photo?.url) return;
    try {
      const res = await fetch(photo.downloadUrl || photo.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = photo.downloadName || photo.fileName || `photo-${photo.id}.jpg`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(photo.downloadUrl || photo.url, "_blank");
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && zoom === 1) touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 60) {
      if (dx < 0) goNext(); else goPrev();
    }
    touchStartX.current = null;
  };

  if (!photo) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()} className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none flex flex-col items-center justify-center gap-0">
          <div className="absolute right-4 top-4 z-50 flex gap-2">
            {canTranscribe && (
              <button
                onClick={() => setTranscriptOpen(true)}
                className="rounded-full bg-black/50 p-2 text-white hover:bg-black/80"
                aria-label="Transcribe recording"
                title="Transcribe recording"
              >
                <FileText className="h-5 w-5" />
              </button>
            )}
            {(photo.downloadUrl || photo.url) && (
              <button
                onClick={download}
                className="rounded-full bg-black/50 p-2 text-white hover:bg-black/80"
                aria-label={currentIsVideo ? "Download video" : currentIsAudio ? "Download recording" : "Download photo"}
              >
                <Download className="h-5 w-5" />
              </button>
            )}
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-full bg-black/50 p-2 text-white hover:bg-black/80"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div
            className="relative flex w-full flex-1 items-center justify-center min-h-0 p-4 overflow-hidden"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            style={{ touchAction: "pan-y pinch-zoom" }}
          >
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

            {currentIsVideo ? (
              <video
                src={photo.url}
                controls
                autoPlay
                playsInline
                className="max-h-[80vh] max-w-full rounded object-contain"
              />
            ) : currentIsAudio ? (
              <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg bg-white/5 p-6">
                <Mic className="h-12 w-12 text-white/80" aria-hidden="true" />
                <audio src={photo.url} controls autoPlay className="w-full" />
              </div>
            ) : (
              <img
                src={photo.url}
                alt={photo.fileName || "Photo"}
                data-uploaded="true"
                onDoubleClick={() => setZoom((z) => (z === 1 ? 2.5 : 1))}
                className="max-h-[80vh] max-w-full rounded object-contain cursor-zoom-in transition-transform duration-150 select-none"
                style={{ transform: `scale(${zoom})`, transformOrigin: "center center", touchAction: "pinch-zoom" }}
                draggable={false}
              />
            )}

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
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {photo.source && (
                <span className="text-[10px] uppercase tracking-wide rounded bg-white/10 px-2 py-0.5">
                  {photo.source}
                </span>
              )}
              <p className="text-sm font-medium truncate max-w-[70vw]">{photo.title || photo.fileName || "Untitled"}</p>
            </div>
            <p className="text-xs text-white/60">
              {photo.date && new Date(photo.date).toLocaleString("en-GB")}
              {photo.engineer && ` • ${photo.engineer}`}
              {` • ${currentIndex + 1} of ${photos.length}`}
              {!currentIsVideo && !currentIsAudio && <span className="hidden sm:inline"> • double-click to zoom</span>}
              {!currentIsVideo && !currentIsAudio && <span className="sm:hidden"> • pinch to zoom</span>}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {canTranscribe && (
        <TranscriptDialog
          open={transcriptOpen}
          onOpenChange={setTranscriptOpen}
          filePath={photo.storagePath || ""}
          jobId={jobId}
          surveyId={surveyId}
          bucket={bucket}
          orgId={orgId}
          onRemedialsAdded={onRemedialsAdded}
        />
      )}
    </>
  );
}
