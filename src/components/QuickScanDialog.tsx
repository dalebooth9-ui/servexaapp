import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Loader2, ScanLine, Trash2, Upload, Plus, Copy, Check, Video, VideoOff, Aperture } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function QuickScanDialog() {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<Record<string, any> | null>(null);
  const [header, setHeader] = useState<Record<string, string> | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragCounter = useRef(0);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const accepted = Array.from(files)
      .filter((f) => f.type.startsWith("image/") || f.type === "application/pdf")
      .slice(0, 5);
    const newImages = accepted.map((file) => ({
      file,
      preview: file.type === "application/pdf" ? "" : URL.createObjectURL(file),
    }));
    setImages((prev) => [...prev, ...newImages].slice(0, 5));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, []);

  const removeImage = (idx: number) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setCameraError(null);
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      setCameraActive(true);
      // Attach stream after state update triggers re-render
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
        }
      }, 50);
    } catch (err: any) {
      const msg = err.name === "NotAllowedError"
        ? "Camera permission denied. Please allow camera access in your browser settings."
        : err.name === "NotFoundError"
        ? "No camera found on this device."
        : `Camera error: ${err.message}`;
      setCameraError(msg);
      toast({ title: "Camera unavailable", description: msg, variant: "destructive" });
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: "image/jpeg" });
        const preview = URL.createObjectURL(file);
        setImages((prev) => [...prev, { file, preview }].slice(0, 5));
        toast({ title: "Photo captured", description: `${images.length + 1} of 5 max` });
      },
      "image/jpeg",
      0.92
    );
  };

  const reset = () => {
    images.forEach((img) => URL.revokeObjectURL(img.preview));
    setImages([]);
    setResult(null);
    setHeader(null);
    setCopied(false);
    stopCamera();
  };

  // Stop camera when dialog closes
  useEffect(() => {
    if (!open) stopCamera();
  }, [open, stopCamera]);

  const scan = async () => {
    if (images.length === 0) return;
    setScanning(true);
    setResult(null);
    setHeader(null);
    stopCamera();

    try {
      const imagePayloads: { image_base64: string; mime_type: string }[] = [];
      for (const img of images) {
        const arrayBuffer = await img.file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        imagePayloads.push({
          image_base64: btoa(binary),
          mime_type: img.file.type || "image/jpeg",
        });
      }

      const fields = [
        { id: "description", label: "Description / Notes", type: "text" },
        { id: "findings", label: "Findings / Results", type: "text" },
        { id: "actions_required", label: "Actions Required", type: "text" },
        { id: "materials_used", label: "Materials / Parts Used", type: "text" },
        { id: "overall_result", label: "Overall Result", type: "pass_fail" },
        { id: "additional_notes", label: "Additional Notes / Comments", type: "text" },
      ];

      const { data, error } = await supabase.functions.invoke("ocr-job-sheet", {
        body: {
          images: imagePayloads,
          template_name: "General Inspection Sheet",
          fields,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResult(data.extracted || {});
      setHeader(data.header || {});
      toast({ title: "Scan complete", description: "Review the extracted data below." });
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message || "Unknown error", variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const copyToClipboard = () => {
    const lines: string[] = [];
    if (header) {
      if (header.customer) lines.push(`Customer: ${header.customer}`);
      if (header.site) lines.push(`Site: ${header.site}`);
      if (header.date) lines.push(`Date: ${header.date}`);
      if (header.po_ref) lines.push(`Reference: ${header.po_ref}`);
      if (header.engineer) lines.push(`Engineer: ${header.engineer}`);
      if (header.riser_location) lines.push(`Location: ${header.riser_location}`);
      lines.push("");
    }
    if (result) {
      Object.entries(result).forEach(([key, value]) => {
        if (value) lines.push(`${key.replace(/_/g, " ")}: ${value}`);
      });
    }
    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  };

  const createJobFromScan = async () => {
    if (!header && !result) return;
    setCreatingJob(true);
    try {
      const jobName = header?.customer
        ? `${header.customer} - Scanned Sheet`
        : "Scanned Sheet";
      const description = result
        ? Object.entries(result)
            .filter(([, v]) => v)
            .map(([k, v]) => `**${k.replace(/_/g, " ")}**: ${v}`)
            .join("\n\n")
        : "";

      const { data: job, error } = await supabase
        .from("jobs")
        .insert({
          name: jobName,
          description,
          customer: header?.customer || null,
          address: header?.site || null,
          status: "active",
          priority: "medium",
        })
        .select("id")
        .single();

      if (error) throw error;
      toast({ title: "Job created", description: `${jobName}` });
      setOpen(false);
      reset();
      navigate(`/jobs/${job.id}`);
    } catch (err: any) {
      toast({ title: "Failed to create job", description: err.message, variant: "destructive" });
    } finally {
      setCreatingJob(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <ScanLine className="mr-2 h-4 w-4" /> Scan Sheet
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); } setOpen(v); }}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; setIsDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current === 0) setIsDragOver(false); }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current = 0; setIsDragOver(false); handleFiles(e.dataTransfer.files); }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary" />
              Quick Scan — AI Sheet Reader
            </DialogTitle>
          </DialogHeader>

          {/* Hidden canvas for camera capture */}
          <canvas ref={canvasRef} className="hidden" />

          {!result ? (
            <div className="space-y-4">
              {/* Live camera viewfinder */}
              {cameraActive ? (
                <div className="relative rounded-lg overflow-hidden border-2 border-primary bg-black">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full max-h-[400px] object-contain"
                  />
                  {/* Scan overlay guide */}
                  <div className="absolute inset-4 border-2 border-dashed border-white/40 rounded-lg pointer-events-none" />
                  <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/70 to-transparent flex items-center justify-center gap-3">
                    <Button
                      onClick={captureFrame}
                      size="lg"
                      className="rounded-full h-14 w-14 p-0 bg-white hover:bg-white/90 text-black shadow-lg"
                      disabled={images.length >= 5}
                    >
                      <Aperture className="h-7 w-7" />
                    </Button>
                    <Button
                      onClick={stopCamera}
                      variant="ghost"
                      size="sm"
                      className="text-white hover:text-white hover:bg-white/20"
                    >
                      <VideoOff className="mr-2 h-4 w-4" /> Close Camera
                    </Button>
                  </div>
                  {images.length > 0 && (
                    <div className="absolute top-2 right-2">
                      <Badge variant="secondary" className="bg-black/60 text-white border-0">
                        {images.length}/5 captured
                      </Badge>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Drop zone */}
                  <div
                    onDragEnter={(e) => { e.preventDefault(); dragCounter.current++; setIsDragOver(true); }}
                    onDragLeave={(e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setIsDragOver(false); }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileRef.current?.click()}
                    className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
                      isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                    }`}
                  >
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Drop photos of a handwritten sheet, or <span className="text-primary font-medium">click to browse</span>
                    </p>
                    <p className="text-xs text-muted-foreground">Up to 5 files • JPG, PNG, PDF</p>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                </>
              )}

              {/* Camera / upload buttons */}
              {!cameraActive && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={startCamera}>
                    <Video className="mr-2 h-4 w-4" /> Use Camera
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const inp = document.createElement("input");
                      inp.type = "file";
                      inp.accept = "image/*";
                      inp.capture = "environment";
                      inp.onchange = () => handleFiles(inp.files);
                      inp.click();
                    }}
                  >
                    <Camera className="mr-2 h-4 w-4" /> Take Photo
                  </Button>
                </div>
              )}

              {cameraError && (
                <p className="text-sm text-destructive">{cameraError}</p>
              )}

              {/* Preview thumbnails */}
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative group">
                      {img.file.type === "application/pdf" ? (
                        <div className="h-24 w-24 flex items-center justify-center rounded-md border bg-muted">
                          <span className="text-xs font-medium text-muted-foreground">PDF</span>
                        </div>
                      ) : (
                        <img src={img.preview} alt={`Page ${idx + 1}`} className="h-24 w-24 object-cover rounded-md border" />
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Button onClick={scan} disabled={images.length === 0 || scanning} className="w-full">
                {scanning ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning with AI…</>
                ) : (
                  <><ScanLine className="mr-2 h-4 w-4" /> Scan & Extract</>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header info */}
              {header && Object.values(header).some(Boolean) && (
                <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Header Info</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {header.customer && (
                      <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{header.customer}</span></div>
                    )}
                    {header.site && (
                      <div><span className="text-muted-foreground">Site:</span> <span className="font-medium">{header.site}</span></div>
                    )}
                    {header.date && (
                      <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{header.date}</span></div>
                    )}
                    {header.po_ref && (
                      <div><span className="text-muted-foreground">Reference:</span> <span className="font-medium">{header.po_ref}</span></div>
                    )}
                    {header.engineer && (
                      <div><span className="text-muted-foreground">Engineer:</span> <span className="font-medium">{header.engineer}</span></div>
                    )}
                    {header.riser_location && (
                      <div><span className="text-muted-foreground">Location:</span> <span className="font-medium">{header.riser_location}</span></div>
                    )}
                  </div>
                </div>
              )}

              {/* Extracted fields */}
              <div className="rounded-lg border p-4 space-y-3">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Extracted Data</p>
                {Object.entries(result).filter(([, v]) => v).length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No data could be extracted from this sheet.</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(result).filter(([, v]) => v).map(([key, value]) => (
                      <div key={key} className="flex items-start gap-2">
                        <Badge variant="secondary" className="shrink-0 mt-0.5 text-xs capitalize">
                          {key.replace(/_/g, " ")}
                        </Badge>
                        <p className="text-sm flex-1">
                          {value === "pass" ? "✅ Pass" : value === "fail" ? "❌ Fail" : value === "n/a" ? "N/A" : String(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button onClick={copyToClipboard} variant="outline" size="sm">
                  {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied ? "Copied" : "Copy All"}
                </Button>
                <Button onClick={createJobFromScan} disabled={creatingJob} size="sm">
                  {creatingJob ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…</>
                  ) : (
                    <><Plus className="mr-2 h-4 w-4" /> Create Job from This</>
                  )}
                </Button>
                <Button onClick={() => { setResult(null); setHeader(null); }} variant="ghost" size="sm">
                  <ScanLine className="mr-2 h-4 w-4" /> Scan Another
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
