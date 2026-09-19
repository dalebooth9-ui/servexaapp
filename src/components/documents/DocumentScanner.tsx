import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, Loader2, RefreshCw, X, Zap, ZapOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";
import { buildDurableRef } from "@/lib/durableStorageRef";
import { detectDocumentQuad, fullFrameQuad, orderQuad, type Quad } from "@/lib/documentEdgeDetection";
import { canvasToBlob, warpDocument, type ScanMode } from "@/lib/perspectiveTransform";
import { addSubmissionTag, fetchPhotoTags, type PhotoTag } from "@/lib/photoTags";
import CornerAdjuster from "@/components/documents/CornerAdjuster";

type Props = {
  jobId: string;
  userId: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

type Stage = "camera" | "review" | "saving";

const MODES: { value: ScanMode; label: string }[] = [
  { value: "color", label: "Colour" },
  { value: "grey", label: "Greyscale" },
  { value: "bw", label: "B&W" },
];

export default function DocumentScanner({ jobId, userId, open, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDetectRef = useRef(0);
  const liveQuadRef = useRef<Quad | null>(null);

  const [stage, setStage] = useState<Stage>("camera");
  const [mode, setMode] = useState<ScanMode>("color");
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [status, setStatus] = useState("Position document in frame");
  const [detected, setDetected] = useState(false);

  const [frameCanvas, setFrameCanvas] = useState<HTMLCanvasElement | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [processing, setProcessing] = useState(false);

  const [labelOpen, setLabelOpen] = useState(false);
  const [labelText, setLabelText] = useState("");
  const [tags, setTags] = useState<PhotoTag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [checklistItems, setChecklistItems] = useState<{ id: string; checklistId: string; name: string }[]>([]);
  const [linkedItem, setLinkedItem] = useState<string>("");
  const pendingBlobRef = useRef<Blob | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Camera lifecycle
  useEffect(() => {
    if (!open || stage !== "camera") return;
    let cancelled = false;
    setPermissionError(null);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() || {}) as Record<string, unknown>;
        setTorchAvailable(Boolean((caps as any).torch));
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (err) {
        if (!cancelled) {
          setPermissionError(
            err instanceof Error && /denied|NotAllowed/i.test(err.name + err.message)
              ? "Camera access was blocked. Allow camera access for this site in your browser settings, then try again."
              : "No camera is available on this device.",
          );
        }
      }
    })();

    return () => { cancelled = true; stopCamera(); };
  }, [open, stage, stopCamera]);

  // Detection loop (~10fps)
  useEffect(() => {
    if (!open || stage !== "camera" || permissionError) return;
    const loop = (ts: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (!video || !overlay || !video.videoWidth) return;
      if (ts - lastDetectRef.current < 100) return;
      lastDetectRef.current = ts;

      if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
      }
      const found = detectDocumentQuad(video, video.videoWidth, video.videoHeight);
      liveQuadRef.current = found;
      setDetected(!!found);
      setStatus(found ? "Document detected — hold steady and tap to capture" : "Position document in frame");

      const ctx = overlay.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      if (found) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, overlay.width, overlay.height);
        ctx.moveTo(found[0].x, found[0].y);
        for (let i = 3; i >= 0; i--) ctx.lineTo(found[i].x, found[i].y);
        ctx.closePath();
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fill("evenodd");
        ctx.restore();

        ctx.beginPath();
        ctx.moveTo(found[0].x, found[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(found[i].x, found[i].y);
        ctx.closePath();
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = Math.max(3, overlay.width / 300);
        ctx.shadowColor = "#22c55e";
        ctx.shadowBlur = 18;
        ctx.stroke();
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [open, stage, permissionError]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as any] } as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      toast({ title: "Flash unavailable", description: "This device does not support the camera flash here." });
    }
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const found = liveQuadRef.current || detectDocumentQuad(c, c.width, c.height);
    setFrameCanvas(c);
    setQuad(found ? orderQuad(found) : fullFrameQuad(c.width, c.height));
    stopCamera();
    setStage("review");
  };

  // Render the corrected preview whenever the crop or mode changes
  useEffect(() => {
    if (stage !== "review" || !frameCanvas || !quad) return;
    let cancelled = false;
    setProcessing(true);
    const id = setTimeout(() => {
      try {
        const out = warpDocument(frameCanvas, quad, mode);
        if (!cancelled) setPreviewUrl(out ? out.toDataURL(mode === "bw" ? "image/png" : "image/jpeg", 0.9) : "");
      } finally {
        if (!cancelled) setProcessing(false);
      }
    }, 60);
    return () => { cancelled = true; clearTimeout(id); };
  }, [stage, frameCanvas, quad, mode]);

  const startSave = async () => {
    if (!frameCanvas || !quad) return;
    const out = warpDocument(frameCanvas, quad, mode);
    const blob = out ? await canvasToBlob(out, mode) : null;
    if (!blob) {
      toast({ title: "Scan failed", description: "Could not process the scan. Please retake it.", variant: "destructive" });
      return;
    }
    pendingBlobRef.current = blob;
    setLabelText("");
    setSelectedTags([]);
    setLinkedItem("");
    setLabelOpen(true);

    void fetchPhotoTags().then(setTags).catch(() => undefined);
    void (async () => {
      const { data: lists } = await supabase
        .from("job_photo_checklists")
        .select("id,template_id")
        .eq("job_id", jobId);
      const templateIds = Array.from(new Set((lists || []).map((l: any) => l.template_id).filter(Boolean)));
      if (!templateIds.length) return;
      const { data: items } = await supabase
        .from("photo_checklist_items")
        .select("id,label,template_id")
        .in("template_id", templateIds);
      const byTemplate = new Map((lists || []).map((l: any) => [l.template_id, l.id]));
      setChecklistItems(
        (items || []).map((it: any) => ({
          id: it.id,
          checklistId: byTemplate.get(it.template_id) as string,
          name: it.label || "Checklist item",
        })).filter((i) => i.checklistId),
      );
    })();
  };

  const confirmSave = async () => {
    const blob = pendingBlobRef.current;
    if (!blob) return;
    setStage("saving");
    try {
      const ext = mode === "bw" ? "png" : "jpg";
      const fileName = `scan-${Date.now()}.${ext}`;
      const storagePath = await buildOrgPathAsync(`${jobId}/${fileName}`);
      const { error: upErr } = await supabase.storage
        .from("submissions")
        .upload(storagePath, blob, { contentType: blob.type || `image/${ext}` });
      if (upErr) throw upErr;

      const durable = buildDurableRef("submissions", storagePath);
      const { data: inserted, error: insErr } = await supabase
        .from("submissions")
        .insert({
          job_id: jobId,
          engineer_id: userId,
          type: "document_scan",
          content: labelText.trim() || "Scanned document",
          file_url: durable,
          file_name: fileName,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      const submissionId = (inserted as any)?.id as string | undefined;
      if (submissionId && selectedTags.length) {
        await Promise.all(selectedTags.map((tagId) => addSubmissionTag(submissionId, tagId)));
      }

      if (linkedItem) {
        const item = checklistItems.find((i) => i.id === linkedItem);
        if (item) {
          await supabase.from("job_photo_checklist_responses").insert({
            job_id: jobId,
            checklist_id: item.checklistId,
            item_id: item.id,
            response_type: "photo",
            photo_url: durable,
            captured_by: userId,
          } as any);
        }
      }

      toast({ title: "Scan saved", description: "The scanned document was added to this job." });
      pendingBlobRef.current = null;
      setLabelOpen(false);
      onSaved?.();
      onClose();
    } catch (err) {
      toast({
        title: "Could not save the scan",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
      setStage("review");
    }
  };

  const retake = () => {
    setPreviewUrl("");
    setFrameCanvas(null);
    setQuad(null);
    setStage("camera");
  };

  useEffect(() => {
    if (!open) {
      stopCamera();
      setStage("camera");
      setFrameCanvas(null);
      setQuad(null);
      setPreviewUrl("");
      setLabelOpen(false);
      pendingBlobRef.current = null;
    }
  }, [open, stopCamera]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-4 py-3">
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => { stopCamera(); onClose(); }} aria-label="Close scanner">
          <X className="h-5 w-5" />
        </Button>
        <p className="text-sm font-medium">Scan document</p>
        {stage === "camera" && torchAvailable ? (
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={toggleTorch} aria-label="Toggle flash">
            {torchOn ? <Zap className="h-5 w-5 text-yellow-400" /> : <ZapOff className="h-5 w-5" />}
          </Button>
        ) : (
          <span className="h-10 w-10" />
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {stage === "camera" && (
          <div className="relative flex h-full items-center justify-center">
            {permissionError ? (
              <div className="max-w-sm px-6 text-center text-sm text-white/80">{permissionError}</div>
            ) : (
              <>
                <video ref={videoRef} playsInline muted className="max-h-full w-full object-contain" />
                <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
                <div
                  className={`absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs transition-colors ${
                    detected ? "bg-green-500/90 text-white" : "bg-black/60 text-white/80"
                  }`}
                >
                  {status}
                </div>
              </>
            )}
          </div>
        )}

        {(stage === "review" || stage === "saving") && frameCanvas && quad && (
          <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-white/60">Adjust the corners</p>
              <CornerAdjuster canvas={frameCanvas} quad={quad} onChange={setQuad} />
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-white/60">Corrected preview</p>
              <div className="relative rounded-lg bg-white/5 p-2">
                {processing && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                )}
                {previewUrl ? (
                  <img src={previewUrl} alt="Corrected document" className="mx-auto max-h-[45vh] w-auto rounded" />
                ) : (
                  <div className="h-40" />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-white/10 px-4 py-4">
        <div className="flex justify-center gap-2">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                mode === m.value ? "bg-white text-black" : "bg-white/10 text-white/80"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {stage === "camera" ? (
          <div className="flex justify-center">
            <button
              type="button"
              aria-label="Capture document"
              disabled={!!permissionError}
              onClick={capture}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-lg disabled:opacity-40"
            >
              <Camera className="h-7 w-7" />
            </button>
          </div>
        ) : (
          <div className="flex justify-center gap-3">
            <Button variant="secondary" className="gap-1.5" onClick={retake} disabled={stage === "saving"}>
              <RefreshCw className="h-4 w-4" /> Retake
            </Button>
            <Button className="gap-1.5" onClick={startSave} disabled={stage === "saving" || processing}>
              {stage === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Accept
            </Button>
          </div>
        )}
      </div>

      <Dialog open={labelOpen} onOpenChange={(o) => { if (!o && stage !== "saving") setLabelOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save scanned document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="scan-label">Label</Label>
              <Input
                id="scan-label"
                value={labelText}
                onChange={(e) => setLabelText(e.target.value)}
                placeholder="e.g. Extinguisher compliance plate"
              />
            </div>

            {checklistItems.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="scan-checklist">Link to a checklist item (optional)</Label>
                <select
                  id="scan-checklist"
                  value={linkedItem}
                  onChange={(e) => setLinkedItem(e.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Not linked</option>
                  {checklistItems.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </div>
            )}

            {tags.length > 0 && (
              <div className="space-y-1.5">
                <Label>Tags (optional)</Label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((t) => {
                    const on = selectedTags.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTags((prev) => (on ? prev.filter((x) => x !== t.id) : [...prev, t.id]))}
                        className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "border-transparent text-white" : "text-foreground"}`}
                        style={on ? { backgroundColor: t.color } : undefined}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLabelOpen(false)} disabled={stage === "saving"}>Cancel</Button>
            <Button onClick={confirmSave} disabled={stage === "saving"}>
              {stage === "saving" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save scan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>,
    document.body,
  );
}
