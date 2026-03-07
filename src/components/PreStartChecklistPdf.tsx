import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { loadWatermarkImage, addWatermarkToAllPages } from "@/lib/pdfWatermark";
import { loadAccreditationLogos, renderAccreditationLogos } from "@/lib/pdfAccreditations";

export type PreStartJobInfo = {
  name?: string | null;
  address?: string | null;
  reference_number?: string;
  customer?: string | null;
  customers?: { name?: string | null } | null;
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

  const [watermark, logos] = await Promise.all([
    loadWatermarkImage(),
    loadAccreditationLogos(),
  ]);
  if (watermark) addWatermarkToAllPages(doc, watermark);

  // ── Logo ────────────────────────────────────────────────────────────
  try {
    const logoUrl = `${window.location.origin}/images/vivafire-logo-new.jpg`;
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    const reader = new FileReader();
    const logoBase64 = await new Promise<string>((resolve) => {
      reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
      reader.readAsDataURL(blob);
    });
    doc.addImage(logoBase64, "JPEG", pw / 2 - 28, 8, 56, 20);
  } catch {}

  let y = 34;

  // ── Title ─────────────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("Wet & Dry Riser Specialists", pw / 2, y, { align: "center" });
  y += 6;

  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 20, 20);
  doc.text("Dry Riser System Pre-start Check List", pw / 2, y, { align: "center" });
  y += 4;

  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(0.6);
  doc.line(ml, y, mr, y);
  y += 6;

  // ── Contract details table ─────────────────────────────────────────────
  const halfW = cw / 2;
  doc.setLineWidth(0.3);
  doc.setDrawColor(160, 160, 160);

  // Row: Contract No. | Contract Name
  const rowH = 9;
  doc.rect(ml, y, halfW, rowH);
  doc.rect(ml + halfW, y, halfW, rowH);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 80);
  doc.text("Contract No.", ml + 2, y + 3.5);
  doc.text("Contract Name", ml + halfW + 2, y + 3.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(9);
  const ref = jobInfo?.reference_number || "";
  const contractName = jobInfo?.customers?.name || jobInfo?.customer || jobInfo?.name || "";
  doc.text(ref, ml + 2, y + 7.5);
  doc.text(contractName, ml + halfW + 2, y + 7.5);
  y += rowH + 5;

  // ── Site address ─────────────────────────────────────────────────────
  const siteAddr = [
    jobInfo?.site?.name,
    jobInfo?.site?.address || jobInfo?.address,
    jobInfo?.site?.postcode,
  ].filter(Boolean).join(", ");

  if (siteAddr) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text("Site:", ml, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20, 20, 20);
    const addrLines = doc.splitTextToSize(siteAddr, cw - 12);
    doc.text(addrLines, ml + 10, y);
    y += addrLines.length * 4.5 + 4;
  }

  // ── Section helper ─────────────────────────────────────────────────────
  const sectionHeader = (title: string) => {
    doc.setFillColor(30, 30, 30);
    doc.rect(ml, y, cw, 6, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(title, ml + 2, y + 4.2);
    doc.setTextColor(20, 20, 20);
    y += 6;
  };

  const checkRow = (label: string, tall = false) => {
    const h = tall ? 14 : 7;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.25);
    // Check box
    doc.rect(ml, y, 10, h);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text("Check &", ml + 1, y + (tall ? 4 : 2.8));
    doc.text("Initial", ml + 1, y + (tall ? 8 : 5.5));
    // Label cell
    doc.rect(ml + 10, y, cw - 10, h);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20, 20, 20);
    const labelLines = doc.splitTextToSize(label, cw - 14);
    doc.text(labelLines, ml + 12, y + (tall ? 4 : 4));
    y += h;
  };

  const freeTextRow = (label: string, rowCount = 1) => {
    const h = 6 * rowCount;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.25);
    doc.rect(ml, y, cw, h);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 20, 20);
    doc.text(label, ml + 2, y + 4.5);
    y += h;
  };

  // ── PRE-START REQUIREMENTS ─────────────────────────────────────────────
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

  y += 3;

  // ── TESTING / COMMISSIONING ────────────────────────────────────────────
  sectionHeader("Testing / Commissioning");

  const tcItems = [
    "Is water available on site close to the inlet locations?",
    "Can the testing vehicle get within 10m of the inlet locations?",
    "Are there any restrictions on commissioning between 8am – 16:00pm? *",
    "Will an extra commissioning test be required for building control to witness?\n(If so there will be an extra charge of £150 per system)",
  ];
  tcItems.forEach((item) => checkRow(item, item.includes("\n")));

  y += 3;

  // ── ACCOUNTS DETAILS ──────────────────────────────────────────────────
  sectionHeader("Accounts Details");

  const accountItems = [
    "We work on 30-day EOM payment terms – please state if your payment terms differ.",
    "Do you work on an application or invoice basis?",
    "Please give details of VAT on this project. (e.g. reverse charge / zero rated)",
    "Is retention applicable on this project – if so what percentage?",
    "When is the deadline for our application / invoice to be submitted?",
    "Please provide the email address and contact for our application / invoice to be sent to.",
    "Please provide your accounts address for any queries.",
  ];
  accountItems.forEach((item) => freeTextRow(item, 2));

  y += 4;

  // ── Comments box ──────────────────────────────────────────────────────
  const commentsAvail = Math.min(ph - y - 52, 28);
  if (commentsAvail > 8) {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 20, 20);
    doc.text("Comments:", ml, y + 4);
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.25);
    doc.rect(ml, y + 5, cw, commentsAvail);
    y += commentsAvail + 7;
  }

  // ── BS note ──────────────────────────────────────────────────────────
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(80, 80, 80);
  const bsNote = "*Testing is carried out in accordance with BS 9990:2015 and comprises a visual inspection of the entire system, a hydraulic pressure test to 12 Bar at the inlet, for 15 minutes.";
  const bsLines = doc.splitTextToSize(bsNote, cw);
  doc.text(bsLines, ml, y);
  y += bsLines.length * 4 + 4;

  // ── Sign-off line ─────────────────────────────────────────────────────
  const sigY = ph - 46;
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(20, 20, 20);
  doc.text("Signed _______________________________   Print _______________________________   Date: _______________", ml, sigY);

  // ── Accounts contact ─────────────────────────────────────────────────
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  doc.text("For any accounts queries please contact accounts@vivafire.co.uk", pw / 2, sigY + 6, { align: "center" });

  // ── Accreditation logos & footer ──────────────────────────────────────
  const footerY = ph - 18;
  const logoH = 12;
  renderAccreditationLogos(doc, logos, footerY - logoH - 4, logoH);

  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.4);
  doc.line(ml, footerY - 2, mr, footerY - 2);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(
    "Viva Fire Protection Limited, Unit 1 Lady Road, St Johns Industrial Estate, Lees, Oldham OL4 3DZ",
    pw / 2, footerY + 2, { align: "center" }
  );
  doc.text(
    "Company Reg No: 06464084   Tel: 0845 269 8482   sales@vivafire.co.uk   www.vivafire.co.uk",
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
