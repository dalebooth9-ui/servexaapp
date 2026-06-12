import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface GenericRamsData {
  contract_name?: string | null;
  site_name?: string | null;
  client?: string | null;
  description?: string | null;
  factors?: Record<string, boolean>;
  risk_rows?: Array<{ hazard: string; who_at_risk: string; l_pre: number; s_pre: number; controls: string; l_post: number; s_post: number }>;
  sequence_of_works?: string[];
  ppe?: string[];
  plant_equipment?: string[];
  emergency_arrangements?: string | null;
  status?: string;
  approved_at?: string | null;
}

const FACTOR_LABELS: Record<string, string> = {
  working_at_height: "Working at height",
  hot_works: "Hot works",
  confined_space: "Confined space",
  asbestos: "Asbestos present",
  live_systems: "Live systems / isolation required",
  public_occupied: "Public / occupied building",
};

export function generateGenericRamsPdf(data: GenericRamsData, jobRef?: string): { blob: Blob; fileName: string } {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Risk Assessment & Method Statement", margin, y);
  y += 22;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const meta = [
    ["Contract / Job", data.contract_name || "—"],
    ["Site", data.site_name || "—"],
    ["Client", data.client || "—"],
    ["Status", (data.status || "draft").toUpperCase()],
    ["Job Ref", jobRef || "—"],
    ["Generated", new Date().toLocaleDateString("en-GB")],
  ];
  autoTable(doc, {
    startY: y,
    body: meta,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 90 } },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  // Description
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Description of Works", margin, y); y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const descLines = doc.splitTextToSize(data.description || "—", pageW - margin * 2);
  doc.text(descLines, margin, y); y += descLines.length * 12 + 8;

  // Factors
  const activeFactors = Object.entries(data.factors || {})
    .filter(([, v]) => v).map(([k]) => FACTOR_LABELS[k] || k);
  if (activeFactors.length) {
    doc.setFont("helvetica", "bold"); doc.text("Risk Factors", margin, y); y += 14;
    doc.setFont("helvetica", "normal");
    const f = doc.splitTextToSize(activeFactors.join(" • "), pageW - margin * 2);
    doc.text(f, margin, y); y += f.length * 12 + 8;
  }

  // Risk Assessment table
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Risk Assessment", margin, y); y += 6;
  const riskBody = (data.risk_rows || []).map((r) => [
    r.hazard, r.who_at_risk,
    `${r.l_pre}×${r.s_pre}=${r.l_pre * r.s_pre}`,
    r.controls,
    `${r.l_post}×${r.s_post}=${r.l_post * r.s_post}`,
  ]);
  autoTable(doc, {
    startY: y + 4,
    head: [["Hazard", "Who at Risk", "Pre L×S", "Controls", "Post L×S"]],
    body: riskBody,
    styles: { fontSize: 8, cellPadding: 4, valign: "top" },
    headStyles: { fillColor: [40, 80, 140], textColor: 255 },
    columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 70 }, 2: { cellWidth: 48 }, 3: { cellWidth: "auto" }, 4: { cellWidth: 48 } },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  const section = (title: string, items: string[]) => {
    if (y > 720) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(title, margin, y); y += 6;
    autoTable(doc, {
      startY: y + 4,
      body: (items || []).map((s, i) => [String(i + 1), s]),
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 24, fontStyle: "bold" } },
      theme: "striped",
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  };

  section("Method Statement — Sequence of Works", data.sequence_of_works || []);
  section("PPE Required", data.ppe || []);
  section("Plant & Equipment", data.plant_equipment || []);

  if (y > 700) { doc.addPage(); y = margin; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Emergency Arrangements", margin, y); y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const emLines = doc.splitTextToSize(data.emergency_arrangements || "—", pageW - margin * 2);
  doc.text(emLines, margin, y);

  const blob = doc.output("blob");
  const fileName = `RAMS-${(data.contract_name || jobRef || "draft").replace(/[^a-z0-9-]+/gi, "_")}.pdf`;
  return { blob, fileName };
}
