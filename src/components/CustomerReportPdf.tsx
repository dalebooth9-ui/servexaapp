import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import { renderPdfHeader, type PdfHeaderData, type PdfBranding } from "@/lib/pdfHeader";
import { renderPdfSignatures, renderPdfFooter, getDefaultFooterText, type PdfSignatureData } from "@/lib/pdfFooter";
import { loadWatermarkImage, addWatermarkToAllPages } from "@/lib/pdfWatermark";
import { fetchCustomerAccreditationLogos, loadAccreditationLogos, addAccreditationLogosToAllPages } from "@/lib/pdfAccreditations";

interface Props {
  jobId: string;
  job: any;
  onPdfGenerated?: (pdfBase64: string, fileName: string) => void;
  trigger?: React.ReactNode;
}

export default function CustomerReportPdf({ jobId, job, onPdfGenerated, trigger }: Props) {
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const generate = async () => {
    setGenerating(true);
    try {
      const custAccredUrls = await fetchCustomerAccreditationLogos(job.customers?.name || job.customer);
      const [subsRes, reportsRes, visitsRes, partsRes, assignRes, sigRes, watermark, accredLogos] = await Promise.all([
        supabase.from("submissions").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("field_reports").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("job_visits").select("*").eq("job_id", jobId).order("scheduled_date", { ascending: true }),
        supabase.from("job_parts").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("job_assignments").select("engineer_id").eq("job_id", jobId),
        supabase.from("job_signatures").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        loadWatermarkImage(),
        loadAccreditationLogos(custAccredUrls),
      ]);

      const submissions = subsRes.data || [];
      const reports = reportsRes.data || [];
      const visits = visitsRes.data || [];
      const parts = (partsRes.data as any[]) || [];
      const signatures = (sigRes.data as any[]) || [];

      // Fetch engineer names
      const engIds = [...new Set((assignRes.data || []).map((a: any) => a.engineer_id))];
      let engineerNames: string[] = [];
      if (engIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", engIds);
        engineerNames = (profiles || []).map((p) => p.full_name || "Unknown");
      }

      // Pre-load photo images — preserve original bytes (no canvas re-encoding)
      // so quality is retained, and capture intrinsic dimensions for proper scaling.
      const photos = submissions.filter((s: any) => s.type === "photo" && s.file_url);
      type PhotoEntry = {
        dataUrl: string;
        format: "JPEG" | "PNG";
        natW: number;
        natH: number;
        name: string;
        date: string;
        caption: string;
      };
      const photoImages: PhotoEntry[] = [];
      const maxPhotos = 12;
      for (const photo of photos.slice(0, maxPhotos)) {
        try {
          const path = extractStoragePath(photo.file_url);
          if (!path) continue;
          const { data: signed } = await supabase.storage.from("submissions").createSignedUrl(path, 3600);
          if (!signed?.signedUrl) continue;

          // 1. Download the raw bytes — no re-encoding, preserves original quality.
          const res = await fetch(signed.signedUrl);
          if (!res.ok) continue;
          const blob = await res.blob();
          const mime = blob.type || "image/jpeg";
          const isPng = mime.includes("png");
          const dataUrl: string = await new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result as string);
            fr.onerror = () => reject(new Error("read fail"));
            fr.readAsDataURL(blob);
          });

          // 2. Probe intrinsic size for aspect-ratio scaling (no stretching).
          const probe = new Image();
          probe.crossOrigin = "anonymous";
          await new Promise<void>((resolve, reject) => {
            probe.onload = () => resolve();
            probe.onerror = () => reject();
            probe.src = dataUrl;
          });

          const ts = new Date(photo.created_at);
          const dateStr = ts.toLocaleDateString("en-GB");
          const timeStr = ts.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
          photoImages.push({
            dataUrl,
            format: isPng ? "PNG" : "JPEG",
            natW: probe.naturalWidth || 1,
            natH: probe.naturalHeight || 1,
            name: photo.file_name || "Photo",
            date: `${dateStr} ${timeStr}`,
            caption: (photo as any).content || (photo as any).caption || "",
          });
        } catch { /* skip failed images */ }
      }


      // Pre-load signature images
      const sigImages: Record<string, HTMLImageElement> = {};
      await Promise.all(signatures.map(async (sig: any) => {
        try {
          const { data } = await supabase.storage.from("signatures").createSignedUrl(sig.file_path, 3600);
          if (!data?.signedUrl) return;
          const img = new Image();
          img.crossOrigin = "anonymous";
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject();
            img.src = data.signedUrl;
          });
          sigImages[sig.id] = img;
        } catch { /* skip */ }
      }));

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 10;
      const maxWidth = pageWidth - margin * 2;

      const addPage = () => { doc.addPage(); };
      const checkPage = (needed: number, currentY: number): number => {
        if (currentY + needed > 270) { addPage(); return 20; }
        return currentY;
      };

      // === SHARED HEADER ===
      const customerName = job.customers?.name || job.customer || "N/A";
      const siteName = job.sites?.name || "";
      const siteAddress = job.sites?.address || job.address || "";
      const refNumber = job.reference_number || "";
      const dateVal = new Date().toLocaleDateString("en-GB");

      // Resolve what3words for the site address
      let w3wAddress: string | undefined;
      if (siteAddress) {
        try {
          const { data: w3wData } = await supabase.functions.invoke("w3w-convert", {
            body: { address: siteAddress },
          });
          if (w3wData?.words) w3wAddress = w3wData.words as string;
        } catch { /* skip */ }
      }

      const branding: PdfBranding = {
        logo_url: job.customers?.logo_url || undefined,
      };
      const headerData: PdfHeaderData = {
        customerName,
        siteName,
        siteAddress,
        refNumber,
        dateVal,
        riserLocation: "",
        w3wAddress,
      };

      let y = await renderPdfHeader(doc, "CUSTOMER REPORT", branding, headerData);

      // === JOB DETAILS BOX ===
      y += 2;
      doc.setFillColor(245, 247, 250);
      doc.roundedRect(margin, y, maxWidth, 24, 2, 2, "F");
      doc.setFontSize(9);
      const col1 = margin + 4;
      const col2 = margin + maxWidth / 2;

      doc.setFont("helvetica", "bold");
      doc.text("Job:", col1, y + 7);
      doc.text("Status:", col2, y + 7);
      doc.text("Priority:", col1, y + 14);
      doc.text("Engineers:", col2, y + 14);
      doc.text("Created:", col1, y + 21);

      doc.setFont("helvetica", "normal");
      doc.text(job.name || "", col1 + 13, y + 7);
      doc.text(job.status || "", col2 + 18, y + 7);
      doc.text(job.priority || "medium", col1 + 20, y + 14);
      doc.text(engineerNames.join(", ") || "Unassigned", col2 + 26, y + 14);
      doc.text(new Date(job.created_at).toLocaleDateString("en-GB"), col1 + 20, y + 21);
      y += 28;

      // === EXECUTIVE SUMMARY (from Servexa reports) ===
      if (reports.length > 0) {
        y = checkPage(25, y);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 64, 175);
        doc.text("Summary of Works", margin, y);
        doc.setTextColor(0, 0, 0);
        y += 8;
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        reports.forEach((r: any) => {
          y = checkPage(15, y);
          doc.setFont("helvetica", "bold");
          doc.text(r.title || "Report", margin, y); y += 6;
          doc.setFont("helvetica", "normal");
          if (r.summary) {
            const lines = doc.splitTextToSize(r.summary, maxWidth);
            lines.forEach((line: string) => { y = checkPage(6, y); doc.text(line, margin, y); y += 5; });
          }
          y += 3;
        });
        y += 4;
      }

      // === VISITS ===
      if (visits.length > 0) {
        y = checkPage(20, y);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 64, 175);
        doc.text("Visit History", margin, y);
        doc.setTextColor(0, 0, 0);
        y += 8;
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        visits.forEach((v: any) => {
          y = checkPage(7, y);
          const statusIcon = v.status === "completed" ? "✓" : v.status === "cancelled" ? "✗" : "○";
          doc.text(`${statusIcon}  ${v.scheduled_date} — ${v.status}${v.notes ? ` — ${v.notes}` : ""}`, margin, y);
          y += 6;
        });
        y += 5;
      }

      // === PARTS & MATERIALS ===
      if (parts.length > 0) {
        y = checkPage(20, y);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 64, 175);
        doc.text("Parts & Materials Used", margin, y);
        doc.setTextColor(0, 0, 0);
        y += 8;

        doc.setFillColor(240, 240, 240);
        doc.rect(margin, y - 4, maxWidth, 8, "F");
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Item", margin + 2, y);
        doc.text("Qty", margin + 100, y);
        doc.text("Unit Cost", margin + 115, y);
        doc.text("Total", margin + 145, y);
        y += 6;
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        parts.forEach((p: any) => {
          y = checkPage(7, y);
          doc.text(p.name, margin + 2, y);
          doc.text(String(p.quantity), margin + 100, y);
          doc.text(`£${Number(p.unit_cost).toFixed(2)}`, margin + 115, y);
          doc.text(`£${Number(p.total_cost).toFixed(2)}`, margin + 145, y);
          y += 6;
        });
        const totalParts = parts.reduce((s: number, p: any) => s + Number(p.total_cost || 0), 0);
        doc.setFont("helvetica", "bold");
        doc.text(`Total: £${totalParts.toFixed(2)}`, margin + 145, y, { align: "left" });
        y += 8;
      }

      // === PHOTOS ===
      if (photoImages.length > 0) {
        y = checkPage(40, y);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 64, 175);
        doc.text(`Site Photos (${photoImages.length})`, margin, y);
        doc.setTextColor(0, 0, 0);
        y += 8;

        const imgW = (maxWidth - 6) / 2;
        const imgH = 45;
        let col = 0;
        for (const photo of photoImages) {
          if (col === 0) y = checkPage(imgH + 10, y);
          const xPos = margin + col * (imgW + 6);
          try {
            doc.addImage(photo.img, "JPEG", xPos, y, imgW, imgH);
          } catch { /* skip bad image */ }
          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");
          doc.text(`${photo.name} — ${photo.date}`, xPos, y + imgH + 3);
          col++;
          if (col >= 2) {
            col = 0;
            y += imgH + 8;
          }
        }
        if (col !== 0) y += imgH + 8;
        y += 4;
      }

      // === RECOMMENDATIONS ===
      y = checkPage(25, y);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 64, 175);
      doc.text("Recommendations & Further Works", margin, y);
      doc.setTextColor(0, 0, 0);
      y += 8;
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");

      const hasRecommendations = job.result || reports.some((r: any) => r.content);
      if (job.result) {
        const resultLines = doc.splitTextToSize(`Result: ${job.result}`, maxWidth);
        resultLines.forEach((line: string) => { y = checkPage(5, y); doc.text(line, margin, y); y += 4; });
        y += 2;
      }
      const notes = submissions.filter((s: any) => s.type === "note" && s.content);
      if (notes.length > 0) {
        notes.slice(0, 5).forEach((n: any) => {
          y = checkPage(10, y);
          const lines = doc.splitTextToSize(`• ${n.content}`, maxWidth);
          lines.forEach((line: string) => { y = checkPage(5, y); doc.text(line, margin, y); y += 4; });
          y += 2;
        });
      }
      if (!hasRecommendations && notes.length === 0) {
        doc.text("No further works recommended at this time.", margin, y);
        y += 6;
      }
      y += 4;

      // === SIGNATURES (shared utility) ===
      if (signatures.length > 0) {
        y = checkPage(30, y);

        const engineerSig = signatures.find((s: any) => s.signer_role === "engineer" || s.signer_role === "admin") || null;
        const customerSig = signatures.find((s: any) => s.signer_role === "customer") || null;

        const sigData: PdfSignatureData = {
          dateStr: new Date(signatures[0]?.created_at || Date.now()).toLocaleDateString("en-GB"),
          technicianName: engineerSig?.signer_name || engineerNames[0] || "",
          customerName: customerSig?.signer_name || customerName,
          sigImages,
          engineerSig,
          customerSig,
        };
        y = renderPdfSignatures(doc, y, sigData);
      }

      // === FOOTER (shared utility) ===
      const footerText = getDefaultFooterText(job.name || "");
      const footerY = doc.internal.pageSize.getHeight() - 18;
      renderPdfFooter(doc, footerY, footerText);

      // === WATERMARK + ACCREDITATIONS ===
      if (watermark) {
        addWatermarkToAllPages(doc, watermark);
      }
      addAccreditationLogosToAllPages(doc, accredLogos, footerY);

      const fileName = `${job.reference_number}-customer-report.pdf`;

      if (onPdfGenerated) {
        const base64 = doc.output("datauristring").split(",")[1];
        onPdfGenerated(base64, fileName);
      } else {
        doc.save(fileName);
      }
      toast({ title: "Report generated", description: `${fileName} ready.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  if (trigger) {
    return <span onClick={generate} className="cursor-pointer">{trigger}</span>;
  }

  return (
    <Button variant="outline" size="sm" onClick={generate} disabled={generating}>
      {generating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileDown className="mr-1.5 h-4 w-4" />}
      {generating ? "Generating..." : "Customer Report"}
    </Button>
  );
}

function extractStoragePath(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl);
    const idx = url.pathname.indexOf("/object/public/submissions/");
    if (idx !== -1) return url.pathname.slice(idx + "/object/public/submissions/".length);
    const idx2 = url.pathname.indexOf("/storage/v1/object/public/submissions/");
    if (idx2 !== -1) return url.pathname.slice(idx2 + "/storage/v1/object/public/submissions/".length);
    return null;
  } catch {
    return null;
  }
}
