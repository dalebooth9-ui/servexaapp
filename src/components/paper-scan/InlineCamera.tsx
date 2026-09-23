import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, X, RotateCcw, Check, SwitchCamera } from "lucide-react";

interface Props {
  onCapture: (files: File[]) => void;
  onCancel: () => void;
  maxPages?: number;
}

/**
 * In-browser camera (getUserMedia). Keeps the viewfinder inside the page so
 * the phone never backgrounds/evicts the tab the way the native camera app
 * (input capture="environment") does.
 */
export default function InlineCamera({ onCapture, onCancel, maxPages = 8 }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captured, setCaptured] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startCamera = useCallback(async (facing: "environment" | "user") => {
    try {
      stopStream();
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't open the camera inside the app. Try Chrome or Safari.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 2048 }, height: { ideal: 1536 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setError(null);
    } catch (err: any) {
      console.error("[InlineCamera] getUserMedia failed", err);
      if (err?.name === "NotAllowedError") {
        setError("Camera permission denied. Please allow camera access in your browser settings and try again.");
      } else if (err?.name === "NotFoundError") {
        setError("No camera found on this device.");
      } else {
        setError("Could not start camera. Try closing other apps using the camera.");
      }
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return stopStream;
  }, [facingMode, startCamera]);

  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCaptured((prev) => {
          if (prev.length >= maxPages) return prev;
          const file = new File([blob], `scan-page-${prev.length + 1}.jpg`, { type: "image/jpeg" });
          setPreviews((p) => [...p, URL.createObjectURL(blob)]);
          return [...prev, file];
        });
      },
      "image/jpeg",
      0.85,
    );
  };

  const removeLastPhoto = () => {
    setCaptured((prev) => prev.slice(0, -1));
    setPreviews((prev) => {
      const last = prev[prev.length - 1];
      if (last) URL.revokeObjectURL(last);
      return prev.slice(0, -1);
    });
  };

  const handleDone = () => {
    stopStream();
    onCapture(captured);
  };

  if (error) {
    return (
      <div className="fixed inset-0 z-[60] bg-foreground text-background flex flex-col items-center justify-center p-6">
        <p className="text-center mb-6">{error}</p>
        <Button variant="secondary" onClick={onCancel}>Go back</Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-foreground flex flex-col" data-testid="inline-camera">
      <div className="flex-1 relative overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        {captured.length > 0 && (
          <div className="absolute top-4 left-4 bg-background/90 text-foreground rounded-full px-3 py-1 text-sm font-medium">
            {captured.length} page{captured.length !== 1 ? "s" : ""} captured
          </div>
        )}
        {previews.length > 0 && (
          <div className="absolute bottom-2 left-2 right-20 flex gap-1 overflow-x-auto">
            {previews.map((src, i) => (
              <img key={src} src={src} alt={`Page ${i + 1}`} className="h-12 w-9 rounded border border-background/50 object-cover shrink-0" />
            ))}
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <div className="bg-foreground p-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex items-center justify-between">
        {captured.length === 0 ? (
          <Button variant="ghost" size="icon" onClick={onCancel} className="text-background h-12 w-12" aria-label="Cancel">
            <X className="h-6 w-6" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" onClick={removeLastPhoto} className="text-background h-12 w-12" aria-label="Remove last photo">
            <RotateCcw className="h-5 w-5" />
          </Button>
        )}
        <button
          type="button"
          onClick={takePhoto}
          disabled={captured.length >= maxPages}
          className="h-16 w-16 rounded-full border-4 border-background bg-background/20 active:bg-background/50 disabled:opacity-30 flex items-center justify-center"
          aria-label="Take photo"
        >
          <Camera className="h-7 w-7 text-background" />
        </button>
        {captured.length > 0 ? (
          <Button variant="ghost" size="icon" onClick={handleDone} className="text-primary h-12 w-12" aria-label="Done">
            <Check className="h-7 w-7" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" onClick={() => setFacingMode((p) => (p === "environment" ? "user" : "environment"))} className="text-background h-12 w-12" aria-label="Flip camera">
            <SwitchCamera className="h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  );
}
