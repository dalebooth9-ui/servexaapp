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
  const bottomLogoTop = bottomY - accreditationLogoHeight - accreditationGapToFooter;

  return {
    sigY,
    signatureEndY,
    declarationFooterY,
    footerEndY,
    accredFooterY: bottomY,
    stackEndY: footerEndY,
    canUseBottomLogos: footerEndY <= bottomLogoTop - 2,
  };
}

export interface PdfSignatureData {
  dateStr: string;
  technicianName: string;
  customerName: string;
  /** Pre-loaded HTMLImageElement keyed by signature id */
  sigImages?: Record<string, HTMLImageElement>;
  /** Signature record for engineer/admin */
  engineerSig?: { id: string; signer_name: string; signer_role: string; signer_position?: string | null; created_at?: string } | null;
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
  // Constrained to keep the sign-off block within its ~22mm budget so the
  // report stays single-page. Don't grow these without re-running
  // dryRiserSinglePage.test.ts against a fully-populated fixture — the block
  // has repeatedly caused page-spill regressions on completed sheets.
  const sigImgH = 11; // ~42px @ 96dpi
  const sigImgW = 36;
  const labelX = 20;
  const lineSpacing = 5;
  const cx = margin + halfW + 4;

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
  //   +8..+19  Signature image (H=11)
  //   +20  Optional source-note / timestamp caption (tiny italic)
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
    doc.addImage(sigImages[data.engineerSig.id], "PNG", margin + 18, sigY + 8, sigImgW, sigImgH);
  } else {
    doc.text("Signature:", margin, sigY + 11);
    doc.line(margin + 18, sigY + 11, margin + halfW, sigY + 11);
  }
  const engTs = formatSigTimestamp(data.engineerSig?.created_at);
  if (engTs) {
    doc.setFontSize(5.5);
    doc.setTextColor(90, 90, 90);
    doc.text(`Signed ${engTs}`, margin, sigY + 20);
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
  } else if (data.technicianSourceNote) {
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(110, 110, 110);
    doc.text(data.technicianSourceNote, margin, sigY + 20);
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
    doc.addImage(sigImages[data.customerSig.id], "PNG", cx + 18, sigY + 8, sigImgW, sigImgH);
  } else if (data.customerSig) {
    doc.text("Signature:", cx, sigY + 11);
    doc.line(cx + 18, sigY + 11, cx + halfW, sigY + 11);
  }
  const custTs = formatSigTimestamp(data.customerSig?.created_at);
  if (custTs) {
    doc.setFontSize(5.5);
    doc.setTextColor(90, 90, 90);
    doc.text(`Signed ${custTs}`, cx, sigY + 20);
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
  } else if (data.customerSourceNote) {
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(110, 110, 110);
    doc.text(data.customerSourceNote, cx, sigY + 20);
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
