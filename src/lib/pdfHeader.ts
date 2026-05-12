import jsPDF from "jspdf";
import type { RgbTriple } from "@/lib/extractLogoColors";
import { PDF_PALETTE } from "@/lib/pdfPalette";

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

/* ─────────────────────────────────────────────────────────────────────
 * Style variant config
 *
 * Generators that diverge from the default centred-logo / centred-title
 * / 70-30-detail-grid layout pass a `style` object in opts. The helper
 * remains caller-agnostic: every variant is parameterised by data, not
 * by checking which file is calling.
 * ────────────────────────────────────────────────────────────────────*/
export type LogoPosition = "center" | "left" | "right" | "none";

export interface HeaderLogoStyle {
  position?: LogoPosition;       // default "center"
  topY?: number;                 // default 8 (or 6 compact)
  maxW?: number;                 // default 85 (65 compact)
  maxH?: number;                 // default 40 (28 compact)
  /** Force image format; otherwise auto-detected from URL/data-uri. */
  format?: "PNG" | "JPEG";
  /** Skip the company-name fallback when no logo can be loaded. */
  noFallbackText?: boolean;
}

export interface HeaderTitleStyle {
  fontSize?: number;             // default 15
  fontStyle?: "bold" | "bolditalic" | "normal";  // default "bold"
  uppercase?: boolean;           // default true
  /** Skip drawing the title (used when titleBands replaces it). */
  hidden?: boolean;
}

/** Optional second centred line directly under the title (e.g. JobReport's
 *  "REF | Generated DATE"). */
export interface HeaderSubtitleLineStyle {
  text: string;
  fontSize?: number;             // default 10
  fontStyle?: "normal" | "bold"; // default "normal"
  color?: RgbTriple;             // default muted grey [100,100,100]
}

/** A filled background band (CoC's grey title bands; PreStart's navy banner). */
export interface HeaderBand {
  text: string;
  fontSize?: number;             // default 12
  fontStyle?: "bold" | "bolditalic" | "normal"; // default "bold"
  height?: number;               // default 9 (mm)
  fillColor?: RgbTriple;         // default PDF_PALETTE.headerStrip
  textColor?: RgbTriple;         // default ink
  align?: "left" | "center";     // default "center"
  /** Vertical gap below this band. Default 2mm. */
  gapBelow?: number;
}

/** Free-form row drawn after the title chrome (PreStart's contract/site rows). */
export interface HeaderCustomRow {
  height: number;
  fillColor?: RgbTriple;
  /** Cell definitions across the row width; widthFraction sums to 1.0. */
  cells: Array<{
    widthFraction: number;
    label?: { text: string; fontSize?: number; color?: RgbTriple; topY?: number };
    value?: { text: string; fontSize?: number; color?: RgbTriple; topY?: number; bold?: boolean };
    /** Optional inset for label/value text from cell-left. Default 2mm. */
    paddingLeft?: number;
  }>;
  /** Vertical gap below this row. Default 0. */
  gapBelow?: number;
}

export interface HeaderStyle {
  logo?: HeaderLogoStyle;
  title?: HeaderTitleStyle;
  /** When set, the standard title is replaced by this stack of filled bands. */
  titleBands?: HeaderBand[];
  /** Optional centred subtitle line directly under the title. */
  subtitleLine?: HeaderSubtitleLineStyle;
  /** Show the standard separator line under the title. Default true. */
  separator?: boolean;
  /** Show the standard 3–4 row Customer/Site/PO-REF/Riser/W3W detail grid.
   *  Default true. */
  detailGrid?: boolean;
  /** Optional rows rendered after the title chrome and before the cursor
   *  is returned. Used by checklists that have their own contract / site
   *  rows in place of the standard detail grid. */
  customRows?: HeaderCustomRow[];
  /** Y at which to begin drawing title chrome. Defaults to logoBottomY.
   *  Useful for fixed-position banners (CoC anchors at y=38). */
  titleStartY?: number;
  /** Override the BS standard subtitle font size (pt). Default 9. */
  standardFontSize?: number;
  /** Override gap below the BS standard subtitle (mm). Default 4. */
  standardGapBelow?: number;
  /** Override the separator-line stroke width (mm). Default 0.5. */
  separatorThickness?: number;
}

export interface RenderPdfHeaderOpts {
  compact?: boolean;
  style?: HeaderStyle;
  /** Override the internal page side-margin (mm). Defaults to 10mm. */
  marginX?: number;
}

/* ─────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────*/
function detectFormat(url: string, override?: "PNG" | "JPEG"): "PNG" | "JPEG" {
  if (override) return override;
  const u = url.toLowerCase();
  if (u.includes("image/png") || u.endsWith(".png")) return "PNG";
  return "JPEG";
}

/**
 * Render the shared branded PDF header used by every Servexa generator.
 * Default layout:
 *  - Logo (centred)
 *  - Template title
 *  - Optional standard subtitle (e.g. BS 9990:2015)
 *  - Separator line
 *  - 3-row detail grid (Customer/Date, Site/PO-REF, Riser Location)
 *
 * Variants are driven entirely by `opts.style` — the helper itself contains
 * no per-caller branching.
 *
 * Returns the y position immediately after the header block.
 */
export async function renderPdfHeader(
  doc: jsPDF,
  templateName: string,
  branding: PdfBranding,
  data: PdfHeaderData,
  standard?: string | null,
  accentColor?: RgbTriple | null,
  opts?: RenderPdfHeaderOpts
): Promise<number> {
  const accent = accentColor ?? DEFAULT_ACCENT;
  const compact = !!opts?.compact;
  const style = opts?.style ?? {};
  const logoStyle = style.logo ?? {};
  const titleStyle = style.title ?? {};
  const showSeparator = style.separator !== false;
  const showDetailGrid = style.detailGrid !== false;

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = opts?.marginX ?? 10;
  const maxWidth = pageWidth - margin * 2;

  // ── Logo ───────────────────────────────────────────────────────────
  const logoPosition: LogoPosition = logoStyle.position ?? "center";
  const logoTopY = logoStyle.topY ?? (compact ? 6 : 8);
  const logoMaxW = logoStyle.maxW ?? (compact ? 65 : 85);
  const logoMaxH = logoStyle.maxH ?? (compact ? 28 : 40);

  const companyName = branding.company_name || "";
  const companySubtitle = branding.company_subtitle || "";
  // Default to the Viva Fire logo for every PDF. Only override when the customer has
  // their own uploaded logo (a real, non-empty URL on the customer record).
  const logoUrl = branding.logo_url && branding.logo_url.trim() !== ""
    ? branding.logo_url
    : "/images/vivafire-logo-new.png";

  let logoBottomY = logoTopY;

  if (logoPosition !== "none" && logoUrl) {
    try {
      const logoImg = new Image();
      logoImg.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        logoImg.onload = () => resolve();
        logoImg.onerror = () => reject();
        logoImg.src = logoUrl;
      });
      const aspect = logoImg.naturalWidth / logoImg.naturalHeight;
      let lw = logoMaxH * aspect;
      let lh = logoMaxH;
      if (lw > logoMaxW) { lw = logoMaxW; lh = lw / aspect; }
      let lx: number;
      if (logoPosition === "left") {
        lx = margin;
      } else if (logoPosition === "right") {
        lx = pageWidth - margin - lw;
      } else {
        lx = (pageWidth - lw) / 2;
      }
      const fmt = detectFormat(logoUrl, logoStyle.format);
      doc.addImage(logoImg, fmt, lx, logoTopY, lw, lh);
      logoBottomY = logoTopY + lh + (compact ? 1.5 : 3);
    } catch {
      if (!logoStyle.noFallbackText && companyName) {
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text(companyName, pageWidth / 2, logoTopY + 5, { align: "center" });
        if (companySubtitle) {
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.text(companySubtitle, pageWidth / 2, logoTopY + 9, { align: "center" });
        }
        logoBottomY = logoTopY + 12;
      }
    }
  } else if (logoPosition !== "none" && !logoStyle.noFallbackText && companyName) {
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(companyName, pageWidth / 2, logoTopY + 5, { align: "center" });
    if (companySubtitle) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(companySubtitle, pageWidth / 2, logoTopY + 9, { align: "center" });
    }
    logoBottomY = logoTopY + 12;
  }

  // ── Title chrome ───────────────────────────────────────────────────
  // Either: filled title bands (CoC, PreStart's banner) OR the standard
  // single-line title + optional standard + optional subtitle line.
  let y = style.titleStartY ?? logoBottomY;

  if (style.titleBands && style.titleBands.length > 0) {
    for (const band of style.titleBands) {
      const bandH = band.height ?? 9;
      const fill = band.fillColor ?? PDF_PALETTE.headerStrip;
      const textColor = band.textColor ?? PDF_PALETTE.ink;
      const fontSize = band.fontSize ?? 12;
      const fontStyle = band.fontStyle ?? "bold";
      const align = band.align ?? "center";
      const gapBelow = band.gapBelow ?? 2;
      doc.setFillColor(...fill);
      doc.rect(margin, y, maxWidth, bandH, "F");
      doc.setFontSize(fontSize);
      doc.setFont("helvetica", fontStyle);
      doc.setTextColor(...textColor);
      const tx = align === "left" ? margin + 2 : pageWidth / 2;
      // Vertical centre: roughly bandH * 0.7 from the top works for helvetica
      doc.text(band.text, tx, y + bandH * 0.69, align === "center" ? { align: "center" } : {});
      y += bandH + gapBelow;
    }
  }

  if (!titleStyle.hidden && (!style.titleBands || style.titleBands.length === 0)) {
    const titleFontSize = titleStyle.fontSize ?? 15;
    const titleFontStyle = titleStyle.fontStyle ?? "bold";
    const titleUpper = titleStyle.uppercase !== false;
    doc.setFont("helvetica", titleFontStyle);
    doc.setFontSize(titleFontSize);
    doc.setTextColor(...accent);
    const titleY = compact ? y + 2 : y;
    doc.text(
      titleUpper ? templateName.toUpperCase() : templateName,
      pageWidth / 2,
      titleY,
      { align: "center" }
    );
    y = titleY + 4;
  }

  // Optional BS standard subtitle (existing behaviour).
  if (standard) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(style.standardFontSize ?? 9);
    doc.setTextColor(...accent);
    doc.text(standard, pageWidth / 2, y, { align: "center" });
    y += style.standardGapBelow ?? 4;
  }

  // Optional second subtitle line (e.g. "REF | Generated DATE").
  if (style.subtitleLine) {
    const sl = style.subtitleLine;
    doc.setFont("helvetica", sl.fontStyle ?? "normal");
    doc.setFontSize(sl.fontSize ?? 10);
    doc.setTextColor(...(sl.color ?? [100, 100, 100]));
    doc.text(sl.text, pageWidth / 2, y + 2, { align: "center" });
    y += 6;
  }

  // ── Separator line ─────────────────────────────────────────────────
  if (showSeparator) {
    doc.setDrawColor(...accent);
    doc.setLineWidth(style.separatorThickness ?? 0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;
  }

  doc.setTextColor(30, 30, 30);

  // ── Standard 3–4 row detail grid ───────────────────────────────────
  if (showDetailGrid) {
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);

    const headerRowH = 6;
    const hasW3W = !!data.w3wAddress;
    const rowCount = hasW3W ? 4 : 3;
    const detailH = headerRowH * rowCount;
    doc.rect(margin, y, maxWidth, detailH);
    const splitX = margin + maxWidth * 0.7;
    doc.line(splitX, y, splitX, y + headerRowH * 2);
    doc.line(margin, y + headerRowH, margin + maxWidth, y + headerRowH);
    doc.line(margin, y + headerRowH * 2, margin + maxWidth, y + headerRowH * 2);
    doc.line(margin, y + headerRowH * 3, margin + maxWidth, y + headerRowH * 3);

    doc.setFontSize(9);

    // Row 1: Customer | DATE
    doc.setFont("helvetica", "bold");
    doc.text("Customer:", margin + 1, y + 4);
    doc.setFont("helvetica", "normal");
    doc.text(
      doc.splitTextToSize(data.customerName, maxWidth * 0.7 - 22).slice(0, 1).join(""),
      margin + 19,
      y + 4
    );

    doc.setFont("helvetica", "bold");
    doc.text("DATE:", splitX + 1, y + 4);
    doc.setFont("helvetica", "normal");
    doc.text(String(data.dateVal), splitX + 14, y + 4);

    // Row 2: Site | PO/REF
    const siteStr = [data.siteName, data.siteAddress].filter(Boolean).join(", ");
    doc.setFont("helvetica", "bold");
    doc.text("Site:", margin + 1, y + headerRowH + 4);
    doc.setFont("helvetica", "normal");
    doc.text(
      doc.splitTextToSize(siteStr, maxWidth * 0.7 - 12).slice(0, 1).join(""),
      margin + 10,
      y + headerRowH + 4
    );

    doc.setFont("helvetica", "bold");
    doc.text("PO/REF:", splitX + 1, y + headerRowH + 4);
    doc.setFont("helvetica", "normal");
    doc.text(data.refNumber, splitX + 16, y + headerRowH + 4);

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

    y = y + detailH + 2;
  }

  // ── Optional custom rows (e.g. PreStart contract / site row) ─────
  if (style.customRows && style.customRows.length > 0) {
    for (const row of style.customRows) {
      if (row.fillColor) {
        doc.setFillColor(...row.fillColor);
        doc.rect(margin, y, maxWidth, row.height, "FD");
      } else {
        doc.setDrawColor(...PDF_PALETTE.border);
        doc.rect(margin, y, maxWidth, row.height);
      }
      let cx = margin;
      for (const cell of row.cells) {
        const cw = maxWidth * cell.widthFraction;
        const padL = cell.paddingLeft ?? 2;
        if (cell.label) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(cell.label.fontSize ?? 7);
          doc.setTextColor(...(cell.label.color ?? PDF_PALETTE.inkMuted));
          doc.text(cell.label.text, cx + padL, y + (cell.label.topY ?? 3.2));
        }
        if (cell.value) {
          doc.setFont("helvetica", cell.value.bold ? "bold" : "normal");
          doc.setFontSize(cell.value.fontSize ?? 9);
          doc.setTextColor(...(cell.value.color ?? PDF_PALETTE.inkDark));
          // Default value position drops below the label if both present.
          const defaultValueY = cell.label ? 7.5 : row.height / 2 + 1;
          doc.text(
            doc.splitTextToSize(cell.value.text || "", cw - padL * 2).slice(0, 1).join(""),
            cx + padL,
            y + (cell.value.topY ?? defaultValueY)
          );
        }
        cx += cw;
      }
      y += row.height + (row.gapBelow ?? 0);
    }
    doc.setTextColor(30, 30, 30);
  }

  return y;
}
