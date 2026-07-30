import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PDF_PALETTE, brandedNavy, brandedNavyText, type RGB } from "@/lib/pdfPalette";
import { resolveDocumentBrandingProfile } from "@/lib/documentBrandingProfile";
import { loadWatermarkImage } from "@/lib/pdfWatermark";
import { fetchCustomerAccreditationLogos, loadAccreditationLogos } from "@/lib/pdfAccreditations";
import { renderBrandingOverlay, type WatermarkOverride } from "@/lib/pdfBranding";
import { getGeneratingOrgBranding } from "@/lib/generatingOrgBranding";

export interface BrandedRamsData {
  job_reference?: string | null;
  job_name?: string | null;
  site_name?: string | null;
  site_address?: string | null;
  client_name?: string | null;
  works_description?: string | null;
  factors?: Record<string, boolean>;
  risk_assessment?: Array<{
    hazard: string;
    who_at_risk: string;
    initial_risk_rating: string;
    control_measures: string;
    residual_risk_rating: string;
  }>;
  method_statement?: {
    sequence?: string[];
    ppe?: string[];
    plant_equipment?: string[];
    emergency_arrangements?: string;
    welfare_arrangements?: string;
  };
  status?: string;
  version?: number;
  prepared_by?: string | null;
  prepared_at?: string | null;
  reviewed_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  /** Optional per-export watermark override (from the PDF preview dialog). */
  watermarkOverride?: WatermarkOverride | null;
}

const FACTOR_LABELS: Record<string, string> = {
  working_at_height: "Working at height",
  hot_works: "Hot works",
  confined_space: "Confined space",
  asbestos_present: "Asbestos present",
  asbestos: "Asbestos present",
  live_systems: "Live / energised systems",
  occupied_building: "Occupied / public building",
  public_occupied: "Occupied / public building",
  lone_working: "Lone working",
  manual_handling: "Manual handling",
};

/** Traffic-light fills for risk ratings — semantic, intentionally not brand blue. */
function ratingFill(rating: string): RGB | undefined {
  const r = (rating || "").toLowerCase();
  if (r.includes("high")) return [254, 226, 226];
  if (r.includes("med")) return [254, 243, 199];
  if (r.includes("low")) return [220, 252, 231];
  return undefined;
}

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-GB") : "—");

export async function generateBrandedRamsPdf(data: BrandedRamsData): Promise<{ blob: Blob; fileName: string }> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;

  // ── Shared branding resolution (org-aware; same source as report PDFs) ──
  const profile = await resolveDocumentBrandingProfile({
    customer: { name: data.client_name ?? undefined },
  });
  const org = await getGeneratingOrgBranding();
  const navy: RGB = brandedNavy(
    profile.isCustomerBranded ? { primary: profile.accentColor as RGB } : undefined,
  );
  const navyText: RGB = brandedNavyText();
  const ink: RGB = PDF_PALETTE.ink as unknown as RGB;

  const headerName = (profile.companyName || org.name || "").toUpperCase();

  // ── HEADER ──
  let headerBottom = margin;
  if (profile.logoImage) {
    const img = profile.logoImage;
    const maxW = 150;
    const maxH = 46;
    const ratio = img.naturalWidth / img.naturalHeight || 3;
    let w = maxW;
    let h = w / ratio;
    if (h > maxH) { h = maxH; w = h * ratio; }
    try { doc.addImage(img, "PNG", margin, margin, w, h); } catch { /* ignore */ }
    headerBottom = margin + h;
  } else if (headerName) {
    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(headerName, margin, margin + 18);
    headerBottom = margin + 26;
  }

  doc.setTextColor(...navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Risk Assessment & Method Statement", pageW - margin, margin + 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...(PDF_PALETTE.inkMuted as unknown as RGB));
  doc.text(
    `${(data.status || "Draft").toUpperCase()}  ·  Version ${data.version ?? 1}`,
    pageW - margin,
    margin + 30,
    { align: "right" },
  );

  let y = Math.max(headerBottom, margin + 40) + 10;
  doc.setDrawColor(...navy);
  doc.setLineWidth(1.5);
  doc.line(margin, y, pageW - margin, y);
  y += 16;
  doc.setTextColor(...ink);

  // ── ONE CONSISTENT HEADER BLOCK ──
  const jobSiteBody: any[] = [
    ["Job reference", data.job_reference || "—", "Client", data.client_name || "—"],
    ["Site", data.site_name || data.job_name || "—", "Job", data.job_name || "—"],
    ["Site address", data.site_address || "—", "Issued", new Date().toLocaleDateString("en-GB")],
  ];

  autoTable(doc, {
    startY: y,
    theme: "grid",
    body: jobSiteBody,
    styles: {
      fontSize: 9,
      cellPadding: 5,
      textColor: ink,
      lineColor: PDF_PALETTE.border as unknown as RGB,
      lineWidth: 0.5,
    },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: PDF_PALETTE.headerStrip as unknown as RGB, cellWidth: 82 },
      1: { cellWidth: 180 },
      2: { fontStyle: "bold", fillColor: PDF_PALETTE.headerStrip as unknown as RGB, cellWidth: 68 },
      3: { cellWidth: "auto" },
    },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  const section = (title: string, atY: number) => sectionHeader(doc, title, atY, margin, pageW, navy, navyText);

  // ── DESCRIPTION ──
  y = section("Description of Works", y) + 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...ink);
  const descLines = doc.splitTextToSize(data.works_description || "—", pageW - margin * 2);
  doc.text(descLines, margin, y + 8);
  y += descLines.length * 12 + 16;

  // ── FACTORS ──
  const activeFactors = Object.entries(data.factors || {})
    .filter(([, v]) => v).map(([k]) => FACTOR_LABELS[k] || k);
  if (activeFactors.length) {
    if (y > pageH - 120) { doc.addPage(); y = margin; }
    y = section("Identified Risk Factors", y) + 6;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...ink);
    const f = doc.splitTextToSize(activeFactors.join("   •   "), pageW - margin * 2);
    doc.text(f, margin, y + 8);
    y += f.length * 12 + 16;
  }

  // ── RISK ASSESSMENT TABLE ──
  if (y > pageH - 160) { doc.addPage(); y = margin; }
  y = section("Risk Assessment", y);

  const riskBody = (data.risk_assessment || []).map((r) => [
    r.hazard || "",
    r.who_at_risk || "",
    r.initial_risk_rating || "",
    r.control_measures || "",
    r.residual_risk_rating || "",
  ]);

  autoTable(doc, {
    startY: y + 8,
    head: [["Hazard", "Who is at risk", "Initial", "Control measures", "Residual"]],
    body: riskBody.length ? riskBody : [["—", "—", "—", "—", "—"]],
    styles: {
      fontSize: 8.5,
      cellPadding: 5,
      valign: "top",
      textColor: ink,
      lineColor: PDF_PALETTE.border as unknown as RGB,
      lineWidth: 0.5,
      overflow: "linebreak",
    },
    headStyles: { fillColor: navy, textColor: navyText, fontStyle: "bold", halign: "left" },
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 80 },
      2: { cellWidth: 46, halign: "center", fontStyle: "bold" },
      3: { cellWidth: "auto" },
      4: { cellWidth: 46, halign: "center", fontStyle: "bold" },
    },
    didParseCell: (hookData) => {
      if (hookData.section !== "body") return;
      if (hookData.column.index === 2 || hookData.column.index === 4) {
        const fill = ratingFill(String(hookData.cell.raw ?? ""));
        if (fill) hookData.cell.styles.fillColor = fill;
      }
    },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 20;

  // ── METHOD STATEMENT ──
  if (y > pageH - 160) { doc.addPage(); y = margin; }
  y = section("Method Statement", y) + 12;

  const ms = data.method_statement || {};
  y = listSection(doc, "Sequence of Works", ms.sequence || [], y, margin, pageH, true, ink);
  y = listSection(doc, "PPE Required", ms.ppe || [], y, margin, pageH, false, ink);
  y = listSection(doc, "Plant & Equipment", ms.plant_equipment || [], y, margin, pageH, false, ink);
  y = textSection(doc, "Emergency Arrangements", ms.emergency_arrangements || "", y, margin, pageW, pageH, ink);
  y = textSection(doc, "Welfare Arrangements", ms.welfare_arrangements || "", y, margin, pageW, pageH, ink);

  // ── SIGN-OFF BOX ──
  if (y > pageH - 170) { doc.addPage(); y = margin; }
  y = section("Document Sign-Off", y);
  autoTable(doc, {
    startY: y + 8,
    head: [["Role", "Name", "Date"]],
    body: [
      ["Prepared by", data.prepared_by || "—", fmtDate(data.prepared_at)],
      ["Reviewed by", data.reviewed_by || "—", "—"],
      ["Approved by", data.approved_by || "—", fmtDate(data.approved_at)],
    ],
    styles: {
      fontSize: 10,
      cellPadding: 8,
      minCellHeight: 34,
      valign: "middle",
      textColor: ink,
      lineColor: PDF_PALETTE.border as unknown as RGB,
      lineWidth: 0.5,
    },
    headStyles: { fillColor: navy, textColor: navyText, fontStyle: "bold" },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 110, fillColor: PDF_PALETTE.headerStrip as unknown as RGB },
      2: { cellWidth: 100 },
    },
    margin: { left: margin, right: margin },
  });

  // ── FOOTER ON EVERY PAGE ──
  const footerRuleY = pageH - 30;
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...navy);
    doc.setLineWidth(1.2);
    doc.line(margin, footerRuleY, pageW - margin, footerRuleY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...(PDF_PALETTE.inkMuted as unknown as RGB));
    const orgLabel = profile.footerText || profile.companyName || org.name || "";
    doc.text(`${orgLabel}${orgLabel ? " · " : ""}RAMS v${data.version ?? 1}`, margin, pageH - 16);
    doc.text(`${(data.status || "Draft").toUpperCase()}`, pageW / 2, pageH - 16, { align: "center" });
    doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 16, { align: "right" });
  }

  // ── SHARED BRANDING OVERLAY (watermark + accreditation strip) ──
  const [watermark, accredLogos] = await Promise.all([
    loadWatermarkImage(),
    fetchCustomerAccreditationLogos(data.client_name).then(loadAccreditationLogos),
  ]);
  await renderBrandingOverlay(doc, {
    watermark,
    brandColor: profile.accentColor,
    accredLogos,
    accredFooterY: footerRuleY,
    accredLogoH: 20, // pt equivalent of the report renderer's 7mm strip
    override: data.watermarkOverride ?? null,
  });

  const blob = doc.output("blob");
  const safe = (s?: string | null) => (s || "rams").replace(/[^a-z0-9-]+/gi, "_");
  const fileName = `RAMS_${safe(data.job_reference || data.site_name)}_v${data.version ?? 1}.pdf`;
  return { blob, fileName };
}

/** Brand-blue section band, matching the report renderer's section chrome. */
function sectionHeader(
  doc: jsPDF, title: string, y: number, margin: number, pageW: number,
  navy: RGB, navyText: RGB,
): number {
  const h = 18;
  doc.setFillColor(...navy);
  doc.rect(margin, y, pageW - margin * 2, h, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...navyText);
  doc.text(title.toUpperCase(), margin + 8, y + 12.5);
  return y + h;
}

function listSection(
  doc: jsPDF, title: string, items: string[], y: number,
  margin: number, pageH: number, numbered: boolean, ink: RGB,
): number {
  if (!items.length) return y;
  if (y > pageH - 90) { doc.addPage(); y = margin; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...ink);
  doc.text(title, margin, y);
  autoTable(doc, {
    startY: y + 6,
    body: items.map((s, i) => [numbered ? `${i + 1}.` : "•", s]),
    styles: { fontSize: 9.5, cellPadding: 4, textColor: ink, overflow: "linebreak" },
    columnStyles: { 0: { cellWidth: 22, fontStyle: "bold", halign: "right" } },
    theme: "plain",
    margin: { left: margin, right: margin },
  });
  return (doc as any).lastAutoTable.finalY + 14;
}

function textSection(
  doc: jsPDF, title: string, text: string, y: number,
  margin: number, pageW: number, pageH: number, ink: RGB,
): number {
  if (!text || text === "—") return y;
  if (y > pageH - 90) { doc.addPage(); y = margin; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...ink);
  doc.text(title, margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(text, pageW - margin * 2);
  doc.text(lines, margin, y);
  return y + lines.length * 12 + 10;
}
