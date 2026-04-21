import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { loadWatermarkImage, addWatermarkToAllPages } from "@/lib/pdfWatermark";
import { fetchCustomerAccreditationLogos, loadAccreditationLogos, renderAccreditationLogos } from "@/lib/pdfAccreditations";

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

export async function generatePreStartChecklistPdf(jobInfo: PreStartJobInfo | null): Promise<{ base64: string; fileName: string }> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 14;
  const mr = pw - 14;
  const cw = mr - ml;

  const custAccredUrls = await fetchCustomerAccreditationLogos(jobInfo?.customers?.name || jobInfo?.customer);
  const [watermark, logos] = await Promise.all([
    loadWatermarkImage(),
    loadAccreditationLogos(custAccredUrls),
  ]);
  if (watermark) addWatermarkToAllPages(doc, watermark);

  // ── Logo ────────────────────────────────────────────────────────────
  try {
    const logoUrl = jobInfo?.customers?.logo_url
      ? jobInfo.customers.logo_url
      : `${window.location.origin}/images/vivafire-logo-new.jpg`;
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    const reader = new FileReader();
    const logoBase64 = await new Promise<string>((resolve) => {
      reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
      reader.readAsDataURL(blob);
    });
    const fmt = logoUrl.toLowerCase().endsWith(".png") ? "PNG" : "JPEG";
    doc.addImage(logoBase64, fmt, pw / 2 - 28, 8, 56, 20);
  } catch {}

  // Viva brand colours (matches RAMS / job sheets)
  // Viva logo blue (brighter, matches the flame mark)
  const VIVA_NAVY: [number, number, number] = [29, 91, 165];
  const VIVA_DARK: [number, number, number] = [33, 37, 41];
  const VIVA_GREY: [number, number, number] = [110, 117, 125];
  const VIVA_BORDER: [number, number, number] = [200, 200, 200];
  const VIVA_NAVY_TINT: [number, number, number] = [229, 238, 250];

  let y = 32;

  // ── Title bar (Viva navy) ─────────────────────────────────────────────
  doc.setFillColor(...VIVA_NAVY);
  doc.rect(ml, y, cw, 11, "F");
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("DRY RISER SYSTEM — PRE-START CHECK LIST", pw / 2, y + 7.2, { align: "center" });
  y += 11;

  doc.setFillColor(...VIVA_DARK);
  doc.rect(ml, y, cw, 4.5, "F");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("WET & DRY RISER SPECIALISTS", pw / 2, y + 3.2, { align: "center" });
  y += 4.5 + 4;

  // ── Contract details table ─────────────────────────────────────────────
  const halfW = cw / 2;
  doc.setLineWidth(0.3);
  doc.setDrawColor(...VIVA_BORDER);

  const rowH = 9;
  doc.setFillColor(248, 248, 248);
  doc.rect(ml, y, halfW, rowH, "FD");
  doc.rect(ml + halfW, y, halfW, rowH, "FD");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...VIVA_GREY);
  doc.text("CONTRACT NO.", ml + 2, y + 3.2);
  doc.text("CONTRACT NAME", ml + halfW + 2, y + 3.2);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...VIVA_DARK);
  doc.setFontSize(9);
  const ref = jobInfo?.reference_number || "";
  const contractName = jobInfo?.customers?.name || jobInfo?.customer || jobInfo?.name || "";
  doc.text(ref, ml + 2, y + 7.5);
  doc.text(contractName, ml + halfW + 2, y + 7.5);
  y += rowH + 3;

  // ── Site address row ─────────────────────────────────────────────────
  const siteAddr = [
    jobInfo?.site?.name,
    jobInfo?.site?.address || jobInfo?.address,
    jobInfo?.site?.postcode,
  ].filter(Boolean).join(", ");

  if (siteAddr) {
    doc.setFillColor(248, 248, 248);
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

  const sectionHeader = (title: string, withInitialCol = true) => {
    doc.setFillColor(...VIVA_NAVY);
    doc.rect(ml, y, cw, 5.5, "F");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), ml + 2, y + 3.9);
    if (withInitialCol) {
      // Divider + right-aligned column title
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.3);
      doc.line(mr - INITIAL_COL_W, y, mr - INITIAL_COL_W, y + 5.5);
      doc.setFontSize(7.5);
      doc.text("CHECK & INITIAL", mr - INITIAL_COL_W / 2, y + 3.9, { align: "center" });
    }
    y += 5.5;
  };

  let altRow = false;
  const checkRow = (label: string, tall = false) => {
    const h = tall ? 11 : 7;
    if (altRow) {
      doc.setFillColor(...VIVA_NAVY_TINT);
      doc.rect(ml, y, cw, h, "F");
    }
    altRow = !altRow;
    doc.setDrawColor(...VIVA_BORDER);
    doc.setLineWidth(0.2);
    // Label cell (left)
    doc.rect(ml, y, cw - INITIAL_COL_W, h);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...VIVA_DARK);
    const labelLines = doc.splitTextToSize(label, cw - INITIAL_COL_W - 4);
    doc.text(labelLines, ml + 2, y + (tall ? 4 : 4.3));
    // Initial box (right) — left blank for customer
    doc.rect(mr - INITIAL_COL_W, y, INITIAL_COL_W, h);
    y += h;
  };

  const freeTextRow = (label: string) => {
    const h = 9;
    if (altRow) {
      doc.setFillColor(...VIVA_NAVY_TINT);
      doc.rect(ml, y, cw, h, "F");
    }
    altRow = !altRow;
    doc.setDrawColor(...VIVA_BORDER);
    doc.setLineWidth(0.2);
    doc.rect(ml, y, cw, h);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...VIVA_DARK);
    const labelLines = doc.splitTextToSize(label, cw - 4);
    doc.text(labelLines, ml + 2, y + 3.6);
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
  checkRow("What is the floor to ceiling height where the horizontal pipe run will be routed?", true);
  checkRow("What is the pipe centre off the finished floor of the horizontal pipe run?", true);
  checkRow("Are all routes clear of materials and scaffolds to allow access?");
  checkRow("Please send images of core holes and pipe run route when returning checklist.");
  y += 2.5;

  // ── TESTING / COMMISSIONING ────────────────────────────────────────────
  altRow = false;
  sectionHeader("Testing / Commissioning");
  checkRow("Is water available on site close to the inlet locations?");
  checkRow("Can the testing vehicle get within 10m of the inlet locations?");
  checkRow("Are there any restrictions on commissioning between 8am – 16:00pm? *");
  checkRow("Will an extra commissioning test be required for building control to witness? (If so there will be an extra charge of £150 per system)", true);
  y += 2.5;

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

  y += 4;

  // ── BS note ──────────────────────────────────────────────────────────
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...VIVA_GREY);
  const bsNote = "*Testing is carried out in accordance with BS 9990:2015 and comprises a visual inspection of the entire system and a hydraulic pressure test to 12 Bar at the inlet for 15 minutes.";
  const bsLines = doc.splitTextToSize(bsNote, cw);
  doc.text(bsLines, ml, y);
  y += bsLines.length * 3.4 + 4;

  // ── Sign-off line (anchored above footer) ─────────────────────────────
  const sigY = ph - 30;
  doc.setDrawColor(...VIVA_DARK);
  doc.setLineWidth(0.3);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...VIVA_DARK);
  doc.text("Signed:", ml, sigY);
  doc.line(ml + 14, sigY + 0.5, ml + 70, sigY + 0.5);
  doc.text("Print Name:", ml + 76, sigY);
  doc.line(ml + 96, sigY + 0.5, ml + 145, sigY + 0.5);
  doc.text("Date:", ml + 151, sigY);
  doc.line(ml + 161, sigY + 0.5, mr, sigY + 0.5);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...VIVA_GREY);
  doc.text("For any accounts queries please contact accounts@vivafire.co.uk", pw / 2, sigY + 6, { align: "center" });

  // ── Accreditation logos & footer ──────────────────────────────────────
  const footerY = ph - 14;
  const logoH = 10;
  renderAccreditationLogos(doc, logos, footerY - logoH - 3, logoH);

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
