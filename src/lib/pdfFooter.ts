import jsPDF from "jspdf";

/**
 * Maximum vertical footprint of the filled signature block in millimetres.
 * Keep page-break/reservation checks in PDF builders aligned to this value.
 */
export const PDF_SIGNATURE_BLOCK_HEIGHT_MM = 22;

export interface PdfFooterFlowInput {
  /** Current Y immediately after the last body row/content block. */
  startY: number;
  pageHeight: number;
  margin?: number;
  signatureHeight?: number;
  declarationHeight?: number;
  signatureGap?: number;
  declarationGap?: number;
  accreditationLogoHeight?: number;
  accreditationGapToFooter?: number;
  /** Usually pageHeight - margin; override only for unusual page chrome. */
  bottomY?: number;
}

export interface PdfFooterFlow {
  sigY: number;
  signatureEndY: number;
  declarationFooterY: number;
  footerEndY: number;
  accredFooterY: number;
  stackEndY: number;
  canUseBottomLogos: boolean;
  /** Actual vertical room available for the accreditation strip in mm.
   *  Callers should shrink the logo height to fit rather than dropping the
   *  strip entirely — accreditations are near-mandatory branding. */
  maxLogoHeightAvailable: number;
}

/**
 * Compute where the sign-off/declaration stack should flow.
 *
 * This intentionally treats accreditation logos as optional page decoration:
 * they may be suppressed if there is not enough room, but they must never be
 * part of the page-break decision for report content. That false reservation
 * was the recurring Dry Riser two-page regression: page 1 had enough room for
 * signatures + declaration, but the optional logo strip pushed the sign-off
 * block onto a blank page 2.
 */
export function computePdfFooterFlow(input: PdfFooterFlowInput): PdfFooterFlow {
  const margin = input.margin ?? 10;
  const signatureHeight = input.signatureHeight ?? PDF_SIGNATURE_BLOCK_HEIGHT_MM;
  const declarationHeight = input.declarationHeight ?? 0;
  const signatureGap = input.signatureGap ?? 2;
  const declarationGap = declarationHeight ? (input.declarationGap ?? 2) : 0;
  const accreditationLogoHeight = input.accreditationLogoHeight ?? 12;
  const accreditationGapToFooter = input.accreditationGapToFooter ?? 3;
  const bottomY = input.bottomY ?? input.pageHeight - margin;

  const sigY = input.startY + signatureGap;
  const signatureEndY = sigY + signatureHeight;
  const declarationFooterY = declarationHeight ? signatureEndY + declarationGap : signatureEndY;
  const footerEndY = declarationHeight ? declarationFooterY + declarationHeight : signatureEndY;
  const maxLogoHeightAvailable = Math.max(0, bottomY - footerEndY - accreditationGapToFooter);

  return {
    sigY,
    signatureEndY,
    declarationFooterY,
    footerEndY,
    accredFooterY: bottomY,
    stackEndY: footerEndY,
    // Permissive by design: accreditations should render whenever ANY room
    // (down to the minimum ~6mm) exists. Callers should use
    // resolveAccreditationLogoHeight() to pick the actual render height.
    canUseBottomLogos: maxLogoHeightAvailable >= 6,
    maxLogoHeightAvailable,
  };
}

/**
 * Resolve the actual accreditation-logo height to use given available room.
 * Prefers `preferredH`, shrinks down to `minH` if space is tight, and returns
 * 0 only when there is genuinely no room. Logs a warning when the strip is
 * suppressed or shrunk so regressions are visible in the console.
 */
export function resolveAccreditationLogoHeight(
  flow: PdfFooterFlow,
  preferredH = 12,
  minH = 6,
  context = "pdf",
): number {
  const avail = flow.maxLogoHeightAvailable;
  if (avail >= preferredH) return preferredH;
  if (avail >= minH) {
    // eslint-disable-next-line no-console
    console.warn(`[${context}] Accreditation strip shrunk to ${avail.toFixed(1)}mm (preferred ${preferredH}mm) to keep one-page layout.`);
    return Math.floor(avail);
  }
  // eslint-disable-next-line no-console
  console.warn(`[${context}] Accreditation strip suppressed — only ${avail.toFixed(1)}mm available (min ${minH}mm). Page content is too tall.`);
  return 0;
}

export interface PdfSignatureData {
  dateStr: string;
  technicianName: string;
  customerName: string;
  /** Pre-loaded HTMLImageElement keyed by signature id */
  sigImages?: Record<string, HTMLImageElement>;
  /** Signature record for engineer/admin */
  engineerSig?: { id: string; signer_name: string; signer_role: string; signer_position?: string | null; created_at?: string; w3w_words?: string | null } | null;
  /** Signature record for customer */
  customerSig?: { id: string; signer_name: string; signer_role: string; signer_position?: string | null; created_at?: string } | null;
  /** Optional small caption rendered under the technician signature (e.g. "signature from original scan"). */
  technicianSourceNote?: string | null;
  /** Optional small caption rendered under the customer signature. */
  customerSourceNote?: string | null;
}


function formatSigTimestamp(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

/**
 * Render signature blocks (technician + customer) side-by-side.
 *
 * When `blank` is true, renders empty underlines for manual signing.
 * Otherwise fills in names and signature images where available.
 *
 * Returns the y position immediately after the signature block.
 */
export function renderPdfSignatures(
  doc: jsPDF,
  sigY: number,
  data: PdfSignatureData,
  opts: { blank?: boolean } = {}
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  const maxWidth = pageWidth - margin * 2;
  const halfW = maxWidth / 2 - 2;
  const sigImages = data.sigImages || {};
  // Signature rendering uses the full available line width between the label
  // and the right edge of the column, scaled with the image's natural aspect
  // ratio (never distorted). Height is capped so the sign-off block stays
  // within its ~22mm budget and the report keeps to one page.
  const SIG_MAX_H = 12; // mm — hard vertical cap
  const SIG_MIN_H = 6;  // mm — visual floor for very wide signatures
  const labelX = 20;
  const lineSpacing = 5;
  const cx = margin + halfW + 4;
  // Signature ink area: starts just after the label column, ends at column edge.
  const sigAreaX = margin + labelX - 2;
  const sigAreaMaxW = halfW - (labelX - 2);
  const sigAreaCX = cx + labelX - 2;
  const sigAreaTop = 8; // relative to sigY
  const sigAreaBottom = 20; // relative to sigY (~caption line)
  const sigAreaMaxH = Math.max(SIG_MIN_H, Math.min(SIG_MAX_H, sigAreaBottom - sigAreaTop));

  const drawSig = (img: HTMLImageElement, xLeft: number, yTop: number, maxW: number, maxH: number) => {
    const nw = (img.naturalWidth || img.width || maxW * 4);
    const nh = (img.naturalHeight || img.height || maxH * 4);
    if (!nw || !nh) {
      doc.addImage(img, "PNG", xLeft, yTop, maxW, maxH);
      return;
    }
    const scale = Math.min(maxW / nw, maxH / nh);
    const w = nw * scale;
    const h = nh * scale;
    // Left-align horizontally, vertically centre within the row.
    const y = yTop + (maxH - h) / 2;
    doc.addImage(img, "PNG", xLeft, y, w, h);
  };

  doc.setFontSize(opts.blank ? 8.5 : 7);
  doc.setTextColor(0, 0, 0);

  if (opts.blank) {
    // ---- Blank mode (underlines for manual signing) ----
    // Left column — Technician
    doc.setFont("helvetica", "bold");
    doc.text("Date:", margin, sigY + 3);
    doc.line(margin + labelX, sigY + 4, margin + halfW, sigY + 4);

    doc.text("Technician:", margin, sigY + 3 + lineSpacing);
    doc.setFont("helvetica", "normal");
    if (data.technicianName) doc.text(data.technicianName, margin + labelX, sigY + 3 + lineSpacing);
    doc.line(margin + labelX, sigY + 4 + lineSpacing, margin + halfW, sigY + 4 + lineSpacing);

    doc.setFont("helvetica", "bold");
    doc.text("Signature:", margin, sigY + 3 + lineSpacing * 2);
    doc.line(margin + labelX, sigY + 4 + lineSpacing * 2, margin + halfW, sigY + 4 + lineSpacing * 2);

    // Right column — Customer
    doc.text("Date:", cx, sigY + 3);
    doc.line(cx + labelX, sigY + 4, cx + halfW, sigY + 4);

    doc.text("Customer:", cx, sigY + 3 + lineSpacing);
    doc.line(cx + labelX, sigY + 4 + lineSpacing, cx + halfW, sigY + 4 + lineSpacing);

    doc.text("Signature:", cx, sigY + 3 + lineSpacing * 2);
    doc.line(cx + labelX, sigY + 4 + lineSpacing * 2, cx + halfW, sigY + 4 + lineSpacing * 2);

    return sigY + lineSpacing * 2 + 5;
  }

  // ---- Filled mode (with sig images) ----
  // Vertical layout budget (relative to sigY):
  //   +3   Date row
  //   +7   Technician name row
  //   +8..+20  Signature ink area (aspect-preserving, up to 12mm tall)
  //   +21  Optional source-note / timestamp caption (tiny italic)
  // Total ≈ 22mm — keep sig block + reservation check in JobSheetPdfExport
  // aligned with this budget.
  doc.setFont("helvetica", "bold");
  doc.text("Date: ", margin, sigY + 3);
  doc.setFont("helvetica", "normal");
  doc.text(data.dateStr, margin + 10, sigY + 3);
  doc.setFont("helvetica", "bold");
  doc.text("Technician:", margin, sigY + 7);
  doc.setFont("helvetica", "normal");
  doc.text(data.technicianName, margin + 20, sigY + 7);
  if (data.engineerSig && sigImages[data.engineerSig.id]) {
    drawSig(sigImages[data.engineerSig.id], sigAreaX, sigY + sigAreaTop, sigAreaMaxW, sigAreaMaxH);
  }
  // NOTE: intentionally no underline fallback — a blank line under the label
  // would look like an unsigned box on generated reports.
  const engTs = formatSigTimestamp(data.engineerSig?.created_at);
  if (engTs) {
    doc.setFontSize(5.5);
    doc.setTextColor(90, 90, 90);
    doc.text(`Signed ${engTs}`, margin, sigY + 21);
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
  } else if (data.technicianSourceNote) {
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(110, 110, 110);
    doc.text(data.technicianSourceNote, margin, sigY + 21);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
  }

  doc.setFont("helvetica", "bold");
  doc.text("Date: ", cx, sigY + 3);
  doc.setFont("helvetica", "normal");
  doc.text(data.dateStr, cx + 10, sigY + 3);
  doc.setFont("helvetica", "bold");
  doc.text("Customer:", cx, sigY + 7);
  doc.setFont("helvetica", "normal");
  const customerDisplayName = data.customerSig?.signer_name || data.customerName;
  const customerPositionLine = data.customerSig?.signer_position
    ? `${customerDisplayName || ""} — ${data.customerSig.signer_position}`
    : customerDisplayName;
  if (customerPositionLine) doc.text(customerPositionLine, cx + 18, sigY + 7);
  if (data.customerSig && sigImages[data.customerSig.id]) {
    drawSig(sigImages[data.customerSig.id], sigAreaCX, sigY + sigAreaTop, sigAreaMaxW, sigAreaMaxH);
  }
  const custTs = formatSigTimestamp(data.customerSig?.created_at);
  if (custTs) {
    doc.setFontSize(5.5);
    doc.setTextColor(90, 90, 90);
    doc.text(`Signed ${custTs}`, cx, sigY + 21);
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
  } else if (data.customerSourceNote) {
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(110, 110, 110);
    doc.text(data.customerSourceNote, cx, sigY + 21);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
  }

  return sigY + PDF_SIGNATURE_BLOCK_HEIGHT_MM;
}


/**
 * Render the footer declaration box (centred, bold text inside a bordered rect).
 * Returns the y position after the footer.
 */
export function renderPdfFooter(
  doc: jsPDF,
  footerY: number,
  footerText: string
): number {
  if (!footerText || !footerText.trim()) return footerY;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  const maxWidth = pageWidth - margin * 2;
  const footerH = 9;

  doc.setDrawColor(0);
  doc.rect(margin, footerY, maxWidth, footerH);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  const lines = footerText.split("\n");
  lines.forEach((line, i) => {
    doc.text(line.trim(), pageWidth / 2, footerY + 3 + i * 3.5, { align: "center" });
  });

  return footerY + footerH;
}

/** Source of the resolved footer declaration, useful for admin diagnostics. */
export type FooterTextSource =
  | "template" // explicit per-template footer_text
  | "branding" // per-customer branding override
  | "rule" // keyword-based fallback (e.g. extinguisher, sprinkler, hydrant, dry riser visual)
  | "none"; // no footer rendered

export interface ResolvedFooter {
  text: string;
  source: FooterTextSource;
  /** Human-readable label describing which rule applied (e.g. "Dry Riser Visual → BS 9990:2015"). */
  ruleLabel: string;
}

/**
 * Resolve the footer declaration text and report which rule was applied.
 *
 * Resolution order:
 *   1. Explicit per-template `footer_text` (set by admins on the template editor)
 *   2. Per-customer branding override (`branding.footer_text`)
 *   3. Keyword-based fallback by template name
 *   4. Empty string (no footer rendered)
 */
export function resolveFooterText(
  templateName: string,
  branding?: { footer_text?: string },
  templateFooterText?: string | null,
): ResolvedFooter {
  if (templateFooterText && templateFooterText.trim()) {
    return { text: templateFooterText, source: "template", ruleLabel: "Template footer override" };
  }
  if (branding?.footer_text) {
    return { text: branding.footer_text, source: "branding", ruleLabel: "Customer branding override" };
  }
  const n = (templateName || "").toLowerCase();
  if (n.includes("fire extinguisher") || n.includes("extinguisher")) {
    return {
      text: "Tested and inspected in accordance with BS 5306-3:2017",
      source: "rule",
      ruleLabel: "Extinguisher → BS 5306-3:2017",
    };
  }
  if (n.includes("sprinkler")) {
    return {
      text: "Tested and inspected in accordance with BS EN 12845:2015",
      source: "rule",
      ruleLabel: "Sprinkler → BS EN 12845:2015",
    };
  }
  if (n.includes("fire hydrant") || n.includes("hydrant")) {
    return {
      text: "Tested and inspected in accordance with BS 9990:2015 / NFCC Guidelines",
      source: "rule",
      ruleLabel: "Fire Hydrant → BS 9990:2015 / NFCC",
    };
  }
  // Hydraulic pressure test (dry / wet riser) — BS 9990:2015 12 bar for 15 min
  if (n.includes("hydraulic") && n.includes("pressure")) {
    return {
      text: "We have, today, carried out a Hydraulic Pressure Test of 12 Bars for a period of 15 minutes to the requirements of BS 9990:2015",
      source: "rule",
      ruleLabel: "Hydraulic Pressure Test → BS 9990:2015 (12 bar / 15 min)",
    };
  }
  if (n.includes("wet riser")) {
    return {
      text: "Tested and inspected in accordance with BS 9990:2015",
      source: "rule",
      ruleLabel: "Wet Riser → BS 9990:2015",
    };
  }
  if (n.includes("dry riser")) {
    return {
      text: "Tested and inspected in accordance with BS 9990:2015",
      source: "rule",
      ruleLabel: "Dry Riser → BS 9990:2015",
    };
  }
  if (n.includes("emergency light")) {
    return {
      text: "Tested and inspected in accordance with BS 5266-1:2016",
      source: "rule",
      ruleLabel: "Emergency Lighting → BS 5266-1:2016",
    };
  }
  if (n.includes("fire alarm")) {
    return {
      text: "Tested and inspected in accordance with BS 5839-1:2017",
      source: "rule",
      ruleLabel: "Fire Alarm → BS 5839-1:2017",
    };
  }
  return { text: "", source: "none", ruleLabel: "No footer (no matching rule)" };
}

/** Backwards-compatible string-only accessor. */
export function getDefaultFooterText(
  templateName: string,
  branding?: { footer_text?: string },
  templateFooterText?: string | null,
): string {
  return resolveFooterText(templateName, branding, templateFooterText).text;
}
