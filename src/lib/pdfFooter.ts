import jsPDF from "jspdf";

export interface PdfSignatureData {
  dateStr: string;
  technicianName: string;
  customerName: string;
  /** Pre-loaded HTMLImageElement keyed by signature id */
  sigImages?: Record<string, HTMLImageElement>;
  /** Signature record for engineer/admin */
  engineerSig?: { id: string; signer_name: string; signer_role: string } | null;
  /** Signature record for customer */
  customerSig?: { id: string; signer_name: string; signer_role: string } | null;
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
  const sigImgH = 14;
  const sigImgW = 40;
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

  doc.setFont("helvetica", "bold");
  doc.text("Date: ", cx, sigY + 3);
  doc.setFont("helvetica", "normal");
  doc.text(data.dateStr, cx + 10, sigY + 3);
  doc.setFont("helvetica", "bold");
  doc.text("Customer:", cx, sigY + 7);
  doc.setFont("helvetica", "normal");
  const customerDisplayName = data.customerSig?.signer_name || data.customerName;
  if (customerDisplayName) doc.text(customerDisplayName, cx + 18, sigY + 7);
  if (data.customerSig && sigImages[data.customerSig.id]) {
    doc.addImage(sigImages[data.customerSig.id], "PNG", cx + 18, sigY + 8, sigImgW, sigImgH);
  } else if (data.customerSig) {
    // Has a sig record but image failed to load — show underline
    doc.text("Signature:", cx, sigY + 11);
    doc.line(cx + 18, sigY + 11, cx + halfW, sigY + 11);
  }
  // If no customerSig record at all, omit the signature line entirely

  return sigY + 15;
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
  doc.setFontSize(7);
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
  if (n.includes("dry riser") && n.includes("visual")) {
    return {
      text: "Tested and inspected in accordance with BS 9990:2015",
      source: "rule",
      ruleLabel: "Dry Riser Visual → BS 9990:2015",
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
