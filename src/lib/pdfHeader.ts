import jsPDF from "jspdf";
import type { RgbTriple } from "@/lib/extractLogoColors";

export interface PdfHeaderData {
  customerName: string;
  siteName: string;
  siteAddress: string;
  refNumber: string;
  dateVal: string;
  riserLocation: string;
  numberOfOutlets?: number | string | null;
  w3wAddress?: string;
}

export interface PdfBranding {
  company_name?: string;
  company_subtitle?: string;
  logo_url?: string;
  footer_text?: string;
}

const DEFAULT_ACCENT: RgbTriple = [33, 61, 99];

/**
 * Render the shared branded PDF header used by all three export types:
 *  - Logo (centred)
 *  - Template title
 *  - Separator line
 *  - 3-row detail grid (Customer/Date, Site/PO-REF, Riser Location)
 *
 * Returns the y position immediately after the header block.
 */
/**
 * @param accentColor  Optional [r,g,b] extracted from the customer logo.
 *                     When provided, replaces the default navy for the title
 *                     text and separator line.
 */
export async function renderPdfHeader(
  doc: jsPDF,
  templateName: string,
  branding: PdfBranding,
  data: PdfHeaderData,
  standard?: string | null,
  accentColor?: RgbTriple | null,
  opts?: { compact?: boolean }
): Promise<number> {
  const accent = accentColor ?? DEFAULT_ACCENT;
  const compact = !!opts?.compact;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  const maxWidth = pageWidth - margin * 2;
  let y = compact ? 6 : 8;

  const companyName = branding.company_name || "";
  const companySubtitle = branding.company_subtitle || "";
  // Default to the Viva Fire logo for every PDF. Only override when the customer has
  // their own uploaded logo (a real, non-empty URL on the customer record).
  const logoUrl = branding.logo_url && branding.logo_url.trim() !== ""
    ? branding.logo_url
    : "/images/vivafire-logo-new.png";

  // --- Logo ---
  let logoBottomY = y;
  if (logoUrl) {
    try {
      const logoImg = new Image();
      logoImg.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        logoImg.onload = () => resolve();
        logoImg.onerror = () => reject();
        logoImg.src = logoUrl;
      });
      // Larger header logo for stronger brand presence (smaller in compact mode)
      const logoMaxW = compact ? 110 : 110;
      const logoMaxH = compact ? 48 : 52;
      const aspect = logoImg.naturalWidth / logoImg.naturalHeight;
      let lw = logoMaxH * aspect;
      let lh = logoMaxH;
      if (lw > logoMaxW) { lw = logoMaxW; lh = lw / aspect; }
      const fmt = logoUrl.toLowerCase().includes(".png") ? "PNG" : "JPEG";
      doc.addImage(logoImg, fmt, (pageWidth - lw) / 2, y, lw, lh);
      logoBottomY = y + lh + (compact ? 0 : 3);
    } catch {
      if (companyName) {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(companyName, pageWidth / 2, y + 5, { align: "center" });
        if (companySubtitle) {
          doc.setFontSize(7);
          doc.setFont("helvetica", "normal");
          doc.text(companySubtitle, pageWidth / 2, y + 9, { align: "center" });
        }
        logoBottomY = y + 12;
      }
    }
  } else if (companyName) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(companyName, pageWidth / 2, y + 5, { align: "center" });
    if (companySubtitle) {
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(companySubtitle, pageWidth / 2, y + 9, { align: "center" });
    }
    logoBottomY = y + 12;
  }

  // --- Title (uses extracted brand accent colour) ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...accent);
  const titleY = compact ? logoBottomY + 2 : logoBottomY;
  doc.text(templateName.toUpperCase(), pageWidth / 2, titleY, { align: "center" });

  // --- Standard (BS number) subtitle ---
  let afterTitleY = titleY + 4;
  if (standard) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...accent);
    doc.text(standard, pageWidth / 2, afterTitleY, { align: "center" });
    afterTitleY += 4;
  }

  // --- Separator (uses extracted brand accent colour) ---
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.5);
  doc.line(margin, afterTitleY, pageWidth - margin, afterTitleY);

  doc.setTextColor(30, 30, 30);
  y = afterTitleY + 4;

  // --- detail grid (3 rows + optional W3W row) ---
  doc.setDrawColor(0);
  doc.setLineWidth(0.2);

  const headerRowH = 6;
  const hasW3W = !!data.w3wAddress;
  const rowCount = hasW3W ? 4 : 3;
  const detailH = headerRowH * rowCount;
  doc.rect(margin, y, maxWidth, detailH);
  doc.line(margin + maxWidth * 0.5, y, margin + maxWidth * 0.5, y + headerRowH * 2);
  doc.line(margin, y + headerRowH, margin + maxWidth, y + headerRowH);
  doc.line(margin, y + headerRowH * 2, margin + maxWidth, y + headerRowH * 2);
  doc.line(margin, y + headerRowH * 3, margin + maxWidth, y + headerRowH * 3);

  doc.setFontSize(8);

  // Row 1: Customer | DATE
  doc.setFont("helvetica", "bold");
  doc.text("Customer:", margin + 1, y + 4);
  doc.setFont("helvetica", "normal");
  doc.text(
    doc.splitTextToSize(data.customerName, maxWidth * 0.5 - 22).slice(0, 1).join(""),
    margin + 19,
    y + 4
  );

  doc.setFont("helvetica", "bold");
  doc.text("DATE:", margin + maxWidth * 0.5 + 1, y + 4);
  doc.setFont("helvetica", "normal");
  doc.text(String(data.dateVal), margin + maxWidth * 0.5 + 14, y + 4);

  // Row 2: Site | PO/REF
  const siteStr = [data.siteName, data.siteAddress].filter(Boolean).join(", ");
  doc.setFont("helvetica", "bold");
  doc.text("Site:", margin + 1, y + headerRowH + 4);
  doc.setFont("helvetica", "normal");
  doc.text(
    doc.splitTextToSize(siteStr, maxWidth * 0.5 - 12).slice(0, 1).join(""),
    margin + 10,
    y + headerRowH + 4
  );

  doc.setFont("helvetica", "bold");
  doc.text("PO/REF:", margin + maxWidth * 0.5 + 1, y + headerRowH + 4);
  doc.setFont("helvetica", "normal");
  doc.text(data.refNumber, margin + maxWidth * 0.5 + 16, y + headerRowH + 4);

  // Row 3: Riser Location
  doc.setFont("helvetica", "bold");
  doc.text("Riser Location:", margin + 1, y + headerRowH * 2 + 4);
  doc.setFont("helvetica", "normal");
  doc.text(data.riserLocation, margin + 28, y + headerRowH * 2 + 4);

  // Row 4 (optional): what3words location in W3W red
  if (hasW3W) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(225, 31, 38); // W3W red
    doc.text("///what3words:", margin + 1, y + headerRowH * 3 + 4);
    doc.setFont("helvetica", "normal");
    doc.text(data.w3wAddress!.replace(/^\/\/\//, ""), margin + 30, y + headerRowH * 3 + 4);
    doc.setTextColor(30, 30, 30);
  }

  return y + detailH + 2;
}
