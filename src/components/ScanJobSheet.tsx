import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Camera, FileDown, Loader2, ScanLine, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import { loadWatermarkImage, addWatermarkToAllPages } from "@/lib/pdfWatermark";

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

export default function ScanJobSheet({ template, jobId, jobInfo, onExtracted }: Props) {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const [scanning, setScanningState] = useState(false);
  const [convertingPdf, setConvertingPdf] = useState(false);
  const [extractedHeader, setExtractedHeader] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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

      // --- BRANDED HEADER (no customer/site details) ---
      const branding = template.branding || {};
      const companyName = branding.company_name || "VIVAFIRE";
      const companySubtitle = branding.company_subtitle || "Wet & Dry Riser Specialists";
      const logoUrl = branding.logo_url || "/images/vivafire-logo-new.jpg";
      const isVisual = template.name.toLowerCase().includes("visual") || (template as any).category === "visual";
      const defaultFooter = isVisual
        ? "We have, today, carried out a visual check of the system\nto the requirements of BS 9990:2015"
        : "We have, today, carried out a Hydraulic Pressure Test to 12 Bar\nfor a period of 15 minutes to the requirements of BS 9990:2015";
      const footerText = branding.footer_text || defaultFooter;

      let y = 8;
      let logoBottomY = y;
      try {
        const logoImg = new Image();
        logoImg.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          logoImg.onload = () => resolve();
          logoImg.onerror = () => reject();
          logoImg.src = logoUrl;
        });
        const logoMaxW = 70;
        const logoMaxH = 20;
        const aspect = logoImg.naturalWidth / logoImg.naturalHeight;
        let lw = logoMaxH * aspect;
        let lh = logoMaxH;
        if (lw > logoMaxW) { lw = logoMaxW; lh = lw / aspect; }
        const fmt = logoUrl.toLowerCase().includes(".png") ? "PNG" : "JPEG";
        doc.addImage(logoImg, fmt, (pageWidth - lw) / 2, y, lw, lh);
        logoBottomY = y + lh + 3;
      } catch {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(companyName, pageWidth / 2, y + 5, { align: "center" });
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text(companySubtitle, pageWidth / 2, y + 9, { align: "center" });
        logoBottomY = y + 12;
      }

      // Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(33, 61, 99);
      doc.text(template.name.toUpperCase(), pageWidth / 2, logoBottomY, { align: "center" });
      doc.setDrawColor(33, 61, 99);
      doc.setLineWidth(0.5);
      doc.line(margin, logoBottomY + 3, pageWidth - margin, logoBottomY + 3);
      doc.setTextColor(30, 30, 30);
      y = logoBottomY + 7;

      // --- Customer details — prefer AI-extracted header, fall back to job data ---
      const referenceNumber = extractedHeader.po_ref || jobInfo?.reference_number || "";
      const customerName = extractedHeader.customer || jobInfo?.customer || "";
      const siteName = extractedHeader.site || jobInfo?.site?.name || "";
      const siteAddress = !extractedHeader.site ? (jobInfo?.site?.address || jobInfo?.address || "") : "";
      const dateStr = extractedHeader.date || new Date().toLocaleDateString("en-GB");

      doc.setDrawColor(0);
      doc.setLineWidth(0.2);
      doc.setTextColor(30, 30, 30);
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

      const headerRowH = 6;
      const totalHeaderRows = 3;
      const detailH = headerRowH * totalHeaderRows;
      doc.rect(margin, y, maxWidth, detailH);
      doc.line(margin + maxWidth * 0.5, y, margin + maxWidth * 0.5, y + detailH);
      doc.line(margin, y + headerRowH, margin + maxWidth, y + headerRowH);
      doc.line(margin, y + headerRowH * 2, margin + maxWidth, y + headerRowH * 2);

      doc.setFontSize(8);
      // Row 1: Customer + DATE
      doc.setFont("helvetica", "bold");
      doc.text("Customer:", margin + 1, y + 4);
      doc.setFont("helvetica", "normal");
      doc.text(doc.splitTextToSize(customerName, maxWidth * 0.5 - 22).slice(0, 1).join(""), margin + 19, y + 4);

      doc.setFont("helvetica", "bold");
      doc.text("DATE:", margin + maxWidth * 0.5 + 1, y + 4);
      doc.setFont("helvetica", "normal");
      doc.text(dateStr, margin + maxWidth * 0.5 + 14, y + 4);

      // Row 2: Site + PO/REF
      const siteStr = [siteName, siteAddress].filter(Boolean).join(", ");
      doc.setFont("helvetica", "bold");
      doc.text("Site:", margin + 1, y + headerRowH + 4);
      doc.setFont("helvetica", "normal");
      doc.text(doc.splitTextToSize(siteStr, maxWidth * 0.5 - 12).slice(0, 1).join(""), margin + 10, y + headerRowH + 4);

      doc.setFont("helvetica", "bold");
      doc.text("PO/REF:", margin + maxWidth * 0.5 + 1, y + headerRowH + 4);
      doc.setFont("helvetica", "normal");
      doc.text(referenceNumber, margin + maxWidth * 0.5 + 16, y + headerRowH + 4);

      // Row 3: Riser Location
      doc.setFont("helvetica", "bold");
      doc.text("Riser Location:", margin + 1, y + headerRowH * 2 + 4);
      doc.setFont("helvetica", "normal");
      doc.text(riserLocValue, margin + 28, y + headerRowH * 2 + 4);

      y += detailH + 1;

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
      const halfW = maxWidth / 2 - 2;
      const dateStr2 = new Date().toLocaleDateString("en-GB");
      const sigY = pageHeight - 35;
      const sigImgH = 8;
      const sigImgW = 25;

      doc.setFontSize(7);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text(`Date: `, margin, sigY + 3);
      doc.setFont("helvetica", "normal");
      doc.text(dateStr2, margin + 10, sigY + 3);
      doc.setFont("helvetica", "bold");
      doc.text("Technician:", margin, sigY + 7);
      doc.setFont("helvetica", "normal");
      const techName = jobInfo?.engineers?.length ? jobInfo.engineers.join(", ") : (engineerSig?.signer_name || "");
      doc.text(techName, margin + 20, sigY + 7);
      if (engineerSig && sigImages[engineerSig.id]) {
        doc.addImage(sigImages[engineerSig.id], "PNG", margin + 18, sigY + 8, sigImgW, sigImgH);
      } else {
        doc.text("Signature:", margin, sigY + 11);
        doc.line(margin + 18, sigY + 11, margin + halfW, sigY + 11);
      }

      const cx = margin + halfW + 4;
      doc.setFont("helvetica", "bold");
      doc.text(`Date: `, cx, sigY + 3);
      doc.setFont("helvetica", "normal");
      doc.text(dateStr2, cx + 10, sigY + 3);
      doc.setFont("helvetica", "bold");
      doc.text("Customer:", cx, sigY + 7);
      doc.setFont("helvetica", "normal");
      doc.text(customerSig?.signer_name || customerName, cx + 18, sigY + 7);
      if (customerSig && sigImages[customerSig.id]) {
        doc.addImage(sigImages[customerSig.id], "PNG", cx + 18, sigY + 8, sigImgW, sigImgH);
      } else {
        doc.text("Signature:", cx, sigY + 11);
        doc.line(cx + 18, sigY + 11, cx + halfW, sigY + 11);
      }

      // --- FOOTER DECLARATION on last page ---
      const footerY = sigY + 15;
      doc.setDrawColor(0);
      doc.rect(margin, footerY, maxWidth, 9);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      const footerLines = footerText.split("\n");
      footerLines.forEach((line, idx) => {
        doc.text(line.trim(), pageWidth / 2, footerY + 3 + idx * 3.5, { align: "center" });
      });

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
            Take a photo of your filled-in <strong>{template.name}</strong> sheet. You can convert it to PDF or use AI to read the handwriting and populate the digital form.
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

          {images.length === 0 ? (
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Camera className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Take Photo or Upload Image</p>
              <p className="text-xs text-muted-foreground mt-1">Supports JPG, PNG — up to 5 images</p>
            </div>
          ) : (
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
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
