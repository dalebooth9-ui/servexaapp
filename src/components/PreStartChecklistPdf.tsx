import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { loadWatermarkImage } from "@/lib/pdfWatermark";
import { loadWatermarkSettings } from "@/hooks/useWatermarkSettings";
import { fetchCustomerAccreditationLogos, loadAccreditationLogos } from "@/lib/pdfAccreditations";
import { renderBrandingOverlay, type WatermarkOverride } from "@/lib/pdfBranding";
import { PDF_PALETTE } from "@/lib/pdfPalette";
import { PDF_DIMENSIONS } from "@/lib/pdfDimensions";
import { renderPdfHeader } from "@/lib/pdfHeader";

export type PreStartJobInfo = {
  name?: string | null;
  address?: string | null;
  reference_number?: string;
  customer?: string | null;
  customers?: { name?: string | null; logo_url?: string | null } | null;
  site?: {
    name?: string | null;
    address?: string | null;
    postcode?: string | null;
    contact_name?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
  } | null;
};

interface Props {
  jobInfo: PreStartJobInfo | null;
}

export async function generatePreStartChecklistPdf(
  jobInfo: PreStartJobInfo | null,
  watermarkOverride: WatermarkOverride | null = null,
): Promise<{ base64: string; fileName: string }> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  // Standardised on PDF_DIMENSIONS.margin (10mm) so this generator's chrome
  // lines up with every other Servexa PDF.
  const ml = PDF_DIMENSIONS.margin;
  const mr = pw - PDF_DIMENSIONS.margin;
  const cw = mr - ml;

  const custAccredUrls = await fetchCustomerAccreditationLogos(jobInfo?.customers?.name || jobInfo?.customer);
  const [watermark, logos] = await Promise.all([
    loadWatermarkImage(),
    loadAccreditationLogos(custAccredUrls),
  ]);
  // Watermark + accreditation logos are applied at the END of the function via
  // the unified renderBrandingOverlay() helper so this generator inherits the
  // same gating, opacity scale, and per-export override semantics as every
  // other PDF in the system. (Viva-branded document — never tinted to a
  // customer brand colour, so brandColor is intentionally omitted.)

  // Brand colours sourced from the central palette so the checklist matches
  // the rest of the document system (previously this file declared a local
  // VIVA_NAVY = #1EAEE8 cyan, which did not match the brand navy used
  // everywhere else).
  const VIVA_NAVY = PDF_PALETTE.navy;
  const VIVA_DARK = PDF_PALETTE.inkDark;
  const VIVA_GREY = PDF_PALETTE.inkMuted;
  const VIVA_BORDER = PDF_PALETTE.border;
  const VIVA_NAVY_TINT = PDF_PALETTE.zebra;

  // ── Header — centred logo + navy banner + dark sub-band + contract row ─
  // Driven by renderPdfHeader's `style` config so the chrome stays in sync
  // with every other Servexa PDF.
  const ref = jobInfo?.reference_number || "";
  const contractName = jobInfo?.customers?.name || jobInfo?.customer || jobInfo?.name || "";
  const logoUrl = jobInfo?.customers?.logo_url
    ? jobInfo.customers.logo_url
    : `${window.location.origin}/images/vivafire-logo-new.jpg`;

  let y = await renderPdfHeader(
    doc,
    "", // title text unused — replaced by titleBands
    { logo_url: logoUrl },
    {
      customerName: "",
      siteName: "",
      siteAddress: "",
      refNumber: ref,
      dateVal: "",
      riserLocation: "",
    },
    null,
    null,
    {
      style: {
        logo: { topY: 8, maxW: 56, maxH: 20 },
        title: { hidden: true },
        titleStartY: 32,
        separator: false,
        detailGrid: false,
        titleBands: [
          {
            text: "DRY RISER SYSTEM — PRE-START CHECK LIST",
            fontSize: 13,
            height: 11,
            fillColor: VIVA_NAVY,
            textColor: [255, 255, 255],
            gapBelow: 0,
          },
          {
            text: "WET & DRY RISER SPECIALISTS",
            fontSize: 7.5,
            height: 4.5,
            fillColor: VIVA_DARK,
            textColor: [255, 255, 255],
            gapBelow: 4,
          },
        ],
        customRows: [
          {
            height: 9,
            fillColor: PDF_PALETTE.zebra,
            cells: [
              {
                widthFraction: 0.5,
                label: { text: "CONTRACT NO.", color: VIVA_GREY },
                value: { text: ref, color: VIVA_DARK, bold: true },
              },
              {
                widthFraction: 0.5,
                label: { text: "CONTRACT NAME", color: VIVA_GREY },
                value: { text: contractName, color: VIVA_DARK, bold: true },
              },
            ],
            gapBelow: 3,
          },
        ],
      },
    }
  );


  // ── Site address row ─────────────────────────────────────────────────
  const siteAddr = [
    jobInfo?.site?.name,
    jobInfo?.site?.address || jobInfo?.address,
    jobInfo?.site?.postcode,
  ].filter(Boolean).join(", ");

  if (siteAddr) {
    doc.setFillColor(...PDF_PALETTE.zebra);
    doc.rect(ml, y, cw, 7, "FD");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...VIVA_GREY);
    doc.text("SITE", ml + 2, y + 3);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...VIVA_DARK);
    doc.setFontSize(8.5);
    const addrLines = doc.splitTextToSize(siteAddr, cw - 18);
    doc.text(addrLines, ml + 16, y + 4.5);
    y += Math.max(7, addrLines.length * 4 + 2) + 4;
  }

  // ── Section helpers ───────────────────────────────────────────────────
  const INITIAL_COL_W = 22;
  const SECTION_HEADER_H = 5.5;
  const ROW_COUNT = 9 + 4 + 7;
  const FOOTER_SAFE_TOP = ph - 56;
  const SECTION_GAP = 2;
  const uniformRowH = Math.max(
    6.6,
    Math.min(7.4, (FOOTER_SAFE_TOP - y - SECTION_HEADER_H * 3 - SECTION_GAP * 3) / ROW_COUNT)
  );

  const fitSingleLineFont = (text: string, maxWidth: number, preferred: number, min: number) => {
    let size = preferred;
    doc.setFontSize(size);
    while (size > min && doc.getTextWidth(text) > maxWidth) {
      size -= 0.2;
      doc.setFontSize(size);
    }
    return size;
  };

  const sectionHeader = (title: string, withInitialCol = true) => {
    doc.setFillColor(...VIVA_NAVY);
      doc.rect(ml, y, cw, SECTION_HEADER_H, "F");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
      doc.text(title.toUpperCase(), ml + 2, y + 3.9);
    if (withInitialCol) {
      // Divider + right-aligned column title
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.3);
        doc.line(mr - INITIAL_COL_W, y, mr - INITIAL_COL_W, y + SECTION_HEADER_H);
      doc.setFontSize(7.5);
      doc.text("CHECK & INITIAL", mr - INITIAL_COL_W / 2, y + 3.9, { align: "center" });
    }
      y += SECTION_HEADER_H;
  };

  let altRow = false;
  const checkRow = (label: string) => {
    const h = uniformRowH;
    if (altRow) {
      doc.setFillColor(...VIVA_NAVY_TINT);
      doc.rect(ml, y, cw, h, "F");
    }
    altRow = !altRow;
    doc.setDrawColor(...VIVA_BORDER);
    doc.setLineWidth(0.2);
    // Label cell (left)
    doc.rect(ml, y, cw - INITIAL_COL_W, h);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...VIVA_DARK);
    const fontSize = fitSingleLineFont(label, cw - INITIAL_COL_W - 4, 7.1, 5.6);
    doc.setFontSize(fontSize);
    doc.text(label, ml + 2, y + h / 2 + 1.1);
    // Initial box (right) — left blank for customer
    doc.rect(mr - INITIAL_COL_W, y, INITIAL_COL_W, h);
    y += h;
  };

  const freeTextRow = (label: string) => {
    const h = uniformRowH;
    if (altRow) {
      doc.setFillColor(...VIVA_NAVY_TINT);
      doc.rect(ml, y, cw, h, "F");
    }
    altRow = !altRow;
    doc.setDrawColor(...VIVA_BORDER);
    doc.setLineWidth(0.2);
    doc.rect(ml, y, cw, h);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...VIVA_DARK);
    const fontSize = fitSingleLineFont(label, cw - 4, 7, 5.4);
    doc.setFontSize(fontSize);
    doc.text(label, ml + 2, y + h / 2 + 1.1);
    y += h;
  };

  // ── PRE-START REQUIREMENTS ─────────────────────────────────────────────
  altRow = false;
  sectionHeader("Pre-start requirements");
  checkRow("Is the inlet (external) cabinet opening formed 605mm (H) × 405mm (W) × 300mm (D)?");
  checkRow("The bottom edge of the opening needs to be between 400–600mm above external FFL");
  checkRow("If no to question 1 please send external wall details/drawings to info@vivafire.co.uk");
  checkRow("Are all core holes at least 150mm diameter?");
  checkRow("Are all core holes at least 130mm centre off any walls or ceilings?");
  checkRow("What is the floor to ceiling height where the horizontal pipe run will be routed?");
  checkRow("What is the pipe centre off the finished floor of the horizontal pipe run?");
  checkRow("Are all routes clear of materials and scaffolds to allow access?");
  checkRow("Please send images of core holes and pipe run route when returning checklist.");
  y += SECTION_GAP;

  // ── TESTING / COMMISSIONING ────────────────────────────────────────────
  altRow = false;
  sectionHeader("Testing / Commissioning");
  checkRow("Is water available on site close to the inlet locations?");
  checkRow("Can the testing vehicle get within 10m of the inlet locations?");
  checkRow("Are there any restrictions on commissioning between 8am – 16:00pm? *");
  checkRow("Will an extra commissioning test be required for building control to witness? (If so there will be an extra charge of £150 per system)");
  y += SECTION_GAP;

  // ── ACCOUNTS DETAILS ──────────────────────────────────────────────────
  altRow = false;
  sectionHeader("Accounts Details", false);
  [
    "We work on 30-day EOM payment terms — please state if your payment terms differ.",
    "Do you work on an application or invoice basis?",
    "Please give details of VAT on this project. (e.g. reverse charge / zero rated)",
    "Is retention applicable on this project — if so what percentage?",
    "When is the deadline for our application / invoice to be submitted?",
    "Please provide the email address and contact for our application / invoice to be sent to.",
    "Please provide your accounts address for any queries.",
  ].forEach((item) => freeTextRow(item));

  y += SECTION_GAP;

  // ── Bottom stack (anchored, no overlap) ──────────────────────────────
  // From bottom up: footer band (ph-14) → logos (ph-26) → accounts line (ph-32)
  //   → print name/date row (ph-40) → signature row (ph-50)
  const sigY = ph - 50;
  const row2Y = ph - 40;

  doc.setDrawColor(...VIVA_DARK);
  doc.setLineWidth(0.3);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...VIVA_DARK);

  // Signature — full-width row with room above the next line
  doc.text("Signature:", ml, sigY);
  doc.line(ml + 18, sigY + 0.5, mr, sigY + 0.5);

  // Print name + date row
  doc.text("Print Name:", ml, row2Y);
  doc.line(ml + 20, row2Y + 0.5, ml + 120, row2Y + 0.5);
  doc.text("Date:", ml + 128, row2Y);
  doc.line(ml + 140, row2Y + 0.5, mr, row2Y + 0.5);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...VIVA_GREY);
  doc.text("For any accounts queries please contact accounts@vivafire.co.uk", pw / 2, ph - 32, { align: "center" });

  // Accreditation logos + watermark applied via the unified branding overlay.
  // accredFooterY = top edge of the navy footer band; the helper subtracts
  // logo height + gap internally to land the strip above the footer.
  //
  // Read the org's saved watermark opacity explicitly here (instead of letting
  // the helper resolve it silently) so the source is auditable at the call
  // site, then merge any per-export override on top so the PDF preview dialog
  // can still deviate from the org default.
  const orgWatermarkSettings = await loadWatermarkSettings();
  const resolvedOverride: WatermarkOverride = {
    opacity: orgWatermarkSettings.opacity,
    ...(watermarkOverride ?? {}),
  };
  const footerBandTop = ph - 14 - 1; // matches `footerY - 1` used below for the navy strip
  await renderBrandingOverlay(doc, {
    watermark,
    accredLogos: logos,
    accredFooterY: footerBandTop,
    accredLogoH: PDF_DIMENSIONS.accredLogoH,
    override: resolvedOverride,
  });

  const footerY = ph - 14;
  doc.setFillColor(...VIVA_NAVY);
  doc.rect(ml, footerY - 1, cw, 0.8, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...VIVA_DARK);
  doc.text(
    "Viva Fire Protection Limited  ·  Unit 1 Lady Road, St Johns Industrial Estate, Lees, Oldham OL4 3DZ",
    pw / 2, footerY + 3, { align: "center" }
  );
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...VIVA_GREY);
  doc.text(
    "Company Reg No: 06464084  ·  Tel: 0845 269 8482  ·  sales@vivafire.co.uk  ·  www.vivafire.co.uk",
    pw / 2, footerY + 7, { align: "center" }
  );

  const base64 = doc.output("datauristring").split(",")[1];
  const fileName = `pre-start-checklist-${ref || "job"}.pdf`;
  return { base64, fileName };
}

export default function PreStartChecklistPdf({ jobInfo }: Props) {
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { base64, fileName } = await generatePreStartChecklistPdf(jobInfo);
      const byteArray = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast({ title: "Pre-start checklist opened", description: fileName });
    } catch {
      toast({ title: "Error generating PDF", variant: "destructive" });
    }
    setGenerating(false);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs px-2 gap-1 shrink-0"
      onClick={handleGenerate}
      disabled={generating}
    >
      {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
      Generate
    </Button>
  );
}
