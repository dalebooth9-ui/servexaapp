import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import { renderPdfHeader, type PdfHeaderData, type PdfBranding } from "@/lib/pdfHeader";
import { renderPdfSignatures, renderPdfFooter, getDefaultFooterText, type PdfSignatureData } from "@/lib/pdfFooter";
import { loadWatermarkImage } from "@/lib/pdfWatermark";
import { renderBrandingOverlay } from "@/lib/pdfBranding";
import { resolveDocumentBrandingProfile } from "@/lib/documentBrandingProfile";
import { fetchCustomerAccreditationLogos, loadAccreditationLogos } from "@/lib/pdfAccreditations";
import { PDF_PALETTE } from "@/lib/pdfPalette";
import { PDF_DIMENSIONS } from "@/lib/pdfDimensions";
import { collectEmbeddedPhotoPaths, fetchJobPhotoMeta, loadJobPhotosForPdf } from "@/lib/jobPhotos";
import { loadPrefs, resolvePhotoSelection } from "@/lib/exportBundleSelection";
import {
  loadEngineerSignatureLibrary,
  findEngineerSignatureByName,
} from "@/lib/engineerSignatureLibrary";
import PdfPreviewDialog from "@/components/PdfPreviewDialog";


interface Props {
  jobId: string;
  job: any;
  onPdfGenerated?: (pdfBase64: string, fileName: string) => void;
  trigger?: React.ReactNode;
}

export default function CustomerReportPdf({ jobId, job, onPdfGenerated, trigger }: Props) {
  const [generating, setGenerating] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewName, setPreviewName] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const { toast } = useToast();

  const generate = async () => {
    setGenerating(true);
    try {
      const custAccredUrls = await fetchCustomerAccreditationLogos(job.customers?.name || job.customer);
      const [subsRes, reportsRes, visitsRes, partsRes, assignRes, sigRes, sheetsRes, watermark, accredLogos] = await Promise.all([
        supabase.from("submissions").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("field_reports").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("job_visits").select("*").eq("job_id", jobId).order("scheduled_date", { ascending: true }),
        supabase.from("job_parts").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("job_assignments").select("engineer_id").eq("job_id", jobId),
        supabase.from("job_signatures").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("job_sheet_responses").select("responses").eq("job_id", jobId).eq("status", "submitted"),
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

      // Load and compress job photos through the shared loader so the
      // Photos tab and every PDF variant agree on what a job's photos are.
      // Excludes photos already embedded inside submitted job-sheet responses.
      const embeddedPaths = collectEmbeddedPhotoPaths((sheetsRes.data || []) as any[], jobId);
      // Honour the user's Export-dialog selections for this job when present;
      // otherwise apply the same smart defaults (scanned working sheets and
      // still-to-review email attachments excluded).
      const savedPrefs = loadPrefs(jobId) ?? { v: 1 as const, photoMode: "auto" as const, photoIds: [], sheetIds: [], includeFilledSheets: true, includePhotos: true, includeFieldReports: true, includeCerts: true };
      const meta = await fetchJobPhotoMeta(jobId);
      const includeIds = resolvePhotoSelection(meta, savedPrefs);
      const loaded = await loadJobPhotosForPdf({ jobId, excludePaths: embeddedPaths, includeIds });
      type PhotoEntry = {
        dataUrl: string;
        format: "JPEG" | "PNG";
        natW: number;
        natH: number;
        name: string;
        date: string;
        caption: string;
        engineer: string;
      };
      const photoImages: PhotoEntry[] = loaded.map((p) => {
        const ts = new Date(p.createdAt);
        return {
          dataUrl: p.dataUrl,
          format: "JPEG" as const,
          natW: p.natW,
          natH: p.natH,
          name: p.fileName,
          date: `${ts.toLocaleDateString("en-GB")} ${ts.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
          caption: p.caption,
          engineer: p.engineerName,
        };
      });
      console.log("[CustomerReportPdf] photos", {
        loaded: photoImages.length,
        excluded: embeddedPaths.size,
        totalKB: Math.round(loaded.reduce((s, p) => s + p.bytes, 0) / 1024),
      });



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
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      const maxWidth = pageWidth - margin * 2;

      // Reserve the footer zone so body content never runs into the
      // accreditation logo strip or the declaration footer. Mirrors the
      // numbers used by renderBrandingOverlay + renderPdfFooter below.
      const FOOTER_BAND_H = 18;
      const ACCRED_LOGO_H = 12;
      const ACCRED_GAP = 3;
      const footerY = pageHeight - FOOTER_BAND_H;
      // Body content must end above the accreditation strip (with a 2mm buffer)
      const CONTENT_BOTTOM = footerY - ACCRED_LOGO_H - ACCRED_GAP - 2;

      const addPage = () => { doc.addPage(); };
      const checkPage = (needed: number, currentY: number): number => {
        if (currentY + needed > CONTENT_BOTTOM) { addPage(); return 20; }
        return currentY;
      };

      // === SHARED HEADER ===
      const customerName = job.customers?.name || job.customer || "N/A";
      const siteName = job.sites?.name || "";
      const siteAddress = job.sites?.address || job.address || "";
      const refNumber = job.reference_number || "";
      const dateVal = new Date().toLocaleDateString("en-GB");

      // Resolve what3words: prefer the site's stored ///words (set on first
      // engineer sign-off, or manually by admin) so every report for the
      // site shows the same location. Fall back to address geocoding.
      let w3wAddress: string | undefined = (job.sites as any)?.what3words || undefined;
      if (!w3wAddress && (job as any)?.site_id) {
        try {
          const { data: siteRow } = await supabase
            .from("sites")
            .select("what3words")
            .eq("id", (job as any).site_id)
            .maybeSingle();
          if ((siteRow as any)?.what3words) w3wAddress = (siteRow as any).what3words;
        } catch { /* skip */ }
      }
      if (!w3wAddress && siteAddress) {
        try {
          const { data: w3wData } = await supabase.functions.invoke("w3w-convert", {
            body: { address: siteAddress },
          });
          if (w3wData?.words) w3wAddress = w3wData.words as string;
        } catch { /* skip */ }
      }

      // Resolve unified branding profile — header logo and watermark tint
      // both derive from the same source (template branding > customer logo > default).
      const brandProfile = await resolveDocumentBrandingProfile({
        template: null,
        customer: { name: job.customers?.name, logo_url: job.customers?.logo_url },
      });
      const branding: PdfBranding = {
        logo_url: brandProfile.logoUrl,
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
      doc.setFontSize(9);
      const col1 = margin + 4;
      const col2 = margin + maxWidth / 2;
      // Wrap job.name within the left column so long titles don't overflow the box/page.
      const jobNameMaxW = (col2 - col1) - 15;
      const jobNameLines = doc.splitTextToSize(job.name || "", jobNameMaxW) as string[];
      const jobNameExtra = Math.max(0, jobNameLines.length - 1) * 4;
      const boxH = 24 + jobNameExtra;

      doc.setFillColor(...PDF_PALETTE.zebra);
      doc.roundedRect(margin, y, maxWidth, boxH, 2, 2, "F");

      doc.setFont("helvetica", "bold");
      doc.text("Job:", col1, y + 7);
      doc.text("Status:", col2, y + 7);
      doc.text("Priority:", col1, y + 14 + jobNameExtra);
      doc.text("Engineers:", col2, y + 14 + jobNameExtra);
      doc.text("Created:", col1, y + 21 + jobNameExtra);

      doc.setFont("helvetica", "normal");
      jobNameLines.forEach((ln, i) => doc.text(ln, col1 + 13, y + 7 + i * 4));
      doc.text(job.status || "", col2 + 18, y + 7);
      doc.text(job.priority || "medium", col1 + 20, y + 14 + jobNameExtra);
      doc.text(engineerNames.join(", ") || "Unassigned", col2 + 26, y + 14 + jobNameExtra);
      doc.text(new Date(job.created_at).toLocaleDateString("en-GB"), col1 + 20, y + 21 + jobNameExtra);
      y += boxH + 4;

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
          const statusIcon = v.status === "completed" ? "✓" : v.status === "cancelled" ? "✗" : "○";
          const line = `${statusIcon}  ${v.scheduled_date} — ${v.status}${v.notes ? ` — ${v.notes}` : ""}`;
          const wrapped = doc.splitTextToSize(line, maxWidth) as string[];
          y = checkPage(wrapped.length * 5 + 2, y);
          wrapped.forEach((ln) => { doc.text(ln, margin, y); y += 5; });
          y += 1;
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

        doc.setFillColor(...PDF_PALETTE.headerStrip);
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
          const nameW = 100 - margin - 2 - 2; // space between margin+2 and margin+100
          const nameLines = doc.splitTextToSize(String(p.name || ""), nameW) as string[];
          const rowH = Math.max(6, nameLines.length * 5 + 1);
          y = checkPage(rowH, y);
          nameLines.forEach((ln, i) => doc.text(ln, margin + 2, y + i * 5));
          doc.text(String(p.quantity), margin + 100, y);
          doc.text(`£${Number(p.unit_cost).toFixed(2)}`, margin + 115, y);
          doc.text(`£${Number(p.total_cost).toFixed(2)}`, margin + 145, y);
          y += rowH;
        });
        const totalParts = parts.reduce((s: number, p: any) => s + Number(p.total_cost || 0), 0);
        doc.setFont("helvetica", "bold");
        doc.text(`Total: £${totalParts.toFixed(2)}`, margin + 145, y, { align: "left" });
        y += 8;
      }

      // === PHOTO INDEX (table of figures) ===
      // We reserve an index page first, capture each figure's page/y as it's
      // drawn, then come back and fill the index with clickable links.
      type FigureRef = { no: number; name: string; caption: string; page: number; y: number };
      const figureRefs: FigureRef[] = [];
      let indexPageNo = -1;
      let indexStartY = 0;
      if (photoImages.length > 0) {
        addPage();
        indexPageNo = doc.getNumberOfPages();
        let iy = await renderPdfHeader(doc, "CUSTOMER REPORT", branding, headerData);
        iy += 4;
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 64, 175);
        doc.text(`Photo Index (${photoImages.length})`, margin, iy);
        doc.setTextColor(0, 0, 0);
        iy += 8;
        indexStartY = iy;
        // Reset y so the photos section starts on a new page
        addPage();
        y = 20;
      }

      // === PHOTOS — quality-preserved, aspect-correct, captioned ===
      if (photoImages.length > 0) {
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 64, 175);
        doc.text(`Site Photos (${photoImages.length})`, margin, y);
        doc.setTextColor(0, 0, 0);
        y += 8;

        const gap = 6;
        const cellW = (maxWidth - gap) / 2;     // 2-column grid
        const cellH = 55;                        // image cell height (mm)
        const captionH = 12;                     // 2 caption lines
        const blockH = cellH + captionH + 4;     // total per photo

        let col = 0;
        let figureNo = 0;
        for (const photo of photoImages) {
          figureNo++;
          if (col === 0) y = checkPage(blockH, y);
          const xPos = margin + col * (cellW + gap);
          // Record this figure's location for the index
          figureRefs.push({
            no: figureNo,
            name: photo.name,
            caption: photo.caption,
            page: doc.getNumberOfPages(),
            y,
          });

          // Background cell (lets letterboxed images sit on a neutral surface)
          doc.setFillColor(...PDF_PALETTE.zebra);
          doc.setDrawColor(...PDF_PALETTE.borderSoft);
          doc.setLineWidth(0.2);
          doc.rect(xPos, y, cellW, cellH, "FD");

          // Aspect-ratio-correct fit: contain within the cell, never upscale beyond
          // the cell, never stretch. Centre inside the cell.
          const ratio = photo.natW / photo.natH;
          let drawW = cellW - 2;
          let drawH = drawW / ratio;
          if (drawH > cellH - 2) {
            drawH = cellH - 2;
            drawW = drawH * ratio;
          }
          const ix = xPos + (cellW - drawW) / 2;
          const iy = y + (cellH - drawH) / 2;

          try {
            // compression: "NONE" preserves the original bytes (no jsPDF re-encoding).
            doc.addImage(photo.dataUrl, photo.format, ix, iy, drawW, drawH, undefined, "NONE");
          } catch { /* skip bad image */ }

          // Caption — figure number, file name, date, optional user note
          doc.setTextColor(40, 40, 40);
          doc.setFontSize(8.5);
          doc.setFont("helvetica", "bold");
          const head = `Fig. ${figureNo} — ${photo.name}`;
          const headLines = doc.splitTextToSize(head, cellW);
          doc.text(headLines[0], xPos, y + cellH + 4);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(110, 110, 110);
          const metaBits = [photo.engineer, photo.date, photo.caption].filter(Boolean);
          const meta = metaBits.join("  ·  ");
          const metaLines = doc.splitTextToSize(meta, cellW);
          doc.text(metaLines.slice(0, 1)[0] || "", xPos, y + cellH + 8);
          doc.setTextColor(0, 0, 0);

          col++;
          if (col >= 2) {
            col = 0;
            y += blockH;
          }
        }
        if (col !== 0) y += blockH;
        y += 4;
      }

      // === FILL PHOTO INDEX (now that figure positions are known) ===
      if (indexPageNo > 0 && figureRefs.length > 0) {
        const totalPages = doc.getNumberOfPages();
        doc.setPage(indexPageNo);
        let iy = indexStartY;
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(90, 90, 90);
        doc.text("Fig.", margin, iy);
        doc.text("Caption", margin + 14, iy);
        doc.text("Page", pageWidth - margin - 12, iy);
        iy += 2;
        doc.setDrawColor(220, 224, 230);
        doc.line(margin, iy, pageWidth - margin, iy);
        iy += 5;
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);

        for (const f of figureRefs) {
          if (iy > CONTENT_BOTTOM) break;
          const captionTxt = f.caption ? `${f.name} — ${f.caption}` : f.name;
          const lines = doc.splitTextToSize(captionTxt, pageWidth - margin * 2 - 14 - 18);
          const rowH = Math.max(6, lines.length * 4.5);

          doc.setTextColor(30, 64, 175);
          doc.textWithLink(`${f.no}`, margin, iy, { pageNumber: f.page });
          doc.textWithLink(lines[0], margin + 14, iy, { pageNumber: f.page });
          for (let li = 1; li < lines.length; li++) {
            doc.text(lines[li], margin + 14, iy + li * 4.5);
          }
          doc.textWithLink(`${f.page}`, pageWidth - margin - 12, iy, { pageNumber: f.page });
          doc.setTextColor(0, 0, 0);
          iy += rowH + 2;
        }
        doc.setPage(totalPages);
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
      // Resolve the technician name from job_sheet_responses (paper scans
      // populate this), falling back to assigned engineer names.
      const sheetRows = (sheetsRes.data as any[]) || [];
      const technicianFromSheet = sheetRows
        .map((row: any) => (row?.responses?.technician_name || "").toString().trim())
        .find((v: string) => v.length > 0);
      const technicianName = technicianFromSheet || engineerNames[0] || "";

      // Auto-fill technician signature from the stored engineer-signature
      // library when we don't already have one attached to the job.
      let engineerSig =
        signatures.find(
          (s: any) => s.signer_role === "engineer" || s.signer_role === "admin",
        ) || null;
      const customerSig =
        signatures.find((s: any) => s.signer_role === "customer") || null;

      const hasEngineerImage = engineerSig && engineerSig.file_path && sigImages[engineerSig.id];
      if (!hasEngineerImage && technicianName) {
        try {
          const library = await loadEngineerSignatureLibrary();
          const match = findEngineerSignatureByName(library, technicianName);
          if (match?.file_path) {
            const { data: signed } = await supabase.storage
              .from("signatures")
              .createSignedUrl(match.file_path, 3600);
            if (signed?.signedUrl) {
              const img = new Image();
              img.crossOrigin = "anonymous";
              await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject();
                img.src = signed.signedUrl;
              });
              const synthId = `library-${match.id}`;
              sigImages[synthId] = img;
              engineerSig = {
                id: synthId,
                signer_name: technicianName,
                signer_role: "engineer",
                signer_position: null,
                created_at: undefined,
                file_path: match.file_path,
              } as any;
            }
          }
        } catch (e) {
          console.warn("engineer signature library lookup failed", e);
        }
      }

      const shouldRenderSigs =
        signatures.length > 0 || engineerSig || customerSig;
      if (shouldRenderSigs) {
        y = checkPage(30, y);
        const sigData: PdfSignatureData = {
          dateStr: new Date(
            signatures[0]?.created_at || job.completed_at || Date.now(),
          ).toLocaleDateString("en-GB"),
          technicianName: engineerSig?.signer_name || technicianName,
          customerName: customerSig?.signer_name || customerName,
          sigImages,
          engineerSig,
          customerSig,
        };
        y = renderPdfSignatures(doc, y, sigData);
      }


      // === FOOTER (shared utility) ===
      const footerText = getDefaultFooterText(job.name || "");
      renderPdfFooter(doc, footerY, footerText);

      // === WATERMARK + ACCREDITATIONS (unified overlay) ===
      await renderBrandingOverlay(doc, {
        watermark,
        brandColor: brandProfile.accentColor,
        accredLogos,
        accredFooterY: footerY,
        accredLogoH: PDF_DIMENSIONS.accredLogoH,
      });

      const fileName = `${job.reference_number}-customer-report.pdf`;

      if (onPdfGenerated) {
        const base64 = doc.output("datauristring").split(",")[1];
        onPdfGenerated(base64, fileName);
        toast({ title: "Report generated", description: `${fileName} ready.` });
      } else {
        const blob = doc.output("blob");
        setPreviewBlob(blob);
        setPreviewName(fileName);
        setPreviewOpen(true);
        toast({ title: "Report ready", description: `${fileName} — preview opened.` });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };


  const previewDialog = (
    <PdfPreviewDialog
      open={previewOpen}
      onOpenChange={setPreviewOpen}
      blob={previewBlob}
      fileName={previewName}
      title={`${job?.reference_number || "Job"} — Customer report`}
    />
  );

  if (trigger) {
    return (
      <>
        <span onClick={generate} className="cursor-pointer">{trigger}</span>
        {previewDialog}
      </>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={generate} disabled={generating}>
        {generating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileDown className="mr-1.5 h-4 w-4" />}
        {generating ? "Generating..." : "Customer Report"}
      </Button>
      {previewDialog}
    </>
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
