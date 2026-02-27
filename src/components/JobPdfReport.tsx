import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import { loadWatermarkImage, addWatermarkToAllPages } from "@/lib/pdfWatermark";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface Props {
  jobId: string;
  job: any;
}

// ── Table drawing helpers ──────────────────────────────────────────

function drawTableRow(
  doc: jsPDF,
  y: number,
  cols: { text: string; x: number; width: number; bold?: boolean; color?: [number, number, number]; align?: "left" | "center" | "right" }[],
  rowHeight: number,
  margin: number,
  totalWidth: number,
  bg?: [number, number, number]
) {
  if (bg) {
    doc.setFillColor(...bg);
    doc.rect(margin, y, totalWidth, rowHeight, "F");
  }
  doc.setDrawColor(200, 200, 200);
  doc.rect(margin, y, totalWidth, rowHeight, "S");
  let xOffset = margin;
  cols.forEach((col) => {
    doc.rect(xOffset, y, col.width, rowHeight, "S");
    doc.setFont("helvetica", col.bold ? "bold" : "normal");
    if (col.color) doc.setTextColor(...col.color);
    else doc.setTextColor(30, 30, 30);
    const textY = y + rowHeight / 2 + 1.5;
    if (col.align === "right") {
      doc.text(col.text, xOffset + col.width - 2, textY, { align: "right" });
    } else if (col.align === "center") {
      doc.text(col.text, xOffset + col.width / 2, textY, { align: "center" });
    } else {
      doc.text(col.text, xOffset + 2, textY);
    }
    doc.setTextColor(30, 30, 30);
    xOffset += col.width;
  });
}

function sectionTitle(doc: jsPDF, title: string, y: number, margin: number, maxWidth: number): number {
  doc.setFillColor(33, 61, 99);
  doc.rect(margin, y, maxWidth, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), margin + 3, y + 6.5);
  doc.setTextColor(30, 30, 30);
  return y + 9;
}

// ── Main component ──────────────────────────────────────────────

export default function JobPdfReport({ jobId, job }: Props) {
  const [generating, setGenerating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [includeCerts, setIncludeCerts] = useState(true);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [includeFieldReports, setIncludeFieldReports] = useState(true);
  const [includeJobSheets, setIncludeJobSheets] = useState(true);
  const { toast } = useToast();

  const generate = async () => {
    setDialogOpen(false);
    setGenerating(true);
    try {
      const [subsRes, reportsRes, visitsRes, partsRes, assignRes, sigRes, siteRes, sheetRespRes, templatesRes] = await Promise.all([
        supabase.from("submissions").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("field_reports").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("job_visits").select("*").eq("job_id", jobId).order("scheduled_date", { ascending: true }),
        supabase.from("job_parts" as any).select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("job_assignments").select("engineer_id").eq("job_id", jobId),
        supabase.from("job_signatures" as any).select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        job.site_id ? supabase.from("sites").select("name, address, postcode, contact_name, contact_phone, contact_email").eq("id", job.site_id).single() : Promise.resolve({ data: null }),
        supabase.from("job_sheet_responses").select("*").eq("job_id", jobId).eq("status", "submitted").order("created_at", { ascending: true }),
        supabase.from("job_sheet_templates").select("*"),
      ]);

      const submissions = subsRes.data || [];
      const reports = reportsRes.data || [];
      const visits = visitsRes.data || [];
      const parts = (partsRes.data as any[]) || [];
      const signatures = (sigRes.data as any[]) || [];
      const site = siteRes.data as any;
      const sheetResponses = (sheetRespRes.data || []) as any[];
      const templates = (templatesRes.data || []) as any[];

      const templateMap: Record<string, any> = {};
      templates.forEach((t: any) => {
        templateMap[t.id] = { ...t, fields: typeof t.fields === "string" ? JSON.parse(t.fields) : t.fields };
      });

      const engIds = [...new Set((assignRes.data || []).map((a: any) => a.engineer_id))];
      let engineerNames: string[] = [];
      let engineerProfileMap: Record<string, string> = {};
      if (engIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", engIds);
        engineerNames = (profiles || []).map((p) => p.full_name || "Unknown");
        (profiles || []).forEach((p) => { engineerProfileMap[p.user_id] = p.full_name || "Unknown"; });
      }

      // Fetch engineer certificates if toggle is on
      let certs: any[] = [];
      if (includeCerts) {
        const { data: certData } = await supabase
          .from("submissions")
          .select("id, file_name, engineer_id, created_at, file_url")
          .eq("job_id", jobId)
          .eq("type", "document")
          .like("file_name", "[Cert]%")
          .order("created_at", { ascending: true });
        certs = (certData || []) as any[];
      }


      // Pre-load photos (only if toggle is on)
      const photos = includePhotos ? submissions.filter((s: any) => s.type === "photo" && s.file_url) : [];
      const photoImages: Record<string, string> = {};
      await Promise.all(photos.map(async (p: any) => {
        try {
          const path = extractPath(p.file_url);
          if (!path) return;
          const { data } = await supabase.storage.from("submissions").createSignedUrl(path, 60);
          if (!data?.signedUrl) return;
          const response = await fetch(data.signedUrl);
          const blob = await response.blob();
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          photoImages[p.id] = dataUrl;
        } catch { /* skip */ }
      }));

      // Pre-load company logo
      let logoDataUrl: string | null = null;
      try {
        const logoResp = await fetch("/images/vivafire-logo-new.jpg");
        const logoBlob = await logoResp.blob();
        logoDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(logoBlob);
        });
      } catch { /* logo unavailable */ }

      const doc = new jsPDF();
      let y = 15;
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 12;
      const maxWidth = pageWidth - margin * 2;
      const rowH = 8;

      const addPage = () => { doc.addPage(); y = 15; };
      const checkPage = (needed: number) => { if (y + needed > 275) addPage(); };

      // ── HEADER (white background, logo then title) ──
      // Logo centred at top
      let logoBottomY = 10;
      if (logoDataUrl) {
        try {
          const tmpImg = new Image();
          tmpImg.crossOrigin = "anonymous";
          await new Promise<void>((resolve, reject) => {
            tmpImg.onload = () => resolve();
            tmpImg.onerror = () => reject();
            tmpImg.src = logoDataUrl!;
          });
          const logoMaxH = 20;
          const logoMaxW = 70;
          const aspect = tmpImg.naturalWidth / tmpImg.naturalHeight;
          let logoW = logoMaxH * aspect;
          let logoH = logoMaxH;
          if (logoW > logoMaxW) { logoW = logoMaxW; logoH = logoW / aspect; }
          const logoX = (pageWidth - logoW) / 2;
          const fmt = logoDataUrl.includes("image/png") ? "PNG" : "JPEG";
          doc.addImage(tmpImg, fmt, logoX, 8, logoW, logoH);
          logoBottomY = 8 + logoH + 3;
        } catch { /* skip logo */ }
      }

      // Title below logo — dark text on white bg
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(33, 61, 99);
      doc.text("JOB REPORT", pageWidth / 2, logoBottomY, { align: "center" });
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(`${job.reference_number}  |  Generated ${new Date().toLocaleDateString("en-GB")}`, pageWidth / 2, logoBottomY + 6, { align: "center" });

      // Separator line
      doc.setDrawColor(33, 61, 99);
      doc.setLineWidth(0.5);
      doc.line(margin, logoBottomY + 8, pageWidth - margin, logoBottomY + 8);

      doc.setTextColor(30, 30, 30);
      y = logoBottomY + 13;

      // ── JOB DETAILS TABLE ──
      doc.setFontSize(11);
      const detailRows: [string, string][] = [
        ["Job Name", job.name || "—"],
        ["Reference", job.reference_number || "—"],
        ["Customer", job.customers?.name || job.customer || "—"],
        ["Address", job.address || "—"],
        ["Category", (job.category || "—").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())],
        ["Job Type", (job.job_type || "—").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())],
        ["Status", (job.status || "—").toUpperCase()],
        ["Priority", (job.priority || "medium").toUpperCase()],
        ["Engineers", engineerNames.length > 0 ? engineerNames.join(", ") : "—"],
      ];

      // Append site details inline
      if (site) {
        if (site.postcode) detailRows.push(["Site Postcode", site.postcode]);
        if (site.contact_name) detailRows.push(["Site Contact", site.contact_name]);
        if (site.contact_phone) detailRows.push(["Contact Phone", site.contact_phone]);
        if (site.contact_email) detailRows.push(["Contact Email", site.contact_email]);
      }

      y = sectionTitle(doc, "Job Details", y, margin, maxWidth);
      const labelW = maxWidth * 0.3;
      const valW = maxWidth * 0.7;
      detailRows.forEach(([label, value]) => {
        checkPage(rowH);
        drawTableRow(doc, y, [
          { text: label, x: margin, width: labelW, bold: true },
          { text: value.substring(0, 90), x: margin + labelW, width: valW },
        ], rowH, margin, maxWidth);
        y += rowH;
      });
      y += 6;

      // ── SITE DETAILS TABLE ──
      if (site) {
        checkPage(30);
        y = sectionTitle(doc, "Site Details", y, margin, maxWidth);
        const siteRows: [string, string][] = [
          ["Site Name", site.name || "—"],
          ["Address", site.address || "—"],
          ["Postcode", site.postcode || "—"],
          ["Contact", site.contact_name || "—"],
          ["Phone", site.contact_phone || "—"],
          ["Email", site.contact_email || "—"],
        ].filter(([, v]) => v !== "—") as [string, string][];
        siteRows.forEach(([label, value]) => {
          checkPage(rowH);
          drawTableRow(doc, y, [
            { text: label, x: margin, width: labelW, bold: true },
            { text: value, x: margin + labelW, width: valW },
          ], rowH, margin, maxWidth);
          y += rowH;
        });
        y += 6;
      }

      // ── VISITS TABLE ──
      if (visits.length > 0) {
        checkPage(20);
        y = sectionTitle(doc, "Visits", y, margin, maxWidth);
        const dateW = maxWidth * 0.25;
        const statusW = maxWidth * 0.2;
        const notesW = maxWidth * 0.55;
        // Header
        drawTableRow(doc, y, [
          { text: "Date", x: margin, width: dateW, bold: true },
          { text: "Status", x: margin + dateW, width: statusW, bold: true },
          { text: "Notes", x: margin + dateW + statusW, width: notesW, bold: true },
        ], rowH, margin, maxWidth, [235, 240, 248]);
        y += rowH;
        visits.forEach((v: any) => {
          checkPage(rowH);
          drawTableRow(doc, y, [
            { text: v.scheduled_date || "—", x: margin, width: dateW },
            { text: (v.status || "—").toUpperCase(), x: margin + dateW, width: statusW },
            { text: (v.notes || "—").substring(0, 60), x: margin + dateW + statusW, width: notesW },
          ], rowH, margin, maxWidth);
          y += rowH;
        });
        y += 6;
      }

      // ── PARTS TABLE ──
      if (parts.length > 0) {
        checkPage(20);
        y = sectionTitle(doc, "Parts & Materials", y, margin, maxWidth);
        const nameW = maxWidth * 0.55;
        const qtyW = maxWidth * 0.1;
        const noteW = maxWidth * 0.35;

        drawTableRow(doc, y, [
          { text: "Part Name", x: margin, width: nameW, bold: true },
          { text: "Qty", x: 0, width: qtyW, bold: true, align: "center" },
          { text: "Notes", x: 0, width: noteW, bold: true },
        ], rowH, margin, maxWidth, [235, 240, 248]);
        y += rowH;
        parts.forEach((p: any) => {
          checkPage(rowH);
          drawTableRow(doc, y, [
            { text: (p.name || "—").substring(0, 40), x: margin, width: nameW },
            { text: String(p.quantity), x: 0, width: qtyW, align: "center" },
            { text: (p.notes || "").substring(0, 30), x: 0, width: noteW },
          ], rowH, margin, maxWidth);
          y += rowH;
        });
        y += 6;
      }

      // ── ENGINEER CERTIFICATES ──
      if (certs.length > 0) {
        checkPage(20);
        y = sectionTitle(doc, "Engineer Certificates", y, margin, maxWidth);

        const certNameW = maxWidth * 0.55;
        const certEngW = maxWidth * 0.25;
        const certDateW = maxWidth * 0.2;

        drawTableRow(doc, y, [
          { text: "Certificate / Document", x: margin, width: certNameW, bold: true },
          { text: "Engineer", x: 0, width: certEngW, bold: true },
          { text: "Attached", x: 0, width: certDateW, bold: true, align: "center" },
        ], rowH, margin, maxWidth, [235, 240, 248]);
        y += rowH;

        let certRowIdx = 0;
        certs.forEach((c: any) => {
          checkPage(rowH);
          const withoutPrefix = (c.file_name || "").replace(/^\[Cert\]\s*/, "");
          const sepIdx = withoutPrefix.lastIndexOf(" — ");
          const certTitle = sepIdx > -1 ? withoutPrefix.slice(0, sepIdx) : withoutPrefix;
          const engName = engineerProfileMap[c.engineer_id] || "Unknown";
          const dateStr = new Date(c.created_at).toLocaleDateString("en-GB");
          const rowBg: [number, number, number] | undefined = certRowIdx % 2 === 0 ? [248, 249, 252] : undefined;
          drawTableRow(doc, y, [
            { text: certTitle.substring(0, 50), x: margin, width: certNameW },
            { text: engName.substring(0, 30), x: 0, width: certEngW },
            { text: dateStr, x: 0, width: certDateW, align: "center" },
          ], rowH, margin, maxWidth, rowBg);
          y += rowH;
          certRowIdx++;
        });
        y += 6;
      }

      // ── JOB SHEET RESPONSES ──
      if (includeJobSheets && sheetResponses.length > 0) {
        for (const resp of sheetResponses) {
          const tpl = templateMap[resp.template_id];
          if (!tpl) continue;

          checkPage(20);
          y = sectionTitle(doc, `Job Sheet: ${tpl.name}`, y, margin, maxWidth);

          const fields = tpl.fields || [];
          const responses = resp.responses || {};
          const sections = [...new Set(fields.map((f: any) => f.section || "General"))] as string[];
          const fieldLabelW = maxWidth * 0.6;
          const fieldValW = maxWidth * 0.4;

          for (const section of sections) {
            const sectionFields = fields.filter((f: any) => (f.section || "General") === section);
            if (sectionFields.length === 0) continue;

            checkPage(12);
            // Sub-section header
            drawTableRow(doc, y, [
              { text: section.toUpperCase(), x: margin, width: maxWidth, bold: true },
            ], rowH, margin, maxWidth, [220, 225, 235]);
            y += rowH;

            let fieldRowIdx = 0;
            for (const field of sectionFields) {
              checkPage(rowH + 4);
              const val = responses[field.id];
              let displayVal = "—";
              let valColor: [number, number, number] | undefined;

              if (field.type === "pass_fail") {
                if (val === "pass") { displayVal = "PASS"; valColor = [0, 128, 0]; }
                else if (val === "fail") { displayVal = "FAIL"; valColor = [200, 0, 0]; }
                else if (val === "n/a") { displayVal = "N/A"; valColor = [120, 120, 120]; }
              } else if (field.type === "checkbox") {
                displayVal = val ? "YES" : "NO";
              } else if (field.type === "photo") {
                displayVal = val ? "✓ Captured" : "—";
              } else if (val !== undefined && val !== null && val !== "") {
                const raw = String(val).substring(0, 60);
                displayVal = raw.charAt(0).toUpperCase() + raw.slice(1);
              }

              const labelText = doc.splitTextToSize(field.label, fieldLabelW - 4).slice(0, 1)[0];
              const rowBg: [number, number, number] | undefined = fieldRowIdx % 2 === 0 ? [248, 249, 252] : undefined;
              drawTableRow(doc, y, [
                { text: labelText, x: margin, width: fieldLabelW },
                { text: displayVal, x: 0, width: fieldValW, bold: !!valColor, color: valColor, align: "center" },
              ], rowH, margin, maxWidth, rowBg);
              fieldRowIdx++;
              y += rowH;

              // Inline note
              const noteVal = responses[`${field.id}_notes`];
              if (noteVal) {
                doc.setFontSize(9);
                doc.setFont("helvetica", "italic");
                doc.setTextColor(100, 100, 100);
                doc.text(`Note: ${noteVal}`.substring(0, 100), margin + 4, y + 3);
                doc.setTextColor(30, 30, 30);
                doc.setFontSize(11);
                doc.setFont("helvetica", "normal");
                y += 5;
              }
            }
          }
          y += 6;
        }
      }

      // ── FIELD REPORTS ──
      if (includeFieldReports && reports.length > 0) {
        checkPage(20);
        y = sectionTitle(doc, "Field Reports", y, margin, maxWidth);
        reports.forEach((r: any) => {
          checkPage(15);
          drawTableRow(doc, y, [
            { text: r.title || "Untitled Report", x: margin, width: maxWidth, bold: true },
          ], rowH, margin, maxWidth, [245, 248, 255]);
          y += rowH;
          if (r.summary) {
            const lines = doc.splitTextToSize(r.summary, maxWidth - 4);
            lines.forEach((line: string) => {
              checkPage(5);
              doc.setFontSize(11);
              doc.setFont("helvetica", "normal");
              doc.text(line, margin + 2, y + 4);
              y += 4;
            });
          }
          y += 4;
        });
        y += 4;
      }

      // ── ENGINEER NOTES ──
      const notes = submissions.filter((s: any) => s.type === "note" && s.content);
      if (notes.length > 0) {
        checkPage(20);
        y = sectionTitle(doc, "Engineer Notes", y, margin, maxWidth);
        const noteDateW = maxWidth * 0.2;
        const noteTextW = maxWidth * 0.8;
        drawTableRow(doc, y, [
          { text: "Date", x: margin, width: noteDateW, bold: true },
          { text: "Note", x: 0, width: noteTextW, bold: true },
        ], rowH, margin, maxWidth, [235, 240, 248]);
        y += rowH;
        notes.forEach((n: any) => {
          checkPage(rowH);
          drawTableRow(doc, y, [
            { text: new Date(n.created_at).toLocaleDateString("en-GB"), x: margin, width: noteDateW },
            { text: (n.content || "").substring(0, 80), x: 0, width: noteTextW },
          ], rowH, margin, maxWidth);
          y += rowH;
        });
        y += 6;
      }

      // ── PHOTOS ──
      if (photos.length > 0) {
        checkPage(20);
        y = sectionTitle(doc, `Photos (${photos.length})`, y, margin, maxWidth);
        for (const p of photos) {
          const dataUrl = photoImages[p.id];
          if (dataUrl) {
            checkPage(60);
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 100, 100);
            doc.text(`${p.file_name || "Photo"} — ${new Date(p.created_at).toLocaleDateString("en-GB")}`, margin, y + 3);
            doc.setTextColor(30, 30, 30);
            y += 5;
            try {
              doc.addImage(dataUrl, "JPEG", margin, y, 60, 45);
              y += 50;
            } catch {
              doc.text("[Image could not be embedded]", margin, y + 3);
              y += 6;
            }
          } else {
            checkPage(rowH);
            doc.setFontSize(11);
            doc.text(`• ${p.file_name} — ${new Date(p.created_at).toLocaleDateString("en-GB")}`, margin, y + 4);
            y += rowH;
          }
        }
        y += 4;
      }

      // ── SIGNATURES ──
      if (signatures.length > 0) {
        checkPage(30);
        y = sectionTitle(doc, "Sign-Off Signatures", y, margin, maxWidth);
        for (const sig of signatures) {
          checkPage(40);
          drawTableRow(doc, y, [
            { text: `${sig.signer_name} (${sig.signer_role})`, x: margin, width: maxWidth * 0.6, bold: true },
            { text: new Date(sig.created_at).toLocaleDateString("en-GB"), x: 0, width: maxWidth * 0.4, align: "right" },
          ], rowH, margin, maxWidth, [245, 248, 255]);
          y += rowH + 2;
          try {
            const { data: urlData } = await supabase.storage.from("signatures").createSignedUrl(sig.file_path, 60);
            if (urlData?.signedUrl) {
              const response = await fetch(urlData.signedUrl);
              const blob = await response.blob();
              const dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              doc.addImage(dataUrl, "PNG", margin, y, 55, 18);
              y += 22;
            }
          } catch {
            doc.text("[Signature unavailable]", margin, y + 3);
            y += 6;
          }
          y += 4;
        }
      }

      // ── DECLARATION FOOTER (dry riser pressure test) ──
      const hasPressureTest = (job.category || "").toLowerCase().includes("dry riser") ||
        templates.some((t: any) => (t.name || "").toLowerCase().includes("pressure") && sheetResponses.some((r: any) => r.template_id === t.id));
      const hasVisual = templates.some((t: any) => (t.name || "").toLowerCase().includes("visual") && sheetResponses.some((r: any) => r.template_id === t.id));

      if (hasPressureTest || hasVisual) {
        checkPage(20);
        y += 4;
        doc.setDrawColor(0);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 30, 30);

        if (hasVisual) {
          doc.rect(margin, y, maxWidth, 12);
          doc.text("We have, today, carried out a visual check of the system", pageWidth / 2, y + 4.5, { align: "center" });
          doc.text("to the requirements of BS 9990:2015", pageWidth / 2, y + 9, { align: "center" });
          y += 14;
        }
      }

      // ── WATERMARK on every page ──
      const watermark = await loadWatermarkImage();
      if (watermark) addWatermarkToAllPages(doc, watermark);

      // ── FOOTER on every page ──
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150, 150, 150);
        doc.text(`${job.reference_number}  —  Page ${i} of ${pageCount}`, pageWidth / 2, 290, { align: "center" });
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, 286, pageWidth - margin, 286);
      }


      doc.save(`${job.reference_number}-report.pdf`);
      toast({ title: "PDF generated", description: `${job.reference_number}-report.pdf downloaded.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)} disabled={generating}>
        {generating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileDown className="mr-1.5 h-4 w-4" />}
        {generating ? "Generating..." : "Export PDF Report"}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Export PDF Report</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            {[
              { id: "include-photos", label: "Include Photos", desc: "Embed submitted photos in the report", checked: includePhotos, onChange: setIncludePhotos },
              { id: "include-field-reports", label: "Include Field Reports", desc: "Append field report summaries", checked: includeFieldReports, onChange: setIncludeFieldReports },
              { id: "include-job-sheets", label: "Include Job Sheet Responses", desc: "Include submitted job sheet form data", checked: includeJobSheets, onChange: setIncludeJobSheets },
              { id: "include-certs", label: "Include Engineer Certificates", desc: "Attach the certificates table to the report", checked: includeCerts, onChange: setIncludeCerts },
            ].map(({ id, label, desc, checked, onChange }) => (
              <div key={id} className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <Switch id={id} checked={checked} onCheckedChange={onChange} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={generate} disabled={generating}>
              {generating ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Generating...</> : <><FileDown className="mr-1.5 h-4 w-4" /> Generate PDF</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function extractPath(fileUrl: string): string | null {
  if (!fileUrl) return null;
  const match = fileUrl.match(/\/object\/(?:public|sign)\/submissions\/(.+?)(?:\?|$)/);
  if (match) return match[1];
  if (!fileUrl.startsWith("http")) return fileUrl;
  return null;
}
