import jsPDF from "jspdf";
import { format } from "date-fns";
import type { WeeklySheetRow } from "@/lib/weeklySheet";

type RGB = [number, number, number];
/** Company brand colour (hex) for headings; neutral dark grey when none is set. */
export function brandRgb(hex?: string | null): RGB {
  const m = (hex || "").trim().match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [51, 51, 51];
}
export interface SheetBranding { logo: string | null; companyName: string | null; color: string | null }
const PINK: [number, number, number] = [252, 220, 230];

async function imgSize(src: string): Promise<{ w: number; h: number } | null> {
  return new Promise((res) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res(null); i.src = src; });
}

/** Landscape A4 weekly sheets, one section per engineer (each starts on a new page). */
export async function buildWeeklySheetPdf(weekStart: Date, sheets: { title: string; rows: WeeklySheetRow[] }[], branding: SheetBranding): Promise<Blob> {
  const { logo, companyName } = branding;
  const BRAND = brandRgb(branding.color);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 10, U = W - M * 2;
  const size = logo ? await imgSize(logo) : null;
  const cols = [
    { label: "DATE", key: "dateLabel", w: 0.1 }, { label: "CUSTOMER", key: "company", w: 0.14 },
    { label: "SITE", key: "site", w: 0.22 }, { label: "POSTCODE", key: "postcode", w: 0.08 },
    { label: "JOB", key: "description", w: 0.18 }, { label: "COMMENT", key: "comment", w: 0.28 },
  ].map((c) => ({ ...c, w: c.w * U }));
  const FS = 7.5, LH = 3.2;
  let y = M, first = true;

  const header = (title: string, cont: boolean) => {
    y = M;
    if (logo && size) {
      const lw = Math.min(70, (14 * size.w) / size.h), lh = (lw * size.h) / size.w;
      try { doc.addImage(logo, "PNG", (W - lw) / 2, y, lw, lh); } catch { /* print without logo */ }
      y += lh + 3;
    } else if (companyName) {
      doc.setTextColor(...BRAND); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
      doc.text(companyName, W / 2, y + 6, { align: "center" });
      y += 10;
    }
    doc.setTextColor(...BRAND); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text(`WEEK COMMENCING ${format(weekStart, "dd/MM/yyyy")}   ${title}${cont ? " (continued)" : ""}`, M, y + 4);
    y += 7;
    doc.setFillColor(...BRAND); doc.rect(M, y, U, 7, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(8);
    let x = M; for (const c of cols) { doc.text(c.label, x + 1.5, y + 4.8); x += c.w; }
    y += 7; doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal"); doc.setFontSize(FS);
  };

  for (const s of sheets) {
    if (!first) doc.addPage();
    first = false;
    header(s.title, false);
    if (!s.rows.length) { doc.text("No jobs booked this week.", M + 2, y + 5); continue; }
    let lastDate = "";
    for (const r of s.rows) {
      const lines = cols.map((c) => doc.splitTextToSize(String((r as any)[c.key] || ""), c.w - 3) as string[]);
      const h = Math.max(6, Math.max(...lines.map((l) => l.length)) * LH + 2.5);
      if (y + h > H - M - 5) { doc.addPage(); header(s.title, true); lastDate = ""; }
      if (r.highlight) { doc.setFillColor(...PINK); doc.rect(M, y, U, h, "F"); }
      if (lastDate && r.date !== lastDate) { doc.setDrawColor(...BRAND); doc.setLineWidth(0.5); doc.line(M, y, M + U, y); }
      doc.setDrawColor(190, 190, 190); doc.setLineWidth(0.15);
      let x = M;
      cols.forEach((c, i) => {
        doc.rect(x, y, c.w, h);
        const show = i === 0 && r.date === lastDate ? [] : lines[i];
        show.forEach((ln, k) => doc.text(ln, x + 1.5, y + 4 + k * LH));
        x += c.w;
      });
      lastDate = r.date; y += h;
    }
  }
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) { doc.setPage(p); doc.setFontSize(7); doc.setTextColor(120, 120, 120); doc.text(`Page ${p} of ${n}`, W - M, H - 5, { align: "right" }); }
  return doc.output("blob");
}
