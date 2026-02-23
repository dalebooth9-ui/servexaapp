import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Camera, FileDown, Loader2, ScanLine, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";

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
};

interface Props {
  template: Template;
  jobId: string;
  onExtracted: (data: Record<string, any>) => void;
}

export default function ScanJobSheet({ template, jobId, onExtracted }: Props) {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const [scanning, setScanningState] = useState(false);
  const [convertingPdf, setConvertingPdf] = useState(false);
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
      for (let i = 0; i < images.length; i++) {
        if (i > 0) doc.addPage();
        const img = new Image();
        img.src = images[i].preview;
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
        });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const ratio = Math.min(pageW / img.naturalWidth, pageH / img.naturalHeight);
        const w = img.naturalWidth * ratio;
        const h = img.naturalHeight * ratio;
        doc.addImage(img, "JPEG", (pageW - w) / 2, (pageH - h) / 2, w, h);
      }

      // Also save to local
      doc.save(`scanned-sheet-${Date.now()}.pdf`);

      // Upload to storage and create submission record
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
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("submissions").insert({
            job_id: jobId,
            engineer_id: user.id,
            type: "document",
            file_url: urlData.publicUrl,
            file_name: fileName,
          });
        }
        toast({ title: "PDF saved", description: `${images.length} page(s) converted and saved to job submissions.` });
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
        onExtracted(data.extracted);
        toast({ title: "Fields extracted", description: "Handwritten data has been read and populated into the form." });
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
