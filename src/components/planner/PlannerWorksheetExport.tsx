import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import { format, addDays } from "date-fns";

interface ScheduleEntry {
  id: string;
  job_id: string;
  engineer_id: string;
  schedule_date: string;
  notes: string | null;
}

interface Job {
  id: string;
  name: string;
  reference_number: string;
  customer: string | null;
  address: string | null;
  site?: { name: string; address: string | null; postcode: string | null } | null;
  customers?: { name: string } | null;
}

interface Engineer {
  user_id: string;
  full_name: string;
}

function extractPostcode(address: string | null): string {
  if (!address) return "";
  const match = address.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i);
  return match ? match[0].toUpperCase() : "";
}

type WorksheetRow = {
  date: string;
  engineer: string;
  company: string;
  site: string;
  postcode: string;
  jobDescription: string;
  comment: string;
};

function buildRows(
  schedule: ScheduleEntry[],
  jobs: Job[],
  engineers: Engineer[]
): WorksheetRow[] {
  const getJob = (id: string) => jobs.find((j) => j.id === id);
  const getEng = (id: string) => engineers.find((e) => e.user_id === id);

  return [...schedule]
    .sort((a, b) => {
      const dateDiff = a.schedule_date.localeCompare(b.schedule_date);
      if (dateDiff !== 0) return dateDiff;
      const engA = getEng(a.engineer_id)?.full_name || "";
      const engB = getEng(b.engineer_id)?.full_name || "";
      return engA.localeCompare(engB);
    })
    .map((entry) => {
      const job = getJob(entry.job_id);
      const eng = getEng(entry.engineer_id);
      const site = job?.site;
      return {
        date: format(new Date(entry.schedule_date), "EEE dd/MM/yyyy"),
        engineer: eng?.full_name || "",
        company: (job as any)?.customers?.name || job?.customer || "",
        site: site?.name || site?.address || job?.address || "",
        postcode: site?.postcode || extractPostcode(job?.address || null),
        jobDescription: job ? `${job.reference_number} - ${job.name}` : "",
        comment: entry.notes || "",
      };
    });
}

// ─── PDF export ──────────────────────────────────────────────────────────────
export function exportWorksheetPdf(
  weekStart: Date,
  schedule: ScheduleEntry[],
  jobs: Job[],
  engineers: Engineer[]
) {
  const rows = buildRows(schedule, jobs, engineers);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const ROW_H = 8;
  let y = margin + 4;

  // ── Title ─────────────────────────────────────────────────────────────────
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("WEEK COMMENCING", margin, y);
  doc.setLineWidth(0.4);
  const titleTextW = doc.getTextWidth("WEEK COMMENCING");
  const dateStr = format(weekStart, "dd/MM/yyyy");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(dateStr, margin + titleTextW + 3, y);
  // underline WEEK COMMENCING
  doc.line(margin, y + 1, margin + titleTextW, y + 1);
  y += 10;

  // ── Column definitions (match template proportions) ────────────────────────
  const usableW = pageW - margin * 2;
  const cols = [
    { label: "DATE:",         key: "date",           w: usableW * 0.09 },
    { label: "ENGINEER",      key: "engineer",        w: usableW * 0.12 },
    { label: "COMPANY",       key: "company",         w: usableW * 0.13 },
    { label: "SITE",          key: "site",            w: usableW * 0.22 },
    { label: "POSTCODE",      key: "postcode",        w: usableW * 0.08 },
    { label: "JOB DESCRIPTION", key: "jobDescription", w: usableW * 0.22 },
    { label: "COMMENT",       key: "comment",         w: usableW * 0.14 },
  ];

  // ── Header row ─────────────────────────────────────────────────────────────
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  let cx = margin;
  cols.forEach((col) => {
    doc.rect(cx, y, col.w, ROW_H);
    doc.text(col.label, cx + 1.5, y + 5.5);
    cx += col.w;
  });
  y += ROW_H;

  // ── Data rows — alternate grey band per calendar day ──────────────────────
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);

  let lastDate = "";
  let bandGrey = false;

  for (const row of rows) {
    if (y + ROW_H > pageH - margin) {
      doc.addPage();
      y = margin;
    }

    if (row.date !== lastDate) {
      bandGrey = !bandGrey;
      lastDate = row.date;
    }

    if (bandGrey) {
      doc.setFillColor(210, 210, 210);
      doc.rect(margin, y, usableW, ROW_H, "F");
    }

    cx = margin;
    doc.setDrawColor(180, 180, 180);
    cols.forEach((col) => {
      doc.rect(cx, y, col.w, ROW_H);
      const val = row[col.key as keyof WorksheetRow];
      doc.text(val, cx + 1.5, y + 5.5, { maxWidth: col.w - 3 });
      cx += col.w;
    });
    y += ROW_H;
  }

  doc.save(`weekly-planner-${format(weekStart, "yyyy-MM-dd")}.pdf`);
}

// ─── XLSX export ─────────────────────────────────────────────────────────────
export function exportWorksheetXlsx(
  weekStart: Date,
  schedule: ScheduleEntry[],
  jobs: Job[],
  engineers: Engineer[]
) {
  const rows = buildRows(schedule, jobs, engineers);

  const wsData: (string | number)[][] = [
    [`WEEK COMMENCING ${format(weekStart, "dd/MM/yyyy")}`],
    [],
    ["DATE", "ENGINEER", "COMPANY", "SITE", "POSTCODE", "JOB DESCRIPTION", "COMMENT"],
    ...rows.map((r) => [r.date, r.engineer, r.company, r.site, r.postcode, r.jobDescription, r.comment]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws["!cols"] = [
    { wch: 16 }, { wch: 20 }, { wch: 22 }, { wch: 36 },
    { wch: 12 }, { wch: 40 }, { wch: 24 },
  ];

  // Merge title cell across all columns
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Weekly Planner");
  XLSX.writeFile(wb, `weekly-planner-${format(weekStart, "yyyy-MM-dd")}.xlsx`);
}
