import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";

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
      const [subsRes, reportsRes, visitsRes, partsRes, assignRes, sigRes, sheetsRes] = await Promise.all([
        supabase.from("submissions").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("field_reports").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("job_visits").select("*").eq("job_id", jobId).order("scheduled_date", { ascending: true }),
        supabase.from("job_parts").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("job_assignments").select("engineer_id").eq("job_id", jobId),
        supabase.from("job_signatures").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("job_sheet_responses").select("*").eq("job_id", jobId).eq("status", "submitted"),
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

      // Pre-load photo images (before/after)
      const photos = submissions.filter((s: any) => s.type === "photo" && s.file_url);
      const photoImages: { img: HTMLImageElement; name: string; date: string }[] = [];
      const maxPhotos = 8; // Limit photos in report
      for (const photo of photos.slice(0, maxPhotos)) {
        try {
          const path = extractStoragePath(photo.file_url);
          if (!path) continue;
          const { data } = await supabase.storage.from("submissions").createSignedUrl(path, 3600);
          if (!data?.signedUrl) continue;
          const img = new Image();
          img.crossOrigin = "anonymous";
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject();
            img.src = data.signedUrl;
          });
          photoImages.push({ img, name: photo.file_name || "Photo", date: new Date(photo.created_at).toLocaleDateString("en-GB") });
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
      let y = 20;
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      const maxWidth = pageWidth - margin * 2;

      const addPage = () => { doc.addPage(); y = 20; };
      const checkPage = (needed: number) => { if (y + needed > 270) addPage(); };

      // === BRANDED HEADER (white background, logo centred) ===
      let logoImg: HTMLImageElement | null = null;
      try {
        logoImg = new Image();
        logoImg.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          logoImg!.onload = () => resolve();
          logoImg!.onerror = () => reject();
          logoImg!.src = "/images/vivafire-logo-new.jpg";
        });
      } catch { logoImg = null; }

      let headerBottomY = 10;
      if (logoImg) {
        const logoMaxH = 20;
        const logoMaxW = 70;
        const aspect = logoImg.naturalWidth / logoImg.naturalHeight;
        let lw = logoMaxH * aspect;
        let lh = logoMaxH;
        if (lw > logoMaxW) { lw = logoMaxW; lh = lw / aspect; }
        doc.addImage(logoImg, "JPEG", (pageWidth - lw) / 2, 8, lw, lh);
        headerBottomY = 8 + lh + 3;
      }

      // Title below logo
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(33, 61, 99);
      doc.text("CUSTOMER REPORT", pageWidth / 2, headerBottomY, { align: "center" });
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated: ${new Date().toLocaleDateString("en-GB")}`, pageWidth / 2, headerBottomY + 6, { align: "center" });

      // Separator line
      doc.setDrawColor(33, 61, 99);
      doc.setLineWidth(0.5);
      doc.line(margin, headerBottomY + 8, pageWidth - margin, headerBottomY + 8);

      doc.setTextColor(0, 0, 0);
      y = headerBottomY + 13;

      // === JOB DETAILS BOX ===
      doc.setFillColor(245, 247, 250);
      doc.roundedRect(margin, y, maxWidth, 36, 2, 2, "F");
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      const col1 = margin + 4;
      const col2 = margin + maxWidth / 2;
      doc.text("Reference:", col1, y + 8);
      doc.text("Job:", col1, y + 16);
      doc.text("Customer:", col1, y + 24);
      doc.text("Address:", col1, y + 32);
      doc.text("Status:", col2, y + 8);
      doc.text("Priority:", col2, y + 16);
      doc.text("Engineers:", col2, y + 24);
      doc.text("Date:", col2, y + 32);

      doc.setFont("helvetica", "normal");
      doc.text(job.reference_number || "", col1 + 26, y + 8);
      doc.text(job.name || "", col1 + 13, y + 16);
      doc.text(job.customers?.name || job.customer || "N/A", col1 + 26, y + 24);
      const addrLines = doc.splitTextToSize(job.address || "N/A", maxWidth / 2 - 32);
      doc.text(addrLines[0] || "", col1 + 22, y + 32);
      doc.text(job.status || "", col2 + 18, y + 8);
      doc.text(job.priority || "medium", col2 + 20, y + 16);
      doc.text(engineerNames.join(", ") || "Unassigned", col2 + 26, y + 24);
      doc.text(new Date(job.created_at).toLocaleDateString("en-GB"), col2 + 16, y + 32);
      y += 42;

      // === EXECUTIVE SUMMARY (from field reports) ===
      if (reports.length > 0) {
        checkPage(25);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 64, 175);
        doc.text("Summary of Works", margin, y);
        doc.setTextColor(0, 0, 0);
        y += 8;
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        reports.forEach((r: any) => {
          checkPage(15);
          doc.setFont("helvetica", "bold");
          doc.text(r.title || "Report", margin, y); y += 6;
          doc.setFont("helvetica", "normal");
          if (r.summary) {
            const lines = doc.splitTextToSize(r.summary, maxWidth);
            lines.forEach((line: string) => { checkPage(6); doc.text(line, margin, y); y += 5; });
          }
          y += 3;
        });
        y += 4;
      }

      // === VISITS ===
      if (visits.length > 0) {
        checkPage(20);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 64, 175);
        doc.text("Visit History", margin, y);
        doc.setTextColor(0, 0, 0);
        y += 8;
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        visits.forEach((v: any) => {
          checkPage(7);
          const statusIcon = v.status === "completed" ? "✓" : v.status === "cancelled" ? "✗" : "○";
          doc.text(`${statusIcon}  ${v.scheduled_date} — ${v.status}${v.notes ? ` — ${v.notes}` : ""}`, margin, y);
          y += 6;
        });
        y += 5;
      }

      // === PARTS & MATERIALS ===
      if (parts.length > 0) {
        checkPage(20);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 64, 175);
        doc.text("Parts & Materials Used", margin, y);
        doc.setTextColor(0, 0, 0);
        y += 8;

        // Table header
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
          checkPage(7);
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

      // === PHOTOS (Before/After) ===
      if (photoImages.length > 0) {
        checkPage(40);
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
          if (col === 0) checkPage(imgH + 10);
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

      // === RECOMMENDATIONS / FURTHER WORKS ===
      checkPage(25);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 64, 175);
      doc.text("Recommendations & Further Works", margin, y);
      doc.setTextColor(0, 0, 0);
      y += 8;
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");

      // Pull recommendations from field reports or job result
      const hasRecommendations = job.result || reports.some((r: any) => r.content);
      if (job.result) {
        const resultLines = doc.splitTextToSize(`Result: ${job.result}`, maxWidth);
        resultLines.forEach((line: string) => { checkPage(5); doc.text(line, margin, y); y += 4; });
        y += 2;
      }
      // Engineer notes as recommendations
      const notes = submissions.filter((s: any) => s.type === "note" && s.content);
      if (notes.length > 0) {
        notes.slice(0, 5).forEach((n: any) => {
          checkPage(10);
          const lines = doc.splitTextToSize(`• ${n.content}`, maxWidth);
          lines.forEach((line: string) => { checkPage(5); doc.text(line, margin, y); y += 4; });
          y += 2;
        });
      }
      if (!hasRecommendations && notes.length === 0) {
        doc.text("No further works recommended at this time.", margin, y);
        y += 6;
      }
      y += 4;

      // === SIGNATURES ===
      if (signatures.length > 0) {
        checkPage(40);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 64, 175);
        doc.text("Sign-Off", margin, y);
        doc.setTextColor(0, 0, 0);
        y += 8;

        for (const sig of signatures) {
          checkPage(35);
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text(`${sig.signer_name} (${sig.signer_role})`, margin, y);
          doc.setFont("helvetica", "normal");
          doc.text(new Date(sig.created_at).toLocaleDateString("en-GB"), margin + 80, y);
          y += 4;
          if (sigImages[sig.id]) {
            doc.addImage(sigImages[sig.id], "PNG", margin, y, 50, 16);
            y += 20;
          } else {
            doc.line(margin, y + 2, margin + 60, y + 2);
            y += 8;
          }
        }
      }

      // === FOOTER (clean line style) ===
      const footerY = 280;
      doc.setDrawColor(33, 61, 99);
      doc.setLineWidth(0.5);
      doc.line(margin, footerY, pageWidth - margin, footerY);
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("VivaFire — Wet & Dry Riser Specialists", margin, footerY + 4);
      doc.text("This report has been generated automatically from verified field data.", margin, footerY + 8);
      doc.text(`Report ref: ${job.reference_number} | ${new Date().toLocaleDateString("en-GB")}`, pageWidth - margin, footerY + 4, { align: "right" });
      doc.setTextColor(0, 0, 0);

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
