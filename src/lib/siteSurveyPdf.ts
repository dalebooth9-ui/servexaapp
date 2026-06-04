import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

type Survey = {
  reference_number: string | null;
  title: string;
  status: string;
  survey_date: string | null;
  site_address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  access_notes: string | null;
  hazards: string | null;
  asset_locations: string | null;
  parking_welfare: string | null;
  recommendations: string | null;
  notes: string | null;
};

type PhotoRow = { file_path: string; kind: string; what3words: string | null; captured_at: string };

const BUCKET = "site-survey-media";

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  try {
    return await new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = url;
    });
  } catch { return null; }
}

export async function exportSiteSurveyPdf(survey: Survey, surveyId: string): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = margin;

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Site Survey Report", margin, 14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(survey.reference_number || "", pageW - margin, 14, { align: "right" });
  y = 30;

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(survey.title || "Site survey", margin, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  const meta = [
    survey.survey_date ? `Date: ${survey.survey_date}` : null,
    `Status: ${survey.status}`,
    survey.contact_name ? `Contact: ${survey.contact_name}` : null,
    survey.contact_phone ? `Tel: ${survey.contact_phone}` : null,
  ].filter(Boolean).join("   •   ");
  doc.text(meta, margin, y);
  y += 5;
  if (survey.site_address) {
    doc.text(`Site: ${survey.site_address}`, margin, y);
    y += 6;
  }

  doc.setDrawColor(220);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  const section = (label: string, body: string | null) => {
    if (!body?.trim()) return;
    const need = 14;
    if (y + need > pageH - margin) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(label, margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    const lines = doc.splitTextToSize(body.trim(), pageW - margin * 2) as string[];
    for (const line of lines) {
      if (y > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += 4.6;
    }
    y += 3;
  };

  section("Site access", survey.access_notes);
  section("Hazards", survey.hazards);
  section("Asset locations", survey.asset_locations);
  section("Parking & welfare", survey.parking_welfare);
  section("Recommendations / scope", survey.recommendations);
  section("Additional notes", survey.notes);

  // Photos
  const { data: photos } = await supabase
    .from("site_survey_photos" as any)
    .select("file_path, kind, what3words, captured_at")
    .eq("survey_id", surveyId)
    .order("captured_at");

  const rows = ((photos as unknown) as PhotoRow[] | null) || [];
  if (rows.length) {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(rows.map((r) => r.file_path), 600);

    if (y + 10 > pageH - margin) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`Site photos (${rows.length})`, margin, y);
    y += 5;

    const cols = 2;
    const gap = 4;
    const cellW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
    const cellH = 65;
    let col = 0;
    for (let i = 0; i < rows.length; i++) {
      const url = signed?.[i]?.signedUrl;
      if (!url) continue;
      const img = await loadImage(url);
      if (!img) continue;
      if (col === 0 && y + cellH + 10 > pageH - margin) { doc.addPage(); y = margin; }
      const x = margin + col * (cellW + gap);
      try {
        doc.addImage(img, "JPEG", x, y, cellW, cellH, undefined, "FAST");
      } catch {
        try { doc.addImage(img, "PNG", x, y, cellW, cellH, undefined, "FAST"); } catch { /* skip */ }
      }
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      const cap = [rows[i].kind === "sketch" ? "Sketch" : "Photo", rows[i].what3words].filter(Boolean).join(" — ");
      doc.text(cap, x, y + cellH + 4);
      col++;
      if (col >= cols) { col = 0; y += cellH + 10; }
    }
  }

  // Footer page numbers
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Page ${p} of ${pages}`, pageW - margin, pageH - 6, { align: "right" });
    doc.text(`Generated ${new Date().toLocaleString("en-GB")}`, margin, pageH - 6);
  }

  doc.save(`${survey.reference_number || "site-survey"}.pdf`);
}
