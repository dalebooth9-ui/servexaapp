import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Loader2, ScanLine, Trash2, Upload, Plus, Copy, Check, Video, VideoOff, Aperture } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface TemplateField {
  id: string;
  label: string;
  type: string;
  section?: string;
  options?: string[];
  required?: boolean;
  allow_notes?: boolean;
}

export default function QuickScanDialog() {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanStage, setScanStage] = useState<string>("");
  const [result, setResult] = useState<Record<string, any> | null>(null);
  const [header, setHeader] = useState<Record<string, string> | null>(null);
  const [detectedCategory, setDetectedCategory] = useState<{ slug: string; name: string } | null>(null);
  const [matchedTemplate, setMatchedTemplate] = useState<{ id: string; name: string; fields: TemplateField[] } | null>(null);
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
      if (prev[idx].preview) URL.revokeObjectURL(prev[idx].preview);
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
    images.forEach((img) => { if (img.preview) URL.revokeObjectURL(img.preview); });
    setImages([]);
    setResult(null);
    setHeader(null);
    setCopied(false);
    setDetectedCategory(null);
    setMatchedTemplate(null);
    setScanStage("");
    stopCamera();
  };

  useEffect(() => {
    if (!open) stopCamera();
  }, [open, stopCamera]);

  const fileToBase64 = async (file: File): Promise<{ image_base64: string; mime_type: string }> => {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return {
      image_base64: btoa(binary),
      mime_type: file.type || "image/jpeg",
    };
  };

  const scan = async () => {
    if (images.length === 0) return;
    setScanning(true);
    setResult(null);
    setHeader(null);
    setDetectedCategory(null);
    setMatchedTemplate(null);
    stopCamera();

    try {
      // Convert files to base64
      const imagePayloads = await Promise.all(images.map((img) => fileToBase64(img.file)));

      // Stage 1: Identify the job category from the sheet
      setScanStage("Identifying document type…");

      const { data: categories } = await supabase
        .from("job_categories")
        .select("name, slug")
        .order("sort_order");

      const categoryNames = (categories || []).map((c: any) => c.name);
      const categoryIdentifyFields = [
        {
          id: "detected_category",
          label: "Document Category",
          type: "select",
          options: categoryNames,
        },
        {
          id: "confidence",
          label: "Confidence",
          type: "select",
          options: ["high", "medium", "low"],
        },
      ];

      const { data: identifyData, error: identifyError } = await supabase.functions.invoke("ocr-job-sheet", {
        body: {
          images: imagePayloads,
          template_name: "Category Identification",
          fields: categoryIdentifyFields,
        },
      });

      if (identifyError) throw identifyError;
      if (identifyData?.error) throw new Error(identifyData.error);

      const detectedName = identifyData?.extracted?.detected_category;
      const matchedCat = (categories || []).find(
        (c: any) => c.name.toLowerCase() === (detectedName || "").toLowerCase()
      );

      if (matchedCat) {
        setDetectedCategory({ slug: matchedCat.slug, name: matchedCat.name });
      }

      // Stage 2: Fetch the matching template and re-extract with its fields
      let templateFields: TemplateField[] = [];
      let templateName = "General Inspection Sheet";
      let templateRecord: any = null;

      if (matchedCat) {
        setScanStage(`Detected: ${matchedCat.name} — loading template…`);

        const { data: templates } = await supabase
          .from("job_sheet_templates")
          .select("id, name, fields, job_category")
          .eq("job_category", matchedCat.slug)
          .limit(1);

        if (templates && templates.length > 0) {
          templateRecord = templates[0];
          templateName = templateRecord.name;
          templateFields = (templateRecord.fields as any[] || []).map((f: any) => ({
            id: f.id,
            label: f.label,
            type: f.type,
            section: f.section,
            options: f.options,
            required: f.required,
            allow_notes: f.allow_notes,
          }));
          setMatchedTemplate({ id: templateRecord.id, name: templateName, fields: templateFields });
        }
      }

      // If no template matched, use generic fields
      if (templateFields.length === 0) {
        templateFields = [
          { id: "description", label: "Description / Notes", type: "text" },
          { id: "findings", label: "Findings / Results", type: "text" },
          { id: "actions_required", label: "Actions Required", type: "text" },
          { id: "materials_used", label: "Materials / Parts Used", type: "text" },
          { id: "overall_result", label: "Overall Result", type: "pass_fail" },
          { id: "additional_notes", label: "Additional Notes / Comments", type: "text" },
        ];
      }

      // Stage 3: Full extraction with the correct fields
      setScanStage("Extracting data from sheet…");

      const { data, error } = await supabase.functions.invoke("ocr-job-sheet", {
        body: {
          images: imagePayloads,
          template_name: templateName,
          fields: templateFields.map((f) => ({
            id: f.id,
            label: f.label,
            type: f.type,
            options: f.options,
          })),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResult(data.extracted || {});
      setHeader(data.header || {});
      toast({ title: "Scan complete", description: `Detected: ${detectedCategory?.name || matchedCat?.name || "General"} — review the extracted data below.` });
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message || "Unknown error", variant: "destructive" });
    } finally {
      setScanning(false);
      setScanStage("");
    }
  };

  const copyToClipboard = () => {
    const lines: string[] = [];
    if (detectedCategory) {
      lines.push(`Category: ${detectedCategory.name}`);
      lines.push("");
    }
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
        ? `${header.customer} - ${detectedCategory?.name || "Scanned Sheet"}`
        : detectedCategory?.name || "Scanned Sheet";

      const { data: job, error } = await supabase
        .from("jobs")
        .insert({
          name: jobName,
          customer: header?.customer || null,
          address: header?.site || null,
          status: "active",
          priority: "medium",
          category: detectedCategory?.slug || "general",
        })
        .select("id")
        .single();

      if (error) throw error;

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      // If we have a matched template and extracted data, create a job_sheet_response
      if (matchedTemplate && result && userId) {
        await supabase
          .from("job_sheet_responses")
          .insert({
            job_id: job.id,
            template_id: matchedTemplate.id,
            submitted_by: userId,
            responses: result,
            status: "draft",
          });
      }

      // Auto-import engineer signature from extracted header
      if (header?.engineer && userId) {
        // Try to match engineer profile by name and use their stored signature
        const engineerName = header.engineer.trim();
        if (engineerName) {
          const { data: profileMatch } = await supabase
            .from("profiles")
            .select("user_id, signature_data")
            .ilike("full_name", `%${engineerName.split(" ")[0]}%`)
            .limit(1)
            .maybeSingle();

          if (profileMatch?.signature_data) {
            // Convert base64 data URL to blob and upload
            try {
              const res = await fetch(profileMatch.signature_data);
              const blob = await res.blob();
              const sigPath = `engineer/${job.id}-${Date.now()}.png`;
              const { error: uploadErr } = await supabase.storage
                .from("signatures")
                .upload(sigPath, blob, { contentType: "image/png" });

              if (!uploadErr) {
                await supabase.from("job_signatures").insert({
                  job_id: job.id,
                  signer_id: profileMatch.user_id,
                  signer_name: engineerName,
                  signer_role: "engineer",
                  file_path: sigPath,
                });
              }
            } catch { /* skip signature upload errors */ }
          } else {
            // Create a name-only signature record (no image)
            await supabase.from("job_signatures").insert({
              job_id: job.id,
              signer_id: userId,
              signer_name: engineerName,
              signer_role: "engineer",
              file_path: "",
            });
          }
        }
      }

      // Auto-import customer signature from extracted header
      if (header?.customer_signed_name) {
        const customerName = header.customer_signed_name.trim();
        if (customerName && userId) {
          await supabase.from("job_signatures").insert({
            job_id: job.id,
            signer_id: userId,
            signer_name: customerName,
            signer_role: "customer",
            file_path: "",
          });
        }
      }

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

  // Build a label lookup from the matched template
  const fieldLabelMap: Record<string, string> = {};
  if (matchedTemplate) {
    for (const f of matchedTemplate.fields) {
      fieldLabelMap[f.id] = f.label;
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <ScanLine className="mr-2 h-4 w-4" /> Scan Sheet
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); } setOpen(v); }}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          aria-describedby="quick-scan-desc"
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
            <DialogDescription id="quick-scan-desc">
              Upload or photograph a handwritten sheet and AI will identify the type and extract the data.
            </DialogDescription>
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
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {scanStage || "Scanning with AI…"}</>
                ) : (
                  <><ScanLine className="mr-2 h-4 w-4" /> Scan & Extract</>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Detected category badge */}
              {detectedCategory && (
                <div className="flex items-center gap-2">
                  <Badge className="text-xs">📋 {detectedCategory.name}</Badge>
                  {matchedTemplate && (
                    <Badge variant="outline" className="text-xs">Template: {matchedTemplate.name}</Badge>
                  )}
                </div>
              )}

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
                        <Badge variant="secondary" className="shrink-0 mt-0.5 text-xs">
                          {fieldLabelMap[key] || key.replace(/_/g, " ")}
                        </Badge>
                        <p className="text-sm flex-1">
                          {value === true ? "✅ Yes" : value === false ? "❌ No" : value === "pass" ? "✅ Pass" : value === "fail" ? "❌ Fail" : value === "n/a" ? "N/A" : String(value)}
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
                <Button onClick={() => { setResult(null); setHeader(null); setDetectedCategory(null); setMatchedTemplate(null); }} variant="ghost" size="sm">
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
