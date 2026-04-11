import { useState, useRef, useEffect, useCallback } from "react";
import { fuzzyMatchEngineer } from "@/lib/fuzzyEngineerMatch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Camera, FileDown, Loader2, MessageSquare, ScanLine, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import { loadWatermarkImage, addWatermarkToAllPages } from "@/lib/pdfWatermark";
import ScanReviewPanel from "@/components/ScanReviewPanel";
import { loadAccreditationLogos, addAccreditationLogosToAllPages } from "@/lib/pdfAccreditations";
import { renderPdfHeader } from "@/lib/pdfHeader";
import { renderPdfSignatures, renderPdfFooter, getDefaultFooterText } from "@/lib/pdfFooter";
import { getBrandColorFromLogo } from "@/lib/extractLogoColors";

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
  customers?: { name: string; logo_url?: string | null } | null;
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
  const [reviewData, setReviewData] = useState<{
    fields: Record<string, any>;
    header: Record<string, any>;
  } | null>(null);
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
        // Extract the storage path from the URL to create a signed URL for private buckets
        let fetchUrl: string | null = null;
        const storageMatch = img.url.match(/\/storage\/v1\/object\/(?:public|sign(?:ed)?)\/([^?]+)/);
        if (storageMatch) {
          const fullPath = decodeURIComponent(storageMatch[1]);
          const slashIdx = fullPath.indexOf("/");
          if (slashIdx !== -1) {
            const bucket = fullPath.slice(0, slashIdx);
            const filePath = fullPath.slice(slashIdx + 1);
            const { data: signedData, error: signedError } = await supabase.storage
              .from(bucket)
              .createSignedUrl(filePath, 120);
            if (signedError || !signedData?.signedUrl) {
              throw new Error(`Could not get access to image: ${signedError?.message || "unknown"}`);
            }
            fetchUrl = signedData.signedUrl;
          }
        } else {
          // Not a storage URL, use directly
          fetchUrl = img.url;
        }
        if (!fetchUrl) throw new Error("Could not resolve image URL");
        const res = await fetch(fetchUrl);
        if (!res.ok) throw new Error(`Image fetch failed: HTTP ${res.status}`);
        const blob = await res.blob();
        if (!blob.type.startsWith("image/")) throw new Error(`Expected an image but got: ${blob.type}`);
        const ext = img.url.split(".").pop()?.split("?")[0] || "jpg";
        const file = new File([blob], `message-image.${ext}`, { type: blob.type });
        newImages.push({ file, preview: URL.createObjectURL(file) });
      } catch (e: any) {
        toast({ title: "Could not load image", description: e.message || img.url, variant: "destructive" });
      }
    }
    setImages((prev) => [...prev, ...newImages].slice(0, 5));
    setMessageImages((prev) => prev.map((img) => ({ ...img, selected: false })));
    toast({ title: `${newImages.length} image(s) added`, description: "Now use AI Read & Fill or Save as PDF." });
  };

  useEffect(() => {
    if (open) fetchMessageImages();
  }, [open]);

  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const newImages = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, 5)
      .map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setImages((prev) => [...prev, ...newImages].slice(0, 5));
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    const pdfFiles = files.filter((f) => f.type === "application/pdf");

    // Add image files directly
    if (imageFiles.length > 0) {
      handleFiles(imageFiles);
    }

    // For PDFs, render first page as an image using canvas
    for (const pdf of pdfFiles) {
      if (images.length >= 5) break;
      try {
        const arrayBuffer = await pdf.arrayBuffer();
        // Dynamically import pdfjs-dist if available, otherwise show toast
        // Use pdfjsLib from CDN via window object
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let pdfjsLib: any = (window as any).pdfjsLib;
        if (!pdfjsLib) {
          // Dynamically load pdf.js from CDN
          await new Promise<void>((res, rej) => {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            script.onload = () => res();
            script.onerror = () => rej(new Error("Failed to load PDF.js"));
            document.head.appendChild(script);
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pdfjsLib = (window as any).pdfjsLib;
        }
        if (!pdfjsLib) {
          toast({ title: "PDF not supported", description: "Drop image files (JPG/PNG) instead.", variant: "destructive" });
          continue;
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = Math.min(pdfDoc.numPages, 5 - images.length);
        for (let p = 1; p <= numPages; p++) {
          const page = await pdfDoc.getPage(p);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          await new Promise<void>((resolve) => {
            canvas.toBlob((blob) => {
              if (blob) {
                const file = new File([blob], `${pdf.name}-page${p}.jpg`, { type: "image/jpeg" });
                setImages((prev) => [...prev, { file, preview: URL.createObjectURL(file) }].slice(0, 5));
              }
              resolve();
            }, "image/jpeg", 0.92);
          });
        }
      } catch (err: any) {
        toast({ title: "Could not read PDF", description: "Try dropping an image file (JPG/PNG) instead.", variant: "destructive" });
      }
    }
  }, [images.length, toast]);

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
      // Always do a fresh query to get the most up-to-date customer logo_url
      let customerLogoUrl: string | null | undefined = jobInfo?.customers?.logo_url;
      if (!customerLogoUrl && jobId) {
        const { data: freshJob } = await supabase
          .from("jobs")
          .select("customers(logo_url)")
          .eq("id", jobId)
          .single();
        customerLogoUrl = (freshJob as any)?.customers?.logo_url || null;
      }
      const baseBranding = template.branding || {};
      const branding = customerLogoUrl
        ? { ...baseBranding, logo_url: customerLogoUrl }
        : baseBranding;
      const footerText = getDefaultFooterText(template.name, branding);

      // --- Load customer logo and extract dominant brand colour ---
      let brandLogoImg: HTMLImageElement | null = null;
      const logoSrc = branding.logo_url;
      if (logoSrc) {
        try {
          const img = new Image();
          img.crossOrigin = "anonymous";
          await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); img.src = logoSrc; });
          brandLogoImg = img;
        } catch { /* use default colour */ }
      }
      const accentColor = getBrandColorFromLogo(brandLogoImg, !!logoSrc);

      // Prefer AI-extracted header, fall back to job data
      const referenceNumber = extractedHeader.po_ref || jobInfo?.reference_number || "";
      const customerName = extractedHeader.customer || jobInfo?.customer || "";
      const siteName = extractedHeader.site || jobInfo?.site?.name || "";
      const siteAddress = !extractedHeader.site ? (jobInfo?.site?.address || jobInfo?.address || "") : "";

      // Parse extracted date — handle short formats like "9/3/26" (DD/MM/YY) → "09/03/2026"
      const parseExtractedDate = (raw: string): string => {
        if (!raw) return new Date().toLocaleDateString("en-GB");
        const parts = raw.trim().split(/[\/\-\.]/);
        if (parts.length === 3) {
          const [a, b, c] = parts.map(p => p.trim());
          const year = c.length === 2 ? `20${c}` : c;
          const day = a.padStart(2, "0");
          const month = b.padStart(2, "0");
          return `${day}/${month}/${year}`;
        }
        return raw;
      };
      const dateStr = extractedHeader.date ? parseExtractedDate(extractedHeader.date) : new Date().toLocaleDateString("en-GB");

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
      }, undefined, accentColor);

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

      // Use extracted header values if available, fall back to job data
      // For the signature date: prefer the extracted customer sign date, then form date, then today
      const sigDateStr = extractedHeader.customer_sign_date
        ? parseExtractedDate(extractedHeader.customer_sign_date)
        : extractedHeader.date
        ? parseExtractedDate(extractedHeader.date)
        : new Date().toLocaleDateString("en-GB");
      const techName = extractedHeader.engineer || jobInfo?.engineers?.join(", ") || engineerSig?.signer_name || "";

      // The person who physically signed the customer block (e.g. "Calvin")
      const customerSignedName = extractedHeader.customer_signed_name || customerSig?.signer_name || "";

      // Load signature images — prefer profile signature matched by extracted engineer name
      const sigImages: Record<string, HTMLImageElement> = {};

      // Helper: load an image from a signed storage URL
      const loadSigImage = async (sig: any): Promise<void> => {
        try {
          if (!sig?.file_path) return;
          const { data: urlData } = await supabase.storage.from("signatures").createSignedUrl(sig.file_path, 3600);
          if (urlData?.signedUrl) {
            const sigImg = new Image();
            sigImg.crossOrigin = "anonymous";
            await new Promise<void>((resolve) => {
              sigImg.onload = () => resolve();
              sigImg.onerror = () => resolve();
              sigImg.src = urlData.signedUrl;
            });
            if (sigImg.naturalWidth > 0) sigImages[sig.id] = sigImg;
          }
        } catch { /* skip */ }
      };

      // Try to load profile signature for the technician (by extracted name or assigned engineer)
      let profileSigId: string | null = null;
      if (techName) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("user_id, signature_data")
          .ilike("full_name", `%${techName.split(" ")[0]}%`)
          .limit(1)
          .maybeSingle();
        if (profileData?.signature_data) {
          const img = new Image();
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = profileData.signature_data;
          });
          if (img.naturalWidth > 0) {
            profileSigId = `profile-${profileData.user_id}`;
            sigImages[profileSigId] = img;
          }
        }
      }

      // Load engineer + customer sig images in parallel (both file_path and inline data)
      await Promise.all([engineerSig, customerSig].filter(Boolean).map(loadSigImage));

      // Resolve the engineer sig to use: prefer job signature, fall back to profile
      const resolvedEngineerSig = engineerSig
        ? engineerSig
        : profileSigId
        ? { id: profileSigId, signer_name: techName, signer_role: "engineer" }
        : null;

      // Build a synthetic customer sig record from OCR-extracted name if no digital sig exists
      // This ensures the customer name (e.g. "Calvin") always appears in the PDF signature block
      const resolvedCustomerSig = customerSig
        ? customerSig
        : customerSignedName
        ? { id: `ocr-customer`, signer_name: customerSignedName, signer_role: "customer", file_path: null }
        : null;

      // --- SIGNATURE BLOCKS on last page ---
      const sigY = pageHeight - 35;

      const footerStartY = renderPdfSignatures(doc, sigY, {
        dateStr: sigDateStr,
        technicianName: techName,
        customerName: customerSignedName || customerName,
        sigImages,
        engineerSig: resolvedEngineerSig,
        customerSig: resolvedCustomerSig,
      });

      // --- FOOTER DECLARATION on last page ---
      renderPdfFooter(doc, footerStartY, footerText);

      // Watermark + Accreditations
      const [watermark, accredLogos] = await Promise.all([
        loadWatermarkImage(),
        loadAccreditationLogos(),
      ]);
      if (watermark) addWatermarkToAllPages(doc, watermark, accentColor);
      addAccreditationLogosToAllPages(doc, accredLogos, footerStartY, 12);

      const safeSite = siteName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
      const downloadName = [
        jobInfo?.reference_number || "scanned",
        safeSite || null,
        template.name.replace(/\s+/g, "-").toLowerCase(),
        customerName.replace(/\s+/g, "-").toLowerCase() || null,
      ].filter(Boolean).join("-") + ".pdf";
      doc.save(downloadName);

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
        // submissions bucket is private — create a long-lived signed URL
        const { data: signedPdf } = await supabase.storage
          .from("submissions")
          .createSignedUrl(filePath, 60 * 60 * 24 * 365 * 5);
        await supabase.from("submissions").insert({
          job_id: jobId,
          engineer_id: user.id,
          type: "document",
          file_url: signedPdf?.signedUrl || filePath,
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
            const { data: signedImg } = await supabase.storage
              .from("submissions")
              .createSignedUrl(imgPath, 60 * 60 * 24 * 365 * 5);
            await supabase.from("submissions").insert({
              job_id: jobId,
              engineer_id: user.id,
              type: "photo",
              file_url: signedImg?.signedUrl || imgPath,
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

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
      reader.readAsDataURL(file);
    });

  const handleOcrScan = async () => {
    if (images.length === 0) return;
    setScanningState(true);
    try {
      const fieldDescriptions = template.fields.map((f) => ({
        id: f.id,
        label: f.label,
        type: f.type,
        section: f.section,
        options: f.options,
      }));

      // Convert all images to base64 in parallel
      const imagePayloads = await Promise.all(
        images.map(async (img) => ({
          image_base64: await toBase64(img.file),
          mime_type: img.file.type,
        }))
      );

      const { data, error } = await supabase.functions.invoke("ocr-job-sheet", {
        body: {
          images: imagePayloads,
          template_name: template.name,
          fields: fieldDescriptions,
        },
      });

      if (error) throw error;

      if (data?.extracted) {
        const header = data.header || {};

        // Fuzzy-match engineer name against known profiles
        if (header.engineer) {
          const { data: profiles } = await supabase.from("profiles").select("user_id, full_name");
          if (profiles && profiles.length > 0) {
            const matched = fuzzyMatchEngineer(header.engineer, profiles.filter((p: any) => p.full_name));
            if (matched === header.engineer && jobInfo?.engineers?.length) {
              header.engineer = jobInfo.engineers[0];
            } else {
              header.engineer = matched;
            }
          }
        } else if (jobInfo?.engineers?.length) {
          header.engineer = jobInfo.engineers[0];
        }

        // Show review panel instead of immediately applying
        setReviewData({ fields: data.extracted, header });
        toast({
          title: "Data extracted — please review",
          description: `Check the extracted values before confirming.`,
        });
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

  const handleConfirmReview = (confirmedFields: Record<string, any>, confirmedHeader: Record<string, any>, fieldNotes: Record<string, string>) => {
    setExtractedHeader(confirmedHeader);

    // Map header values into matching template form fields by label
    const headerFieldMap: Record<string, string> = {};
    for (const field of template.fields) {
      const lbl = field.label.toLowerCase().replace(/[:\s]+$/g, "").trim();
      if ((lbl.includes("site") || lbl === "site name" || lbl === "site address" || lbl === "location") && confirmedHeader.site) {
        headerFieldMap[field.id] = confirmedHeader.site;
      } else if ((lbl.includes("customer") || lbl.includes("client")) && confirmedHeader.customer) {
        headerFieldMap[field.id] = confirmedHeader.customer;
      } else if ((lbl.includes("riser location") || lbl === "riser" || lbl === "location") && confirmedHeader.riser_location) {
        headerFieldMap[field.id] = confirmedHeader.riser_location;
      } else if ((lbl.includes("date") || lbl === "inspection date" || lbl === "service date" || lbl === "visit date") && confirmedHeader.date) {
        headerFieldMap[field.id] = confirmedHeader.date;
      } else if ((lbl.includes("po") || lbl.includes("ref") || lbl.includes("reference") || lbl.includes("order number")) && confirmedHeader.po_ref) {
        headerFieldMap[field.id] = confirmedHeader.po_ref;
      } else if ((lbl.includes("engineer") || lbl.includes("technician")) && confirmedHeader.engineer) {
        headerFieldMap[field.id] = confirmedHeader.engineer;
      }
    }

    // Merge notes into the field data as {fieldId}_notes keys
    const notesMap: Record<string, string> = {};
    for (const [fieldId, note] of Object.entries(fieldNotes)) {
      if (note.trim()) {
        notesMap[`${fieldId}_notes`] = note.trim();
      }
    }

    onExtracted({ ...headerFieldMap, ...confirmedFields, ...notesMap });
    toast({ title: "Fields applied", description: "Reviewed data has been populated into the form." });
    setReviewData(null);
    setOpen(false);
    setImages([]);
  };

  const handleRescan = () => {
    setReviewData(null);
  };

  return (
    <>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(true)} title="Scan handwritten sheet">
        <ScanLine className="h-3.5 w-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={(v) => { if (!v) { setReviewData(null); } setOpen(v); }}>
        {reviewData ? (
          <DialogContent className="max-w-4xl p-0">
            <ScanReviewPanel
              imagePreviews={images.map((img) => img.preview)}
              extractedFields={reviewData.fields}
              extractedHeader={reviewData.header}
              templateFields={template.fields}
              templateName={template.name}
              onConfirm={handleConfirmReview}
              onRescan={handleRescan}
            />
          </DialogContent>
        ) : (
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
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              const images = files.filter((f) => f.type.startsWith("image/"));
              const pdfs = files.filter((f) => f.type === "application/pdf");
              if (images.length > 0) handleFiles(images);
              // For PDFs, trigger the same drop handler logic
              if (pdfs.length > 0) {
                for (const pdf of pdfs) {
                  const dt = new DataTransfer();
                  dt.items.add(pdf);
                  await handleDrop({ preventDefault: () => {}, stopPropagation: () => {}, dataTransfer: dt } as any);
                }
              }
              e.target.value = "";
            }}
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
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${isDragOver ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted/50"}`}
                  onClick={() => fileRef.current?.click()}
                  onDragEnter={(e) => { e.preventDefault(); dragCounterRef.current++; setIsDragOver(true); }}
                  onDragLeave={(e) => { e.preventDefault(); dragCounterRef.current--; if (dragCounterRef.current === 0) setIsDragOver(false); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                >
                  <Camera className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">{isDragOver ? "Drop files here" : "Take Photo or Upload Image"}</p>
                  <p className="text-xs text-muted-foreground mt-1">Drag & drop images or PDFs here, or click to browse — up to 5 pages</p>
                </div>
              ) : (
                <div
                  onDragEnter={(e) => { e.preventDefault(); dragCounterRef.current++; setIsDragOver(true); }}
                  onDragLeave={(e) => { e.preventDefault(); dragCounterRef.current--; if (dragCounterRef.current === 0) setIsDragOver(false); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  className={`rounded-lg transition-colors ${isDragOver ? "ring-2 ring-primary ring-offset-1 bg-primary/5" : ""}`}
                >
                  {imageGrid}
                </div>
              )}
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
        )}
      </Dialog>
    </>
  );
}
