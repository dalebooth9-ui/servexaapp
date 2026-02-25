import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Camera, FileDown, Loader2, MessageSquare, ScanLine, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import { loadWatermarkImage, addWatermarkToAllPages } from "@/lib/pdfWatermark";
import { renderPdfHeader } from "@/lib/pdfHeader";
import { renderPdfSignatures, renderPdfFooter, getDefaultFooterText } from "@/lib/pdfFooter";

type TemplateField = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  section: string;
  options?: string[];
};

type Template = {
  id: string;
  name: string;
  fields: TemplateField[];
  branding?: {
    company_name?: string;
    company_subtitle?: string;
    logo_url?: string;
    footer_text?: string;
  };
};

type JobInfo = {
  reference_number?: string;
  customer?: string | null;
  address?: string | null;
  site?: { name: string; address: string | null } | null;
  engineers?: string[];
};

interface Props {
  template: Template;
  jobId: string;
  jobInfo?: JobInfo | null;
  onExtracted: (data: Record<string, any>) => void;
}

type MessageImage = {
  url: string;
  caption: string;
  selected: boolean;
};

export default function ScanJobSheet({ template, jobId, jobInfo, onExtracted }: Props) {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const [scanning, setScanningState] = useState(false);
  const [convertingPdf, setConvertingPdf] = useState(false);
  const [extractedHeader, setExtractedHeader] = useState<Record<string, string>>({});
  const [messageImages, setMessageImages] = useState<MessageImage[]>([]);
  const [loadingMessageImages, setLoadingMessageImages] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchMessageImages = async () => {
    setLoadingMessageImages(true);
    try {
      const { data } = await supabase
        .from("job_messages" as any)
        .select("content, created_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });
      const imgs: MessageImage[] = [];
      for (const msg of (data || []) as any[]) {
        const match = msg.content?.match(/\[image:(https?:\/\/[^\]]+)\]/);
        if (match) {
          const caption = msg.content.replace(`[image:${match[1]}]`, "").trim();
          imgs.push({ url: match[1], caption, selected: false });
        }
      }
      setMessageImages(imgs);
    } catch {
      // ignore
    }
    setLoadingMessageImages(false);
  };

  const toggleMessageImage = (idx: number) => {
    setMessageImages((prev) => prev.map((img, i) => i === idx ? { ...img, selected: !img.selected } : img));
  };

  const addSelectedMessageImages = async () => {
    const selected = messageImages.filter((i) => i.selected);
    if (selected.length === 0) return;
    const remaining = 5 - images.length;
    const toAdd = selected.slice(0, remaining);
    const newImages: { file: File; preview: string }[] = [];
    for (const img of toAdd) {
      try {
        const res = await fetch(img.url);
        const blob = await res.blob();
        const ext = img.url.split(".").pop()?.split("?")[0] || "jpg";
        const file = new File([blob], `message-image.${ext}`, { type: blob.type || "image/jpeg" });
        newImages.push({ file, preview: URL.createObjectURL(file) });
      } catch {
        toast({ title: "Could not load image", description: img.url, variant: "destructive" });
      }
    }
    setImages((prev) => [...prev, ...newImages].slice(0, 5));
    setMessageImages((prev) => prev.map((img) => ({ ...img, selected: false })));
    toast({ title: `${newImages.length} image(s) added`, description: "Now use AI Read & Fill or Save as PDF." });
  };

  useEffect(() => {
    if (open) fetchMessageImages();
  }, [open]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newImages = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, 5)
      .map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setImages((prev) => [...prev, ...newImages].slice(0, 5));
  };

  const removeImage = (idx: number) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const convertToPdf = async () => {
    if (images.length === 0) return;
    setConvertingPdf(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      const maxWidth = pageWidth - margin * 2;

      // --- BRANDED HEADER ---
      const branding = template.branding || {};
      const footerText = getDefaultFooterText(template.name, branding);

      // Prefer AI-extracted header, fall back to job data
      const referenceNumber = extractedHeader.po_ref || jobInfo?.reference_number || "";
      const customerName = extractedHeader.customer || jobInfo?.customer || "";
      const siteName = extractedHeader.site || jobInfo?.site?.name || "";
      const siteAddress = !extractedHeader.site ? (jobInfo?.site?.address || jobInfo?.address || "") : "";
      const dateStr = extractedHeader.date || new Date().toLocaleDateString("en-GB");

      // Find riser location — prefer extracted header, then existing responses
      let riserLocValue = extractedHeader.riser_location || "";
      if (!riserLocValue) {
        const riserField = template.fields.find(f => f.label.toLowerCase().includes("riser location"));
        if (riserField) {
          const { data: existingResp } = await supabase
            .from("job_sheet_responses")
            .select("responses")
            .eq("job_id", jobId)
            .eq("template_id", template.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (existingResp?.responses) {
            const respData = existingResp.responses as Record<string, any>;
            riserLocValue = respData[riserField.id] ? String(respData[riserField.id]) : "";
          }
        }
      }

      let y = await renderPdfHeader(doc, template.name, branding, {
        customerName,
        siteName,
        siteAddress,
        refNumber: referenceNumber,
        dateVal: dateStr,
        riserLocation: riserLocValue,
      });

      // Scanned note
      doc.setFontSize(7);
      doc.setFont("helvetica", "italic");
      doc.text("Scanned from handwritten sheet", pageWidth / 2, y + 3, { align: "center" });
      y += 6;

      // --- SCANNED IMAGES ---
      for (let i = 0; i < images.length; i++) {
        const img = new Image();
        img.src = images[i].preview;
        await new Promise<void>((resolve) => { img.onload = () => resolve(); });

        const availH = pageHeight - y - 20; // leave space for footer on first page
        const ratio = Math.min(maxWidth / img.naturalWidth, availH / img.naturalHeight);
        const w = img.naturalWidth * ratio;
        const h = img.naturalHeight * ratio;

        if (i > 0) {
          doc.addPage();
          y = margin;
          const fullPageH = pageHeight - margin * 2;
          const fullRatio = Math.min(maxWidth / img.naturalWidth, fullPageH / img.naturalHeight);
          const fw = img.naturalWidth * fullRatio;
          const fh = img.naturalHeight * fullRatio;
          doc.addImage(img, "JPEG", (pageWidth - fw) / 2, y, fw, fh);
        } else {
          doc.addImage(img, "JPEG", (pageWidth - w) / 2, y, w, h);
          y += h + 2;
        }
      }

      // --- Fetch job signatures ---
      const { data: signatures } = await supabase
        .from("job_signatures")
        .select("id, signer_name, signer_role, file_path")
        .eq("job_id", jobId);

      const engineerSig = (signatures || []).find((s: any) => s.signer_role === "engineer" || s.signer_role === "admin");
      const customerSig = (signatures || []).find((s: any) => s.signer_role === "customer");

      // Load signature images
      const sigImages: Record<string, HTMLImageElement> = {};
      for (const sig of [engineerSig, customerSig].filter(Boolean)) {
        if (!sig) continue;
        try {
          const { data: urlData } = supabase.storage.from("signatures").getPublicUrl(sig.file_path);
          if (urlData?.publicUrl) {
            const sigImg = new Image();
            sigImg.crossOrigin = "anonymous";
            await new Promise<void>((resolve) => {
              sigImg.onload = () => resolve();
              sigImg.onerror = () => resolve();
              sigImg.src = urlData.publicUrl;
            });
            if (sigImg.naturalWidth > 0) sigImages[sig.id] = sigImg;
          }
        } catch { /* skip */ }
      }

      // --- SIGNATURE BLOCKS on last page ---
      const dateStr2 = new Date().toLocaleDateString("en-GB");
      const sigY = pageHeight - 35;

      const techName = jobInfo?.engineers?.length ? jobInfo.engineers.join(", ") : (engineerSig?.signer_name || "");

      const footerStartY = renderPdfSignatures(doc, sigY, {
        dateStr: dateStr2,
        technicianName: techName,
        customerName,
        sigImages,
        engineerSig,
        customerSig,
      });

      // --- FOOTER DECLARATION on last page ---
      renderPdfFooter(doc, footerStartY, footerText);

      // Watermark
      const watermark = await loadWatermarkImage();
      if (watermark) addWatermarkToAllPages(doc, watermark);

      doc.save(`scanned-sheet-${Date.now()}.pdf`);

      // Upload to storage and create submission record
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const pdfBlob = doc.output("blob");
      const fileName = `scanned-${template.name.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.pdf`;
      const filePath = `${jobId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("submissions")
        .upload(filePath, pdfBlob, { contentType: "application/pdf" });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        toast({ title: "PDF downloaded locally", description: "Could not save to job submissions.", variant: "destructive" });
      } else {
        const { data: urlData } = supabase.storage.from("submissions").getPublicUrl(filePath);
        await supabase.from("submissions").insert({
          job_id: jobId,
          engineer_id: user.id,
          type: "document",
          file_url: urlData.publicUrl,
          file_name: fileName,
        });

        // Also upload each original photo as an image submission
        for (let i = 0; i < images.length; i++) {
          const imgFile = images[i].file;
          const ext = imgFile.name.split(".").pop() || "jpg";
          const imgFileName = `scan-photo-${i + 1}-${Date.now()}.${ext}`;
          const imgPath = `${jobId}/${imgFileName}`;
          const { error: imgErr } = await supabase.storage
            .from("submissions")
            .upload(imgPath, imgFile, { contentType: imgFile.type });
          if (!imgErr) {
            const { data: imgUrl } = supabase.storage.from("submissions").getPublicUrl(imgPath);
            await supabase.from("submissions").insert({
              job_id: jobId,
              engineer_id: user.id,
              type: "photo",
              file_url: imgUrl.publicUrl,
              file_name: imgFileName,
            });
          }
        }

        toast({ title: "PDF & photos saved", description: `PDF + ${images.length} photo(s) saved to job submissions.` });
      }
    } catch (err: any) {
      toast({ title: "Error creating PDF", description: err.message, variant: "destructive" });
    }
    setConvertingPdf(false);
  };

  const handleOcrScan = async () => {
    if (images.length === 0) return;
    setScanningState(true);
    try {
      // Convert first image to base64
      const file = images[0].file;
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]); // strip data:image/...;base64,
        };
        reader.readAsDataURL(file);
      });

      // Build field descriptions for the AI
      const fieldDescriptions = template.fields.map((f) => ({
        id: f.id,
        label: f.label,
        type: f.type,
        section: f.section,
        options: f.options,
      }));

      const { data, error } = await supabase.functions.invoke("ocr-job-sheet", {
        body: {
          image_base64: base64,
          mime_type: file.type,
          template_name: template.name,
          fields: fieldDescriptions,
        },
      });

      if (error) throw error;

      if (data?.extracted) {
        // Store extracted header fields for PDF generation
        if (data.header) {
          setExtractedHeader(data.header);
        }
        onExtracted(data.extracted);
        toast({ title: "Fields extracted", description: "Handwritten data has been read and populated into the form. Header fields captured for PDF." });
        setOpen(false);
        setImages([]);
      } else {
        toast({ title: "No data extracted", description: "Could not read the handwritten content. Try a clearer photo.", variant: "destructive" });
      }
    } catch (err: any) {
      const message = err?.message || "Unknown error";
      if (message.includes("429") || message.includes("rate limit")) {
        toast({ title: "Rate limited", description: "Too many requests. Please try again in a moment.", variant: "destructive" });
      } else if (message.includes("402")) {
        toast({ title: "Credits required", description: "Please add credits to your workspace to use AI scanning.", variant: "destructive" });
      } else {
        toast({ title: "Scan failed", description: message, variant: "destructive" });
      }
    }
    setScanningState(false);
  };

  const imageGrid = (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {images.map((img, i) => (
          <div key={i} className="relative">
            <img src={img.preview} alt={`Page ${i + 1}`} className="rounded border object-cover w-full aspect-[3/4]" />
            <button
              className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs"
              onClick={() => removeImage(i)}
            >×</button>
          </div>
        ))}
        {images.length < 5 && (
          <button
            className="border-2 border-dashed border-border rounded-lg flex items-center justify-center aspect-[3/4] hover:bg-muted/50"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-5 w-5 text-muted-foreground" />
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={convertToPdf} disabled={convertingPdf}>
          {convertingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <FileDown className="h-3.5 w-3.5 mr-1.5" />}
          Save as PDF
        </Button>
        <Button size="sm" className="flex-1" onClick={handleOcrScan} disabled={scanning}>
          {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <ScanLine className="h-3.5 w-3.5 mr-1.5" />}
          {scanning ? "Reading..." : "AI Read & Fill"}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(true)} title="Scan handwritten sheet">
        <ScanLine className="h-3.5 w-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <ScanLine className="h-4 w-4" /> Scan Handwritten Sheet
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Take a photo of your filled-in job sheet. You can convert it to PDF or use AI to read the handwriting and populate the digital form.
          </p>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          <Tabs defaultValue="upload">
            <TabsList className="w-full">
              <TabsTrigger value="upload" className="flex-1 text-xs">
                <Camera className="h-3.5 w-3.5 mr-1.5" /> Upload / Camera
              </TabsTrigger>
              <TabsTrigger value="messages" className="flex-1 text-xs">
                <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> From Messages
                {messageImages.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 leading-none">
                    {messageImages.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-3">
              {images.length === 0 ? (
                <div
                  className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <Camera className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">Take Photo or Upload Image</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports JPG, PNG — up to 5 images</p>
                </div>
              ) : imageGrid}
            </TabsContent>

            <TabsContent value="messages" className="mt-3">
              {loadingMessageImages ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : messageImages.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">No images in messages</p>
                  <p className="text-xs text-muted-foreground mt-1">Send images in the Job Messages section first.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Select images to add to the scanner (up to {5 - images.length} more).</p>
                  <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto">
                    {messageImages.map((img, i) => (
                      <button
                        key={i}
                        onClick={() => toggleMessageImage(i)}
                        className={`relative rounded border-2 overflow-hidden aspect-[3/4] transition-colors ${img.selected ? "border-primary" : "border-transparent"}`}
                      >
                        <img src={img.url} alt={`Message image ${i + 1}`} className="object-cover w-full h-full" />
                        {img.selected && (
                          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                            <div className="rounded-full bg-primary text-primary-foreground h-6 w-6 flex items-center justify-center text-xs font-bold">✓</div>
                          </div>
                        )}
                        {img.caption && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate">{img.caption}</div>
                        )}
                      </button>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={!messageImages.some((i) => i.selected) || images.length >= 5}
                    onClick={addSelectedMessageImages}
                  >
                    Add Selected to Scanner
                  </Button>
                  {images.length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs font-medium mb-2">{images.length} image(s) ready:</p>
                      {imageGrid}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
