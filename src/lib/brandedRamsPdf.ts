import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface BrandedRamsData {
  job_reference?: string | null;
  job_name?: string | null;
  site_name?: string | null;
  site_address?: string | null;
  client_name?: string | null;
  works_description?: string | null;
  factors?: Record<string, boolean>;
  risk_assessment?: Array<{
    hazard: string;
    who_at_risk: string;
    initial_risk_rating: string;
    control_measures: string;
    residual_risk_rating: string;
  }>;
  method_statement?: {
    sequence?: string[];
    ppe?: string[];
    plant_equipment?: string[];
    emergency_arrangements?: string;
    welfare_arrangements?: string;
  };
  status?: string;
  version?: number;
  prepared_by?: string | null;
  prepared_at?: string | null;
  reviewed_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
}

const FACTOR_LABELS: Record<string, string> = {
  working_at_height: "Working at height",
  hot_works: "Hot works",
  confined_space: "Confined space",
  asbestos_present: "Asbestos present",
  asbestos: "Asbestos present",
  live_systems: "Live / energised systems",
  occupied_building: "Occupied / public building",
  public_occupied: "Occupied / public building",
  lone_working: "Lone working",
  manual_handling: "Manual handling",
};

const BRAND = {
  primary: [180, 28, 28] as [number, number, number], // viva red
  dark: [33, 33, 33] as [number, number, number],
  light: [245, 245, 245] as [number, number, number],
};

async function loadLogo(): Promise<string | null> {
  try {
    const { getGeneratingOrgFallbackLogoUrl } = await import("@/lib/generatingOrgBranding");
    const url = await getGeneratingOrgFallbackLogoUrl();
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function ratingFill(rating: string): [number, number, number] | undefined {
  const r = (rating || "").toLowerCase();
  if (r === "high") return [254, 226, 226];
  if (r === "medium") return [254, 243, 199];
  if (r === "low") return [220, 252, 231];
  return undefined;
}

export async function generateBrandedRamsPdf(data: BrandedRamsData): Promise<{ blob: Blob; fileName: string }> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;

  const logo = await loadLogo();
  const { getGeneratingOrgBranding } = await import("@/lib/generatingOrgBranding");
  const g = await getGeneratingOrgBranding();
  const headerName = g.isViva ? "VIVA FIRE PROTECTION" : (g.name ?? "").toUpperCase();

  // ── HEADER ──
  // Red brand bar
  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, pageW, 64, "F");

  if (logo) {
    try { doc.addImage(logo, "JPEG", margin, 14, 110, 36); } catch { /* ignore */ }
  } else if (headerName) {
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(headerName, margin, 38);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Risk Assessment & Method Statement", pageW - margin, 30, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const statusLine = `${(data.status || "Draft").toUpperCase()} · v${data.version ?? 1}`;
  doc.text(statusLine, pageW - margin, 48, { align: "right" });

  let y = 84;
  doc.setTextColor(...BRAND.dark);

  // ── JOB & SITE BOX ──
  const jobSiteBody: any[] = [
    ["Job reference", data.job_reference || "—", "Client", data.client_name || "—"],
  ];
  if (data.site_name) {
    jobSiteBody.push(["Site", data.site_name, "Job", data.job_name || "—"]);
  } else if (data.job_name) {
    jobSiteBody.push(["Job", data.job_name, "", ""]);
  }
  jobSiteBody.push(["Site address", data.site_address || "—", "Issued", new Date().toLocaleDateString("en-GB")]);

  autoTable(doc, {
    startY: y,
    theme: "grid",
    body: jobSiteBody,
    styles: { fontSize: 9, cellPadding: 5, textColor: BRAND.dark },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: BRAND.light, cellWidth: 80 },
      1: { cellWidth: 180 },
      2: { fontStyle: "bold", fillColor: BRAND.light, cellWidth: 70 },
      3: { cellWidth: "auto" },
    },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  // ── DESCRIPTION ──
  sectionHeader(doc, "Description of Works", y, margin);
  y += 18;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const descLines = doc.splitTextToSize(data.works_description || "—", pageW - margin * 2);
  doc.text(descLines, margin, y);
  y += descLines.length * 12 + 10;

  // ── FACTORS ──
  const activeFactors = Object.entries(data.factors || {})
    .filter(([, v]) => v).map(([k]) => FACTOR_LABELS[k] || k);
  if (activeFactors.length) {
    sectionHeader(doc, "Identified Risk Factors", y, margin);
    y += 18;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    const f = doc.splitTextToSize(activeFactors.join("  •  "), pageW - margin * 2);
    doc.text(f, margin, y);
    y += f.length * 12 + 10;
  }

  // ── RISK ASSESSMENT TABLE ──
  if (y > pageH - 160) { doc.addPage(); y = margin; }
  sectionHeader(doc, "Risk Assessment", y, margin);
  y += 12;

  const riskBody = (data.risk_assessment || []).map((r) => [
    r.hazard || "",
    r.who_at_risk || "",
    r.initial_risk_rating || "",
    r.control_measures || "",
    r.residual_risk_rating || "",
  ]);

  autoTable(doc, {
    startY: y + 4,
    head: [["Hazard", "Who is at risk", "Initial", "Control measures", "Residual"]],
    body: riskBody.length ? riskBody : [["—", "—", "—", "—", "—"]],
    styles: { fontSize: 8.5, cellPadding: 5, valign: "top", textColor: BRAND.dark },
    headStyles: { fillColor: BRAND.primary, textColor: 255, fontStyle: "bold", halign: "left" },
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 80 },
      2: { cellWidth: 46, halign: "center", fontStyle: "bold" },
      3: { cellWidth: "auto" },
      4: { cellWidth: 46, halign: "center", fontStyle: "bold" },
    },
    didParseCell: (hookData) => {
      if (hookData.section !== "body") return;
      if (hookData.column.index === 2) {
        const fill = ratingFill(String(hookData.cell.raw ?? ""));
        if (fill) hookData.cell.styles.fillColor = fill;
      }
      if (hookData.column.index === 4) {
        const fill = ratingFill(String(hookData.cell.raw ?? ""));
        if (fill) hookData.cell.styles.fillColor = fill;
      }
    },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 18;

  // ── METHOD STATEMENT ──
  if (y > pageH - 160) { doc.addPage(); y = margin; }
  sectionHeader(doc, "Method Statement", y, margin);
  y += 18;

  const ms = data.method_statement || {};
  y = listSection(doc, "Sequence of Works", ms.sequence || [], y, margin, pageW, pageH, true);
  y = listSection(doc, "PPE Required", ms.ppe || [], y, margin, pageW, pageH, false);
  y = listSection(doc, "Plant & Equipment", ms.plant_equipment || [], y, margin, pageW, pageH, false);
  y = textSection(doc, "Emergency Arrangements", ms.emergency_arrangements || "—", y, margin, pageW, pageH);
  y = textSection(doc, "Welfare Arrangements", ms.welfare_arrangements || "—", y, margin, pageW, pageH);

  // ── SIGN-OFF BOX ──
  if (y > pageH - 150) { doc.addPage(); y = margin; }
  sectionHeader(doc, "Document Sign-Off", y, margin);
  y += 12;
  autoTable(doc, {
    startY: y + 4,
    head: [["Role", "Name", "Date"]],
    body: [
      ["Prepared by", data.prepared_by || "—", data.prepared_at ? new Date(data.prepared_at).toLocaleDateString("en-GB") : "—"],
      ["Reviewed by", data.reviewed_by || "—", "—"],
      ["Approved by", data.approved_by || "—", data.approved_at ? new Date(data.approved_at).toLocaleDateString("en-GB") : "—"],
    ],
    styles: { fontSize: 10, cellPadding: 8, minCellHeight: 36, valign: "middle", textColor: BRAND.dark },
    headStyles: { fillColor: BRAND.dark, textColor: 255 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 110, fillColor: BRAND.light }, 2: { cellWidth: 100 } },
    margin: { left: margin, right: margin },
  });

  // ── FOOTER ON EVERY PAGE ──
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BRAND.primary);
    doc.setLineWidth(1.5);
    doc.line(margin, pageH - 30, pageW - margin, pageH - 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Viva Fire Protection · RAMS v${data.version ?? 1}`, margin, pageH - 16);
    doc.text(`${(data.status || "Draft").toUpperCase()}`, pageW / 2, pageH - 16, { align: "center" });
    doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 16, { align: "right" });
  }

  const blob = doc.output("blob");
  const safe = (s?: string | null) => (s || "rams").replace(/[^a-z0-9-]+/gi, "_");
  const fileName = `RAMS_${safe(data.job_reference || data.site_name)}_v${data.version ?? 1}.pdf`;
  return { blob, fileName };
}

function sectionHeader(doc: jsPDF, title: string, y: number, margin: number) {
  doc.setFillColor(...BRAND.primary);
  doc.rect(margin, y, 4, 14, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...BRAND.dark);
  doc.text(title, margin + 10, y + 11);
}

function listSection(
  doc: jsPDF, title: string, items: string[], y: number,
  margin: number, pageW: number, pageH: number, numbered: boolean,
): number {
  if (!items.length) return y;
  if (y > pageH - 80) { doc.addPage(); y = margin; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...BRAND.dark);
  doc.text(title, margin, y);
  autoTable(doc, {
    startY: y + 6,
    body: items.map((s, i) => [numbered ? `${i + 1}.` : "•", s]),
    styles: { fontSize: 9.5, cellPadding: 4, textColor: BRAND.dark },
    columnStyles: { 0: { cellWidth: 22, fontStyle: "bold", halign: "right" } },
    theme: "plain",
    margin: { left: margin, right: margin },
  });
  return (doc as any).lastAutoTable.finalY + 12;
}

function textSection(
  doc: jsPDF, title: string, text: string, y: number,
  margin: number, pageW: number, pageH: number,
): number {
  if (!text || text === "—") return y;
  if (y > pageH - 80) { doc.addPage(); y = margin; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...BRAND.dark);
  doc.text(title, margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(text, pageW - margin * 2);
  doc.text(lines, margin, y);
  return y + lines.length * 12 + 8;
}
