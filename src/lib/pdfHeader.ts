import jsPDF from "jspdf";
import type { RgbTriple } from "@/lib/extractLogoColors";
import { PDF_PALETTE } from "@/lib/pdfPalette";
import { resolveToSignedUrl } from "@/lib/durableStorageRef";

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
  /** Optional detail-grid layout variant. "fourColumn" matches the dry-riser Word reference. */
  detailGridVariant?: "standard" | "fourColumn";
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
  // Header logo: use whatever the caller resolved (via
  // resolveDocumentBrandingProfile). If the caller passed nothing, fall
  // through to the text-only branch below — DO NOT hardcode Viva's logo
  // here, or every non-Viva org's PDF leaks Viva branding.
  const rawLogo = branding.logo_url && branding.logo_url.trim() !== "" ? branding.logo_url : "";
  const resolvedLogo = rawLogo
    ? (await resolveToSignedUrl(rawLogo, "submissions").catch(() => null)) || rawLogo
    : "";
  const logoUrl = resolvedLogo;

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

  // Helper: shrink font size until each line of `text` fits within `boxW`,
  // then wrap. Never returns > `maxLines` lines.
  const fitAndWrap = (
    text: string,
    boxW: number,
    initialSize: number,
    fontStyle: "bold" | "normal" | "italic" | "bolditalic",
    { minSize = 8, maxLines = 3 }: { minSize?: number; maxLines?: number } = {},
  ): { lines: string[]; size: number } => {
    doc.setFont("helvetica", fontStyle);
    let size = initialSize;
    let lines: string[] = [];
    for (; size >= minSize; size -= 0.5) {
      doc.setFontSize(size);
      lines = doc.splitTextToSize(text, boxW) as string[];
      if (lines.length <= maxLines) break;
    }
    if (lines.length > maxLines) lines = lines.slice(0, maxLines);
    return { lines, size };
  };

  if (style.titleBands && style.titleBands.length > 0) {
    for (const band of style.titleBands) {
      const bandH = band.height ?? 9;
      const fill = band.fillColor ?? PDF_PALETTE.headerStrip;
      const textColor = band.textColor ?? PDF_PALETTE.ink;
      const fontSize = band.fontSize ?? 12;
      const fontStyle = band.fontStyle ?? "bold";
      const align = band.align ?? "center";
      const gapBelow = band.gapBelow ?? 2;
      // Wrap/shrink the band text so long titles never overflow the printable width.
      const boxW = maxWidth - 4;
      const fitted = fitAndWrap(band.text, boxW, fontSize, fontStyle as any, { maxLines: 2, minSize: 8 });
      const lineH = fitted.size * 0.42; // approx line height in mm
      const drawH = Math.max(bandH, fitted.lines.length * lineH + 2);
      doc.setFillColor(...fill);
      doc.rect(margin, y, maxWidth, drawH, "F");
      doc.setFontSize(fitted.size);
      doc.setFont("helvetica", fontStyle);
      doc.setTextColor(...textColor);
      const tx = align === "left" ? margin + 2 : pageWidth / 2;
      fitted.lines.forEach((ln, i) => {
        doc.text(ln, tx, y + drawH * 0.69 - (fitted.lines.length - 1 - i) * lineH,
          align === "center" ? { align: "center" } : {});
      });
      y += drawH + gapBelow;
    }
  }

  if (!titleStyle.hidden && (!style.titleBands || style.titleBands.length === 0)) {
    const titleFontSize = titleStyle.fontSize ?? 15;
    const titleFontStyle = titleStyle.fontStyle ?? "bold";
    const titleUpper = titleStyle.uppercase !== false;
    doc.setTextColor(...accent);
    const titleY = compact ? y + 2 : y;
    const titleText = titleUpper ? templateName.toUpperCase() : templateName;
    // Wrap + shrink-to-fit within the printable width so long job/report titles
    // never run off the right edge of the page.
    const fitted = fitAndWrap(titleText, maxWidth - 4, titleFontSize, titleFontStyle as any, {
      maxLines: 3,
      minSize: 10,
    });
    doc.setFont("helvetica", titleFontStyle);
    doc.setFontSize(fitted.size);
    const lineH = fitted.size * 0.42;
    fitted.lines.forEach((ln, i) => {
      doc.text(ln, pageWidth / 2, titleY + i * lineH, { align: "center" });
    });
    y = titleY + fitted.lines.length * lineH + 2;
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
  // Shared helper: fit a value into `maxW` at font size 9, wrapping to
  // multiple lines (compliance requires the FULL site address, incl. postcode,
  // to appear — we never truncate mid-word). Long values shrink one step
  // before wrapping so short-medium addresses still sit on one line.
  const wrapValue = (
    text: string,
    maxW: number,
    { minSize = 7.5, maxLines = 4 }: { minSize?: number; maxLines?: number } = {},
  ): { lines: string[]; size: number; lineH: number } => {
    doc.setFont("helvetica", "normal");
    let size = 9;
    let lines = doc.splitTextToSize(text || "", maxW) as string[];
    while (lines.length > maxLines && size > minSize) {
      size -= 0.5;
      doc.setFontSize(size);
      lines = doc.splitTextToSize(text || "", maxW) as string[];
    }
    if (lines.length > maxLines) lines = lines.slice(0, maxLines);
    doc.setFontSize(9);
    return { lines, size, lineH: size * 0.4 };
  };

  if (showDetailGrid && style.detailGridVariant === "fourColumn") {
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.2);

    const baseRowH = 6;
    const hasW3W = !!data.w3wAddress;
    const c1 = maxWidth * 0.18;
    const c2 = maxWidth * 0.34;
    const c3 = maxWidth * 0.12;
    const x0 = margin;
    const x1 = x0 + c1;
    const x2 = x1 + c2;
    const x3 = x2 + c3;
    const x4 = margin + maxWidth;

    const siteStr = [data.siteName, data.siteAddress].filter(Boolean).join(", ");
    const custFit = wrapValue(data.customerName || "", c2 - 4, { maxLines: 2 });
    const siteFit = wrapValue(siteStr, c2 - 4, { maxLines: 4 });
    const row1H = Math.max(baseRowH, custFit.lines.length * custFit.lineH + 2.4);
    const row2H = Math.max(baseRowH, siteFit.lines.length * siteFit.lineH + 2.4);
    const row3H = baseRowH;
    const row4H = hasW3W ? baseRowH : 0;
    const detailH = row1H + row2H + row3H + row4H;

    const yRow1 = y;
    const yRow2 = y + row1H;
    const yRow3 = yRow2 + row2H;
    const yRow4 = yRow3 + row3H;

    doc.rect(x0, y, maxWidth, detailH);
    doc.line(x0, yRow2, x4, yRow2);
    doc.line(x0, yRow3, x4, yRow3);
    if (hasW3W) doc.line(x0, yRow4, x4, yRow4);
    // Vertical dividers only span the first two data rows.
    doc.line(x1, yRow1, x1, yRow3);
    doc.line(x2, yRow1, x2, yRow3);
    doc.line(x3, yRow1, x3, yRow3);
    // Riser row keeps a label divider between col1/col2.
    doc.line(x1, yRow3, x1, yRow3 + row3H);

    const drawLabel = (label: string, lx: number, yy: number) => {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(label, lx + 2, yy + 4);
    };
    const drawWrappedValue = (
      lines: string[],
      size: number,
      lineH: number,
      vx: number,
      yy: number,
    ) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      lines.forEach((ln, i) => doc.text(ln, vx + 2, yy + 4 + i * lineH));
      doc.setFontSize(9);
    };
    const drawSingle = (label: string, value: string, lx: number, vx: number, maxValueW: number, yy: number) => {
      drawLabel(label, lx, yy);
      doc.setFont("helvetica", "normal");
      doc.text(doc.splitTextToSize(value || "", maxValueW).slice(0, 1).join(""), vx + 2, yy + 4);
    };

    drawLabel("Customer:", x0, yRow1);
    drawWrappedValue(custFit.lines, custFit.size, custFit.lineH, x1, yRow1);
    drawSingle("DATE:", String(data.dateVal || ""), x2, x3, x4 - x3 - 4, yRow1);
    drawLabel("Site:", x0, yRow2);
    drawWrappedValue(siteFit.lines, siteFit.size, siteFit.lineH, x1, yRow2);
    drawSingle("PO/REF:", data.refNumber, x2, x3, x4 - x3 - 4, yRow2);
    drawSingle("Riser Location:", data.riserLocation, x0, x1, x4 - x1 - 4, yRow3);

    if (hasW3W) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(225, 31, 38);
      doc.text("///what3words:", x0 + 2, yRow4 + 4);
      doc.setFont("helvetica", "normal");
      doc.text(data.w3wAddress!.replace(/^\/\/\//, ""), x1 + 2, yRow4 + 4);
      doc.setTextColor(30, 30, 30);
    }

    y = y + detailH + 8;
  } else if (showDetailGrid) {
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);

    const baseRowH = 6;
    const hasW3W = !!data.w3wAddress;
    const splitX = margin + maxWidth * 0.7;

    doc.setFontSize(9);
    const siteStr = [data.siteName, data.siteAddress].filter(Boolean).join(", ");
    const custFit = wrapValue(data.customerName || "", maxWidth * 0.7 - 22, { maxLines: 2 });
    const siteFit = wrapValue(siteStr, maxWidth * 0.7 - 12, { maxLines: 4 });
    const row1H = Math.max(baseRowH, custFit.lines.length * custFit.lineH + 2.4);
    const row2H = Math.max(baseRowH, siteFit.lines.length * siteFit.lineH + 2.4);
    const row3H = baseRowH;
    const row4H = hasW3W ? baseRowH : 0;
    const detailH = row1H + row2H + row3H + row4H;

    const yRow1 = y;
    const yRow2 = y + row1H;
    const yRow3 = yRow2 + row2H;
    const yRow4 = yRow3 + row3H;

    doc.rect(margin, y, maxWidth, detailH);
    // Vertical Customer/DATE + Site/PO-REF divider spans first two rows.
    doc.line(splitX, yRow1, splitX, yRow3);
    doc.line(margin, yRow2, margin + maxWidth, yRow2);
    doc.line(margin, yRow3, margin + maxWidth, yRow3);
    if (hasW3W) doc.line(margin, yRow4, margin + maxWidth, yRow4);

    // Row 1: Customer | DATE
    doc.setFont("helvetica", "bold");
    doc.text("Customer:", margin + 1, yRow1 + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(custFit.size);
    custFit.lines.forEach((ln, i) =>
      doc.text(ln, margin + 19, yRow1 + 4 + i * custFit.lineH),
    );
    doc.setFontSize(9);

    doc.setFont("helvetica", "bold");
    doc.text("DATE:", splitX + 1, yRow1 + 4);
    doc.setFont("helvetica", "normal");
    doc.text(String(data.dateVal), splitX + 14, yRow1 + 4);

    // Row 2: Site | PO/REF — site wraps to preserve full address + postcode.
    doc.setFont("helvetica", "bold");
    doc.text("Site:", margin + 1, yRow2 + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(siteFit.size);
    siteFit.lines.forEach((ln, i) =>
      doc.text(ln, margin + 10, yRow2 + 4 + i * siteFit.lineH),
    );
    doc.setFontSize(9);

    doc.setFont("helvetica", "bold");
    doc.text("PO/REF:", splitX + 1, yRow2 + 4);
    doc.setFont("helvetica", "normal");
    doc.text(data.refNumber, splitX + 16, yRow2 + 4);

    // Row 3: Riser Location
    doc.setFont("helvetica", "bold");
    doc.text("Riser Location:", margin + 1, yRow3 + 4);
    doc.setFont("helvetica", "normal");
    doc.text(data.riserLocation, margin + 28, yRow3 + 4);

    // Row 4 (optional): what3words location in W3W red
    if (hasW3W) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(225, 31, 38); // W3W red
      doc.text("///what3words:", margin + 1, yRow4 + 4);
      doc.setFont("helvetica", "normal");
      doc.text(data.w3wAddress!.replace(/^\/\/\//, ""), margin + 30, yRow4 + 4);
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
