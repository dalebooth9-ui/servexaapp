import jsPDF from "jspdf";
import { writeExcelFile } from "@/lib/excelUtils";
import { format, addDays } from "date-fns";
import { isLabourOrProfitPart } from "@/components/JobParts";

interface ScheduleEntry {
  id: string;
  job_id: string;
  engineer_id: string;
  schedule_date: string;
  notes: string | null;
  notes_color: string | null;
}

interface Job {
  id: string;
  name: string;
  reference_number: string;
  customer: string | null;
  address: string | null;
  site?: { name: string; address: string | null; postcode: string | null } | null;
  customers?: { name: string } | null;
  pressure_test_qty: number;
  visual_qty: number;
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

interface JobPart {
  id: string;
  job_id: string;
  name: string;
  quantity: number;
  notes: string | null;
}

interface SubmissionComment {
  id: string;
  content: string;
  created_at: string;
  submission_job_id?: string;
}

type WorksheetRow = {
  date: string;
  engineer: string;
  company: string;
  site: string;
  postcode: string;
  jobDescription: string;
  scope: string;
  materials: string;
  notes: string;
  routeOrder: string;
};

function buildRows(
  schedule: ScheduleEntry[],
  jobs: Job[],
  engineers: Engineer[],
  jobParts: JobPart[] = [],
  submissionComments: SubmissionComment[] = [],
  optimisedJobOrder: string[] = [],
  jobVisitNotes: Record<string, string> = {}
): WorksheetRow[] {
  const getJob = (id: string) => jobs.find((j) => j.id === id);
  const getEng = (id: string) => engineers.find((e) => e.user_id === id);
  const getPartsForJob = (jobId: string) => jobParts.filter((p) => p.job_id === jobId);
  

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
      const scopeParts: string[] = [];
      if (job?.pressure_test_qty) scopeParts.push(`PT×${job.pressure_test_qty}`);
      if (job?.visual_qty) scopeParts.push(`Vis×${job.visual_qty}`);

      const parts = job ? getPartsForJob(job.id) : [];
      const materialsStr = parts.map((p) => `${p.name}${p.quantity > 1 ? ` ×${p.quantity}` : ""}`).join(", ");

      // Combine schedule entry notes + job visit notes into one NOTES cell
      const noteParts: string[] = [];
      if (entry.notes) noteParts.push(entry.notes);
      const visitNote = job ? jobVisitNotes[job.id] : undefined;
      if (visitNote) noteParts.push(visitNote);

      return {
        date: format(new Date(entry.schedule_date), "EEE dd/MM/yyyy"),
        engineer: eng?.full_name || "",
        company: (job as any)?.customers?.name || job?.customer || "",
        site: site?.name || site?.address || job?.address || "",
        postcode: site?.postcode || extractPostcode(job?.address || null),
        jobDescription: job ? [job.site?.name, job.name].filter(Boolean).join(" – ") : "",
        scope: scopeParts.join(", "),
        materials: materialsStr,
        notes: noteParts.join(" | "),
        routeOrder: (() => {
          const idx = optimisedJobOrder.indexOf(entry.job_id);
          return idx >= 0 ? String(idx + 1) : "";
        })(),
      };
    });
}

// ─── Group rows by engineer ─────────────────────────────────────────────────
function groupByEngineer(rows: WorksheetRow[]): { engineer: string; rows: WorksheetRow[] }[] {
  const map = new Map<string, WorksheetRow[]>();
  for (const r of rows) {
    const list = map.get(r.engineer) || [];
    list.push(r);
    map.set(r.engineer, list);
  }
  return [...map.entries()]
    .map(([engineer, rows]) => ({ engineer, rows }))
    .sort((a, b) => a.engineer.localeCompare(b.engineer));
}

// ─── PDF export ──────────────────────────────────────────────────────────────
export function exportWorksheetPdf(
  weekStart: Date,
  schedule: ScheduleEntry[],
  jobs: Job[],
  engineers: Engineer[],
  jobParts: JobPart[] = [],
  submissionComments: SubmissionComment[] = [],
  optimisedJobOrder: string[] = [],
  jobVisitNotes: Record<string, string> = {}
) {
  const rows = buildRows(schedule, jobs, engineers, jobParts, submissionComments, optimisedJobOrder, jobVisitNotes);
  const hasRoute = optimisedJobOrder.length > 0;
  const groups = groupByEngineer(rows);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const BASE_ROW_H = 8;
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
  doc.line(margin, y + 1, margin + titleTextW, y + 1);
  y += 10;

  // ── Column definitions (no ENGINEER column, wider materials/comments) ─────
  const usableW = pageW - margin * 2;
  const baseCols = [
    { label: "DATE:",           key: "date",           w: usableW * 0.09 },
    { label: "COMPANY",         key: "company",        w: usableW * 0.11 },
    { label: "SITE",            key: "site",           w: usableW * 0.14 },
    { label: "POSTCODE",        key: "postcode",       w: usableW * 0.06 },
    { label: "JOB DESCRIPTION", key: "jobDescription", w: usableW * 0.14 },
    { label: "SCOPE",           key: "scope",          w: usableW * 0.06 },
    { label: "MATERIALS",       key: "materials",      w: usableW * 0.22 },
    { label: "NOTES",           key: "notes",          w: usableW * 0.18 },
  ];
  const cols = hasRoute
    ? [{ label: "#", key: "routeOrder", w: usableW * 0.03 }, ...baseCols.map(c => ({ ...c, w: c.w * 0.97 }))]
    : baseCols;

  // Helper: calculate row height based on wrapped text
  const calcRowH = (row: WorksheetRow): number => {
    doc.setFontSize(6.5);
    let maxLines = 1;
    for (const col of cols) {
      const val = row[col.key as keyof WorksheetRow] || "";
      const lines = doc.splitTextToSize(val, col.w - 2.5);
      if (lines.length > maxLines) maxLines = lines.length;
    }
    return Math.max(BASE_ROW_H, maxLines * 3 + 2);
  };

  // ── Draw table header ─────────────────────────────────────────────────────
  const drawHeader = () => {
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setDrawColor(0);
    let cx = margin;
    cols.forEach((col) => {
      doc.rect(cx, y, col.w, BASE_ROW_H);
      doc.text(col.label, cx + 1.5, y + 5.5);
      cx += col.w;
    });
    y += BASE_ROW_H;
  };

  drawHeader();

  // ── Data rows grouped by engineer ─────────────────────────────────────────
  let lastDate = "";
  let bandGrey = false;

  for (const group of groups) {
    // Engineer group header
    if (y + BASE_ROW_H > pageH - margin) {
      doc.addPage();
      y = margin;
      drawHeader();
    }
    doc.setFillColor(180, 200, 230);
    doc.rect(margin, y, usableW, BASE_ROW_H, "F");
    doc.setDrawColor(100, 100, 100);
    doc.rect(margin, y, usableW, BASE_ROW_H);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(`${group.engineer}  (${group.rows.length} job${group.rows.length !== 1 ? "s" : ""})`, margin + 2, y + 5.5);
    y += BASE_ROW_H;

    // Reset banding per engineer group
    lastDate = "";
    bandGrey = false;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);

    for (const row of group.rows) {
      const rowH = calcRowH(row);

      if (y + rowH > pageH - margin) {
        doc.addPage();
        y = margin;
        drawHeader();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
      }

      if (row.date !== lastDate) {
        bandGrey = !bandGrey;
        lastDate = row.date;
      }

      if (bandGrey) {
        doc.setFillColor(230, 230, 230);
        doc.rect(margin, y, usableW, rowH, "F");
      }

      let cx = margin;
      doc.setDrawColor(180, 180, 180);
      doc.setTextColor(0, 0, 0);
      cols.forEach((col) => {
        doc.rect(cx, y, col.w, rowH);
        const val = row[col.key as keyof WorksheetRow] || "";
        const lines: string[] = doc.splitTextToSize(val, col.w - 2.5);
        lines.forEach((line: string, i: number) => {
          doc.text(line, cx + 1.2, y + 3.5 + i * 3);
        });
        cx += col.w;
      });
      y += rowH;
    }
  }

  doc.save(`weekly-planner-${format(weekStart, "yyyy-MM-dd")}.pdf`);
}

// ─── XLSX export ─────────────────────────────────────────────────────────────
export async function exportWorksheetXlsx(
  weekStart: Date,
  schedule: ScheduleEntry[],
  jobs: Job[],
  engineers: Engineer[],
  jobParts: JobPart[] = [],
  submissionComments: SubmissionComment[] = [],
  optimisedJobOrder: string[] = [],
  jobVisitNotes: Record<string, string> = {}
) {
  const rows = buildRows(schedule, jobs, engineers, jobParts, submissionComments, optimisedJobOrder, jobVisitNotes);
  const hasRoute = optimisedJobOrder.length > 0;
  const groups = groupByEngineer(rows);

  // Build headers without ENGINEER column
  const baseHeaders = ["DATE", "COMPANY", "SITE", "POSTCODE", "JOB DESCRIPTION", "SCOPE", "MATERIALS", "NOTES"];
  const headers = hasRoute ? ["#", ...baseHeaders] : baseHeaders;

  const wsData: (string | number)[][] = [
    [`WEEK COMMENCING ${format(weekStart, "dd/MM/yyyy")}`],
    [],
    headers,
  ];

  for (const group of groups) {
    // Engineer group header row (merged across all columns)
    const groupRow = new Array(headers.length).fill("");
    groupRow[0] = `${group.engineer} (${group.rows.length} job${group.rows.length !== 1 ? "s" : ""})`;
    wsData.push(groupRow);

    for (const r of group.rows) {
      const base = [r.date, r.company, r.site, r.postcode, r.jobDescription, r.scope, r.materials, r.notes];
      wsData.push(hasRoute ? [r.routeOrder, ...base] : base);
    }
  }

  const baseWidths = [{ wch: 16 }, { wch: 22 }, { wch: 36 }, { wch: 12 }, { wch: 40 }, { wch: 14 }, { wch: 34 }, { wch: 30 }];
  const colWidths = hasRoute ? [{ wch: 4 }, ...baseWidths] : baseWidths;

  // Merge title + engineer group header rows
  const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
  let rowIdx = 3; // after title, blank, headers
  for (const group of groups) {
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: headers.length - 1 } });
    rowIdx += 1 + group.rows.length;
  }

  await writeExcelFile(
    wsData,
    `weekly-planner-${format(weekStart, "yyyy-MM-dd")}.xlsx`,
    "Weekly Planner",
    merges,
    colWidths
  );
}
