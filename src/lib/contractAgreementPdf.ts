import jsPDF from "jspdf";
import { getGeneratingOrgBranding, getGeneratingOrgFallbackLogoUrl } from "@/lib/generatingOrgBranding";
import { resolveToSignedUrl } from "@/lib/durableStorageRef";
import type { ContractClause } from "@/lib/contractTemplates";

export interface AgreementPdfInput {
  reference: string;
  title: string;
  customerName: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  totalValue?: number;
  clauses: ContractClause[];
  signerName?: string | null;
  signerRole?: string | null;
  signedAt?: string | null;
  signatureData?: string | null;
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  try {
    const src = await resolveToSignedUrl(url);
    if (!src) return null;
    return await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  } catch {
    return null;
  }
}

const ukDate = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-GB");
};

/** Branded service agreement PDF. Renders only the stored, org-approved
 *  wording plus the structured details — nothing is generated here. */
export async function generateAgreementPdf(input: AgreementPdfInput): Promise<{ blob: Blob; fileName: string }> {
  const branding = await getGeneratingOrgBranding().catch(() => null);
  const providerName = branding?.name || "";
  const logoUrl = await getGeneratingOrgFallbackLogoUrl().catch(() => "");
  const logo = logoUrl ? await loadImage(logoUrl) : null;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentW = pageW - margin * 2;
  let y = margin;

  const newPageIfNeeded = (needed: number) => {
    if (y + needed > pageH - margin - 12) {
      doc.addPage();
      y = margin;
    }
  };

  if (logo) {
    const maxW = 45;
    const maxH = 20;
    const ratio = Math.min(maxW / logo.width, maxH / logo.height);
    const w = logo.width * ratio;
    const h = logo.height * ratio;
    try {
      doc.addImage(logo, "PNG", margin, y, w, h);
    } catch { /* logo optional */ }
    y += h + 4;
  } else if (providerName) {
    doc.setFont("helvetica", "bold").setFontSize(14).text(providerName, margin, y + 5);
    y += 12;
  }

  doc.setFont("helvetica", "bold").setFontSize(16);
  doc.text(input.title || "Service agreement", margin, y + 4);
  y += 10;

  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
  const metaLines = [
    `Reference: ${input.reference}`,
    `Customer: ${input.customerName}`,
    `Term: ${ukDate(input.startDate)} to ${ukDate(input.endDate)}`,
    typeof input.totalValue === "number"
      ? `Annual value: £${Number(input.totalValue).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "",
    `Status: ${input.status}`,
  ].filter(Boolean);
  metaLines.forEach((line) => {
    doc.text(line, margin, y);
    y += 4.5;
  });
  doc.setTextColor(0);
  y += 3;
  doc.setDrawColor(200).line(margin, y, pageW - margin, y);
  y += 7;

  for (const clause of input.clauses || []) {
    if (clause.heading) {
      newPageIfNeeded(12);
      doc.setFont("helvetica", "bold").setFontSize(11);
      doc.text(clause.heading, margin, y);
      y += 5.5;
    }
    doc.setFont("helvetica", "normal").setFontSize(10);
    const paragraphs = String(clause.text || "").split(/\n/);
    for (const para of paragraphs) {
      const lines = doc.splitTextToSize(para || " ", contentW) as string[];
      for (const line of lines) {
        newPageIfNeeded(6);
        doc.text(line, margin, y);
        y += 5;
      }
    }
    y += 4;
  }

  // Signature block
  newPageIfNeeded(45);
  y += 4;
  doc.setDrawColor(200).line(margin, y, pageW - margin, y);
  y += 7;
  doc.setFont("helvetica", "bold").setFontSize(11).text("Client acceptance", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal").setFontSize(10);

  if (input.signatureData) {
    try {
      doc.addImage(input.signatureData, "PNG", margin, y, 60, 22);
    } catch { /* signature optional */ }
    y += 25;
    doc.text(`Signed by: ${input.signerName || "—"}${input.signerRole ? ` (${input.signerRole})` : ""}`, margin, y);
    y += 5;
    doc.text(`Date: ${ukDate(input.signedAt)}`, margin, y);
  } else {
    doc.setDrawColor(120);
    doc.line(margin, y + 16, margin + 70, y + 16);
    doc.line(margin + 90, y + 16, margin + 150, y + 16);
    doc.setFontSize(8).setTextColor(110);
    doc.text("Signature", margin, y + 20);
    doc.text("Date", margin + 90, y + 20);
    doc.setTextColor(0).setFontSize(10);
    y += 24;
  }

  const fileName = `${input.reference || "agreement"}-${(input.customerName || "customer").replace(/[^a-z0-9]+/gi, "-")}.pdf`;
  return { blob: doc.output("blob"), fileName };
}
