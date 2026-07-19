import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import { PDF_PALETTE } from "@/lib/pdfPalette";
import { loadWatermarkImage } from "@/lib/pdfWatermark";
import { renderBrandingOverlay } from "@/lib/pdfBranding";
import { fetchCustomerAccreditationLogos, loadAccreditationLogos } from "@/lib/pdfAccreditations";
import { PDF_DIMENSIONS, resolveAccredFooterY } from "@/lib/pdfDimensions";
import { renderPdfHeader } from "@/lib/pdfHeader";
import { resolveDocumentBrandingProfile } from "@/lib/documentBrandingProfile";
import { fetchOrientedImage } from "@/lib/exifOrient";
import { collectEmbeddedPhotoPaths, loadJobPhotosForPdf, type JobPhotoForPdf } from "@/lib/jobPhotos";
import ExportBundlePickerDialog, { type ExportBundleSelection } from "@/components/exports/ExportBundlePickerDialog";
import { generateJobSheetPdf } from "@/components/JobSheetPdfExport";
import { PDFDocument } from "pdf-lib";

interface Props {
  jobId: string;
  job: any;
}


// ── Table drawing helpers ──────────────────────────────────────────

type TableCol = {
  text: string;
  x: number;
  width: number;
  bold?: boolean;
  color?: [number, number, number];
  align?: "left" | "center" | "right";
};

const CELL_LINE_H = 4;
const CELL_PAD_X = 2;
const CELL_PAD_Y = 3;

/**
 * Compute the height a row will need so that all its cell text wraps within
 * cell width without clipping. Callers use this BEFORE checkPage so we never
 * paginate mid-row and never clip long dynamic strings.
 */
function measureTableRowHeight(
  doc: jsPDF,
  cols: TableCol[],
  minRowHeight: number
): number {
  let maxLines = 1;
  for (const col of cols) {
    const usable = Math.max(4, col.width - CELL_PAD_X * 2);
    const lines = doc.splitTextToSize(String(col.text ?? ""), usable) as string[];
    if (lines.length > maxLines) maxLines = lines.length;
  }
  return Math.max(minRowHeight, maxLines * CELL_LINE_H + CELL_PAD_Y);
}

/**
 * Draw a table row with automatic text wrapping in every cell.
 * Body rows (no `bg` passed) have TRANSPARENT interiors so the page watermark
 * shows through evenly. Solid fills are ONLY drawn for header rows the caller
 * explicitly asks for by passing `bg` (navy section headers / grey column
 * headers). Zebra body stripes are intentionally not supported — they blank
 * the watermark inconsistently.
 * Returns the actual height drawn.
 */
function drawTableRow(
  doc: jsPDF,
  y: number,
  cols: TableCol[],
  rowHeight: number,
  margin: number,
  totalWidth: number,
  bg?: [number, number, number]
): number {
  const dynH = measureTableRowHeight(doc, cols, rowHeight);
  if (bg) {
    doc.setFillColor(...bg);
    doc.rect(margin, y, totalWidth, dynH, "F");
  }
  doc.setDrawColor(200, 200, 200);
  // Outer + per-cell borders drawn as strokes only (transparent interiors).
  doc.rect(margin, y, totalWidth, dynH, "S");
  let xOffset = margin;
  cols.forEach((col) => {
    doc.rect(xOffset, y, col.width, dynH, "S");
    doc.setFont("helvetica", col.bold ? "bold" : "normal");
    if (col.color) doc.setTextColor(...col.color);
    else doc.setTextColor(30, 30, 30);
    const usable = Math.max(4, col.width - CELL_PAD_X * 2);
    const lines = doc.splitTextToSize(String(col.text ?? ""), usable) as string[];
    const singleLine = lines.length <= 1;
    const startY = singleLine ? y + dynH / 2 + 1.5 : y + CELL_PAD_Y + 1;
    lines.forEach((ln, i) => {
      const ty = startY + i * CELL_LINE_H;
      if (col.align === "right") {
        doc.text(ln, xOffset + col.width - CELL_PAD_X, ty, { align: "right" });
      } else if (col.align === "center") {
        doc.text(ln, xOffset + col.width / 2, ty, { align: "center" });
      } else {
        doc.text(ln, xOffset + CELL_PAD_X, ty);
      }
    });
    doc.setTextColor(30, 30, 30);
    xOffset += col.width;
  });
  return dynH;
}

function sectionTitle(doc: jsPDF, title: string, y: number, margin: number, maxWidth: number): number {
  doc.setFillColor(...PDF_PALETTE.navy);
  doc.rect(margin, y, maxWidth, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...PDF_PALETTE.navyText);
  doc.text(title.toUpperCase(), margin + 3, y + 6.5);
  doc.setTextColor(...PDF_PALETTE.ink);
  return y + 9;
}

function extractSubmissionPath(value: any): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const match = raw.match(/\/object\/(?:public|sign)\/submissions\/(.+?)(?:\?|$)/);
  if (match) return decodeURIComponent(match[1]);
  if (raw.startsWith("http")) return null;
  return raw;
}

function parseDwellingPhotos(value: any): { path: string; caption: string }[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string" && value.trim().startsWith("[")
      ? (() => { try { return JSON.parse(value); } catch { return []; } })()
      : value
        ? [value]
        : [];
  return (Array.isArray(raw) ? raw : [raw])
    .flatMap((p: any) => {
      const path = typeof p === "object" ? extractSubmissionPath(p.path || p.url || p.file_url) : extractSubmissionPath(p);
      return path ? [{ path, caption: typeof p === "object" ? String(p.caption || p.note || "").trim() : "" }] : [];
    });
}

function getDwellingRowPhotos(row: any, photoCol: any, columns: any[]): { path: string; caption: string }[] {
  const photos = parseDwellingPhotos(photoCol ? row?.[photoCol.id] : row?.photos);
  if (photos.length > 0) return photos;
  const knownColumnIds = new Set((columns || []).map((c: any) => c?.id).filter(Boolean));
  for (const [key, value] of Object.entries(row || {})) {
    if (key === "id" || key === photoCol?.id) continue;
    const column = (columns || []).find((c: any) => c?.id === key);
    const label = String(column?.label || key);
    const looksLikePhoto = /photo|image|picture/i.test(key) || /photo|image|picture/i.test(label) || (!knownColumnIds.has(key) && String(value || "").includes("template-photos/"));
    if (!looksLikePhoto) continue;
    const legacy = parseDwellingPhotos(value);
    if (legacy.length > 0) return legacy;
  }
  return [];
}

// Renders a repeating_table field that contains a photo_gallery column
// (the dwelling access log) using the same professional layout used in
// the job-sheet PDF: header bar, summary stats, badge table, photo grid.
async function renderDwellingAccessLog(
  doc: jsPDF,
  field: any,
  rawRows: any,
  startY: number,
  margin: number,
  maxWidth: number,
  pageHeight: number,
  footerSpace: number
): Promise<number> {
  let y = startY;
  let rows: any[] = [];
  if (Array.isArray(rawRows)) rows = rawRows;
  else if (typeof rawRows === "string" && rawRows.trim().startsWith("[")) {
    try { rows = JSON.parse(rawRows); } catch { rows = []; }
  }
  if (!Array.isArray(rows) || rows.length === 0) return y;

  const NAVY: [number, number, number] = [26, 46, 74];
  const GREEN_TXT: [number, number, number] = [6, 95, 70];
  const GREEN_BG: [number, number, number] = [209, 250, 229];
  const AMBER_TXT: [number, number, number] = [146, 64, 14];
  const AMBER_BG: [number, number, number] = [254, 243, 199];
  const RED_TXT: [number, number, number] = [153, 27, 27];
  const RED_BG: [number, number, number] = [254, 226, 226];
  const STAT_GREEN: [number, number, number] = [26, 122, 74];
  const STAT_AMBER: [number, number, number] = [180, 83, 9];
  const STAT_RED: [number, number, number] = [185, 28, 28];
  const ROW_ALT: [number, number, number] = [247, 248, 250];
  const BORDER: [number, number, number] = [210, 214, 220];
  const MUTED: [number, number, number] = [110, 116, 128];

  type StatusKind = "gained" | "noanswer" | "refused" | "unknown";
  const classifyStatus = (raw: string): StatusKind => {
    const v = (raw || "").toLowerCase();
    if (!v) return "unknown";
    if (v.includes("refus")) return "refused";
    if (v.includes("no answer") || v.includes("no access") || v.includes("not gained") || v.includes("not in") || v.includes("absent")) return "noanswer";
    if (v.includes("gain") || v === "yes" || v.includes("access ok") || v.includes("ok")) return "gained";
    return "unknown";
  };
  const statusLabel = (k: StatusKind, raw: string) => {
    if (raw && raw.trim()) return raw.trim();
    if (k === "gained") return "Access gained";
    if (k === "noanswer") return "No answer";
    if (k === "refused") return "Refused";
    return "—";
  };

  const columns: any[] = Array.isArray(field.columns) ? field.columns : [];
  const colMatch = (re: RegExp) => columns.find((c: any) => re.test(String(c?.id || "")) || re.test(String(c?.label || "")));
  const unitCol = colMatch(/unit|flat|dwelling|apt|apartment/i);
  const statusCol = colMatch(/status|access/i);
  const headsCol = colMatch(/^heads?$|head[_ ]?count|total[_ ]?heads|sprinkler[_ ]?heads/i);
  const notesCol = colMatch(/note|comment|remark/i);
  const photoCol = columns.find((c: any) => c?.type === "photo_gallery");
  const roomCols = columns.filter((c: any) => {
    if (!c) return false;
    if (c === unitCol || c === statusCol || c === headsCol || c === notesCol) return false;
    if (c.type === "photo_gallery" || c.type === "photo") return false;
    return /hall|kitchen|bedroom|lounge|living|bath|wc|toilet|landing|cupboard|store|stair|corridor|utility|dining|study|attic|loft|en[- ]?suite|room/i.test(String(c?.label || c?.id || ""));
  });

  type Entry = { unit: string; statusRaw: string; status: StatusKind; heads: string; breakdown: string; notes: string; photos: { path: string; caption: string }[] };
  const entries: Entry[] = rows.map((row: any, idx: number) => {
    const unit = String(row?.[unitCol?.id] ?? row?.unit_number ?? "").trim() || `Unit ${idx + 1}`;
    const statusRaw = String(row?.[statusCol?.id] ?? row?.access_status ?? row?.status ?? "").trim();
    const status = classifyStatus(statusRaw);
    let heads = String(row?.[headsCol?.id] ?? row?.heads ?? row?.head_count ?? "").trim();
    const breakdownParts: string[] = [];
    let derivedHeads = 0;
    for (const rc of roomCols) {
      const v = row?.[rc.id];
      const num = Number(v);
      if (Number.isFinite(num) && num > 0) { breakdownParts.push(`${rc.label} ×${num}`); derivedHeads += num; }
      else if (typeof v === "string" && v.trim() && v.trim() !== "0") { breakdownParts.push(`${rc.label} ${v.trim()}`); }
    }
    if (!heads && derivedHeads > 0) heads = String(derivedHeads);
    if (status === "noanswer" || status === "refused") heads = "—";
    const notes = String(row?.[notesCol?.id] ?? row?.notes ?? row?.comments ?? "").trim();
    const breakdown = breakdownParts.join(", ");
    const photos = getDwellingRowPhotos(row, photoCol, columns);
    return { unit, statusRaw, status, heads: heads || "—", breakdown, notes, photos };
  });

  const totals = {
    total: entries.length,
    gained: entries.filter((e) => e.status === "gained").length,
    noanswer: entries.filter((e) => e.status === "noanswer").length,
    refused: entries.filter((e) => e.status === "refused").length,
  };

  // Header bar
  if (y + 30 > pageHeight - footerSpace) { doc.addPage(); y = 15; }
  const headerH = 8;
  doc.setFillColor(...NAVY);
  doc.rect(margin, y, maxWidth, headerH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text((field.label || "DWELLING ACCESS LOG").toUpperCase(), margin + 3, y + 5.4);
  doc.setTextColor(0, 0, 0);
  y += headerH;

  // Stats
  const statsH = 14;
  const colW = maxWidth / 4;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.rect(margin, y, maxWidth, statsH);
  for (let i = 1; i < 4; i++) doc.line(margin + colW * i, y, margin + colW * i, y + statsH);
  const statCols = [
    { label: "TOTAL DWELLINGS", value: String(totals.total), color: [0, 0, 0] as [number, number, number] },
    { label: "ACCESS GAINED", value: String(totals.gained), color: STAT_GREEN },
    { label: "NO ANSWER", value: String(totals.noanswer), color: STAT_AMBER },
    { label: "REFUSED", value: String(totals.refused), color: STAT_RED },
  ];
  statCols.forEach((s, i) => {
    const cx = margin + colW * i + colW / 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(s.label, cx, y + 4.5, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...s.color);
    doc.text(s.value, cx, y + 11.5, { align: "center" });
  });
  doc.setTextColor(0, 0, 0);
  y += statsH + 2;

  // Table
  const unitW = Math.max(maxWidth * 0.3, 46);
  const statusW = Math.max(maxWidth * 0.15, 28);
  const headsW = Math.max(maxWidth * 0.11, 18);
  const remaining = maxWidth - unitW - statusW - headsW;
  const notesW = remaining / 2;
  const photoNotesW = remaining - notesW;
  const tblColW = [unitW, statusW, headsW, notesW, photoNotesW];
  const tblHeaderH = 7;
  const renderTableHeader = () => {
    doc.setFillColor(235, 238, 242);
    doc.rect(margin, y, maxWidth, tblHeaderH, "F");
    doc.setDrawColor(...BORDER);
    doc.rect(margin, y, maxWidth, tblHeaderH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(40, 45, 55);
    let cx = margin;
    ["Unit", "Status", "Heads per flat", "Room breakdown & notes", "Photo notes"].forEach((h, i) => {
      doc.text(h, cx + 2, y + 4.8);
      cx += tblColW[i];
    });
    doc.setTextColor(0, 0, 0);
    y += tblHeaderH;
  };
  renderTableHeader();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const notesText = e.status === "gained" ? [e.breakdown, e.notes].filter(Boolean).join(". ") : (e.notes || "—");
    const captions = (e.photos || []).map((p) => (p.caption || "").trim()).filter(Boolean);
    const photoNotesText = captions.length ? captions.join("; ") : "—";
    const notesLines = doc.splitTextToSize(notesText || "—", tblColW[3] - 4);
    const photoNotesLines = doc.splitTextToSize(photoNotesText, tblColW[4] - 4);
    const unitLines = doc.splitTextToSize(String(e.unit), tblColW[0] - 5);
    const rowH = Math.max(8, Math.max(notesLines.length, unitLines.length, photoNotesLines.length) * 3.6 + 3);
    if (y + rowH > pageHeight - footerSpace) {
      doc.addPage(); y = 15; renderTableHeader();
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    }
    if (i % 2 === 1) { doc.setFillColor(...ROW_ALT); doc.rect(margin, y, maxWidth, rowH, "F"); }
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.1);
    doc.rect(margin, y, maxWidth, rowH);
    const cy = y + rowH / 2 + 1.4;
    let cx = margin;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(20, 25, 35);
    doc.text(unitLines, cx + 2, y + 4.5);
    cx += tblColW[0];
    const badgeBg = e.status === "gained" ? GREEN_BG : e.status === "noanswer" ? AMBER_BG : e.status === "refused" ? RED_BG : [235, 238, 242] as [number, number, number];
    const badgeFg = e.status === "gained" ? GREEN_TXT : e.status === "noanswer" ? AMBER_TXT : e.status === "refused" ? RED_TXT : MUTED;
    const badgeText = statusLabel(e.status, e.statusRaw);
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
    const bw = Math.min(tblColW[1] - 4, doc.getTextWidth(badgeText) + 4);
    const bh = 4.6;
    const bx = cx + 3;
    const by = y + rowH / 2 - bh / 2;
    doc.setFillColor(...badgeBg);
    doc.roundedRect(bx, by, bw, bh, 1, 1, "F");
    doc.setTextColor(...badgeFg);
    doc.text(badgeText, bx + bw / 2, by + 3.3, { align: "center" });
    doc.setFontSize(9);
    cx += tblColW[1];
    doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
    doc.text(String(e.heads || "—"), cx + 2, cy);
    cx += tblColW[2];
    doc.setFont("helvetica", "normal"); doc.setTextColor(40, 45, 55);
    doc.text(notesLines, cx + 2, y + 4.5);
    cx += tblColW[3];
    doc.setFontSize(8.5);
    doc.setTextColor(photoNotesText === "—" ? MUTED[0] : 40, photoNotesText === "—" ? MUTED[1] : 45, photoNotesText === "—" ? MUTED[2] : 55);
    doc.text(photoNotesLines, cx + 2, y + 4.5);
    doc.setFontSize(9); doc.setTextColor(0, 0, 0);
    y += rowH;
  }
  y += 4;

  // Photo grid
  type PhotoItem = { unit: string; url: string | null; caption: string; oriented: { dataUrl: string; width: number; height: number; mimeType: "image/jpeg" | "image/png" } | null };
  const photoTasks: Promise<PhotoItem>[] = [];
  for (const e of entries) {
    for (const p of e.photos) {
      photoTasks.push((async () => {
        let url: string | null = null;
        try {
          const { data } = await supabase.storage.from("submissions").createSignedUrl(p.path, 60 * 60);
          url = data?.signedUrl ?? null;
        } catch (err) { console.warn("Dwelling photo signed URL failed", p.path, err); }
        let oriented: PhotoItem["oriented"] = null;
        if (url) {
          try { const o = await fetchOrientedImage(url); if (o && o.dataUrl) oriented = o; }
          catch (err) { console.warn("Dwelling photo orient failed", p.path, err); }
        }
        return { unit: e.unit, url, caption: p.caption, oriented };
      })());
    }
  }
  const photoItems: PhotoItem[] = await Promise.all(photoTasks);
  console.log("[JobPdfReport] dwelling photos", {
    tasks: photoTasks.length,
    resolved: photoItems.length,
    withImage: photoItems.filter((p) => p.oriented && p.oriented.dataUrl).length,
    withSignedUrl: photoItems.filter((p) => p.url).length,
    paths: entries.flatMap((e) => e.photos.map((p) => p.path)),
  });

  if (photoItems.length > 0) {
    if (y + 30 > pageHeight - footerSpace) { doc.addPage(); y = 15; }
    doc.setFillColor(...NAVY);
    doc.rect(margin, y, maxWidth, headerH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("PHOTOGRAPHIC EVIDENCE", margin + 3, y + 5.4);
    doc.setTextColor(0, 0, 0);
    y += headerH + 3;

    const cols = 3;
    const gap = 3;
    const photoW = (maxWidth - gap * (cols - 1)) / cols;
    const photoH = 56;
    const captionBlock = 11;
    const cellH = photoH + captionBlock + 2;

    for (let i = 0; i < photoItems.length; i++) {
      const col = i % cols;
      if (col === 0 && i > 0) y += cellH + 2;
      if (y + cellH > pageHeight - footerSpace) { doc.addPage(); y = 15; }
      const x = margin + col * (photoW + gap);
      const item = photoItems[i];
      doc.setFillColor(235, 238, 242);
      doc.rect(x, y, photoW, photoH, "F");
      let rendered = false;
      if (item.oriented && item.oriented.dataUrl) {
        try {
          const ow = item.oriented.width || photoW;
          const oh = item.oriented.height || photoH;
          const scale = Math.min(photoW / ow, photoH / oh);
          const dw = Math.max(8, ow * scale);
          const dh = Math.max(8, oh * scale);
          const dx = x + (photoW - dw) / 2;
          const dy = y + (photoH - dh) / 2;
          doc.addImage(item.oriented.dataUrl, item.oriented.mimeType === "image/png" ? "PNG" : "JPEG", dx, dy, dw, dh, undefined, "FAST");
          rendered = true;
        } catch (err) { console.warn("Dwelling photo addImage failed", err); }
      }
      if (!rendered) {
        doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...MUTED);
        doc.text("Image unavailable", x + photoW / 2, y + photoH / 2 + 1, { align: "center" });
        doc.setTextColor(0, 0, 0);
      }
      doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
      doc.rect(x, y, photoW, photoH);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(20, 25, 35);
      const unitLabelLines = doc.splitTextToSize(item.unit, photoW).slice(0, 1);
      doc.text(unitLabelLines, x, y + photoH + 3.5);
      if (item.caption) {
        doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(70, 75, 85);
        const capLines = doc.splitTextToSize(item.caption, photoW).slice(0, 2);
        doc.text(capLines, x, y + photoH + 7);
      }
      doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);
    }
    y += cellH + 4;
  }
  return y;
}

// ── Main component ──────────────────────────────────────────────

export default function JobPdfReport({ jobId, job }: Props) {
  const [generating, setGenerating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const generate = async (sel: ExportBundleSelection) => {
    const includeCerts = sel.includeCerts;
    const includePhotos = sel.includePhotos;
    const includeFieldReports = sel.includeFieldReports;
    const includeFilledSheets = sel.includeFilledSheets;
    const selectedPhotoIds = sel.photoIds;
    const selectedSheetIds = sel.sheetIds;

    setDialogOpen(false);
    setGenerating(true);
    // Immediate feedback before the heavy PDF build so the spinner paints.
    toast({ title: "Preparing PDF…", description: "Building the job report — this can take a few seconds." });
    await new Promise((r) => setTimeout(r, 50));

    try {
      const [subsRes, reportsRes, visitsRes, partsRes, assignRes, sigRes, siteRes, sheetRespRes, templatesRes] = await Promise.all([
        supabase.from("submissions").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("field_reports").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("job_visits").select("*").eq("job_id", jobId).order("scheduled_date", { ascending: true }),
        supabase.from("job_parts" as any).select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("job_assignments").select("engineer_id").eq("job_id", jobId),
        supabase.from("job_signatures" as any).select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        job.site_id ? supabase.from("sites").select("name, address, postcode, contact_name, contact_phone, contact_email").eq("id", job.site_id).single() : Promise.resolve({ data: null }),
        supabase.from("job_sheet_responses").select("*, last_amended_at, last_amended_by").eq("job_id", jobId).eq("status", "submitted").order("created_at", { ascending: true }),
        supabase.from("job_sheet_templates").select("*"),
      ]);

      const submissions = subsRes.data || [];
      const reports = reportsRes.data || [];
      const visits = visitsRes.data || [];
      const parts = (partsRes.data as any[]) || [];
      const signatures = (sigRes.data as any[]) || [];
      const site = siteRes.data as any;
      const allSheetResponses = (sheetRespRes.data || []) as any[];
      // Dedup: keep only the most recent submission per template_id
      const latestByTemplate = new Map<string, any>();
      for (const r of allSheetResponses) {
        const prev = latestByTemplate.get(r.template_id);
        const currentTime = new Date(r.submitted_at || r.updated_at || r.created_at).getTime();
        const previousTime = prev ? new Date(prev.submitted_at || prev.updated_at || prev.created_at).getTime() : 0;
        if (!prev || currentTime > previousTime) {
          latestByTemplate.set(r.template_id, r);
        }
      }
      let sheetResponses = Array.from(latestByTemplate.values());
      // Honour the user's sheet ticks from the picker (empty set = none).
      if (selectedSheetIds.size > 0) {
        sheetResponses = sheetResponses.filter((r) => selectedSheetIds.has(r.id));
      } else {
        sheetResponses = [];
      }
      console.log("[JobPdfReport] sheet responses", { total: allSheetResponses.length, selected: sheetResponses.length });
      const templates = (templatesRes.data || []) as any[];

      const templateMap: Record<string, any> = {};
      templates.forEach((t: any) => {
        templateMap[t.id] = { ...t, fields: typeof t.fields === "string" ? JSON.parse(t.fields) : t.fields };
      });

      const engIds = [...new Set((assignRes.data || []).map((a: any) => a.engineer_id))];
      let engineerNames: string[] = [];
      const engineerProfileMap: Record<string, string> = {};
      if (engIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", engIds);
        engineerNames = (profiles || []).map((p) => p.full_name || "Unknown");
        (profiles || []).forEach((p) => { engineerProfileMap[p.user_id] = p.full_name || "Unknown"; });
      }

      // Fetch engineer certificates if toggle is on
      let certs: any[] = [];
      if (includeCerts) {
        const { data: certData } = await supabase
          .from("submissions")
          .select("id, file_name, engineer_id, created_at, file_url")
          .eq("job_id", jobId)
          .eq("type", "document")
          .like("file_name", "[Cert]%")
          .order("created_at", { ascending: true });
        certs = (certData || []) as any[];
      }


      // Pre-load photos via shared loader (same source as Photos tab).
      // Excludes any photo already embedded inside a submitted job-sheet
      // response (photo_gallery columns, photo fields) so the job-level
      // Photos section never duplicates images shown inline elsewhere.
      const embeddedPaths = collectEmbeddedPhotoPaths(sheetResponses, jobId);
      const jobPhotos: JobPhotoForPdf[] = includePhotos && selectedPhotoIds.size > 0
        ? await loadJobPhotosForPdf({ jobId, excludePaths: embeddedPaths, includeIds: selectedPhotoIds })
        : [];
      console.log("[JobPdfReport] job photos", {
        loaded: jobPhotos.length,
        excluded: embeddedPaths.size,
        totalBytes: jobPhotos.reduce((s, p) => s + p.bytes, 0),
      });


      // Pre-load company logo + resolve unified branding profile so the
      // header logo, watermark tint, and footer all come from the same source.
      const brandProfile = await resolveDocumentBrandingProfile({
        template: null,
        customer: { name: job.customers?.name, logo_url: job.customers?.logo_url },
      });
      let logoDataUrl: string | null = null;
      try {
        const logoResp = await fetch(brandProfile.logoUrl);
        const logoBlob = await logoResp.blob();
        logoDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(logoBlob);
        });
      } catch { /* logo unavailable */ }

      const doc = new jsPDF();
      let y = 15;
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = PDF_DIMENSIONS.margin; // standardised at 10mm across all PDFs
      const maxWidth = pageWidth - margin * 2;
      const rowH = 8;

      const addPage = () => { doc.addPage(); y = 15; };
      const checkPage = (needed: number) => { if (y + needed > 275) addPage(); };

      // ── HEADER ──
      // Use the shared renderPdfHeader helper with a JOB-REPORT-specific
      // style (smaller logo box, larger title, REF-and-date subtitle line,
      // no Customer/Site detail grid — those are drawn separately below).
      y = await renderPdfHeader(
        doc,
        "JOB REPORT",
        { logo_url: logoDataUrl || "" },
        {
          customerName: "",
          siteName: "",
          siteAddress: "",
          refNumber: job.reference_number || "",
          dateVal: new Date().toLocaleDateString("en-GB"),
          riserLocation: "",
        },
        null,
        null,
        {
          style: {
            logo: { maxW: 70, maxH: 20 },
            title: { fontSize: 16 },
            subtitleLine: {
              text: `${job.reference_number}  |  Generated ${new Date().toLocaleDateString("en-GB")}`,
            },
            detailGrid: false,
          },
        }
      );
      y += 3;

      // ── JOB DETAILS TABLE ──
      doc.setFontSize(11);
      const serviceScope = [
        job.pressure_test_qty > 0 ? `Pressure Test x${job.pressure_test_qty}` : null,
        job.visual_qty > 0 ? `Visual x${job.visual_qty}` : null,
        (job as any).other_qty > 0 ? `${(job as any).other_service_type || "Other"} x${(job as any).other_qty}` : null,
      ].filter(Boolean).join("  |  ");

      const detailRows: [string, string][] = [
        ["Job Name", job.name || "—"],
        ["Reference", job.reference_number || "—"],
        ["Customer", job.customers?.name || job.customer || "—"],
        ["Address", job.address || "—"],
        ["Category", (job.category || "—").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())],
        ...(serviceScope ? [["Service Scope", serviceScope] as [string, string]] : []),
        ["Job Type", (job.job_type || "—").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())],
        ["Status", (job.status || "—").toUpperCase()],
        ["Priority", (job.priority || "medium").toUpperCase()],
        ["Engineers", engineerNames.length > 0 ? engineerNames.join(", ") : "—"],
      ];

      // Append site details inline
      if (site) {
        if (site.postcode) detailRows.push(["Site Postcode", site.postcode]);
        if (site.contact_name) detailRows.push(["Site Contact", site.contact_name]);
        if (site.contact_phone) detailRows.push(["Contact Phone", site.contact_phone]);
        if (site.contact_email) detailRows.push(["Contact Email", site.contact_email]);
      }

      y = sectionTitle(doc, "Job Details", y, margin, maxWidth);
      const labelW = maxWidth * 0.3;
      const valW = maxWidth * 0.7;
      detailRows.forEach(([label, value]) => {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        const cols: TableCol[] = [
          { text: label, x: margin, width: labelW, bold: true },
          { text: String(value ?? ""), x: margin + labelW, width: valW },
        ];
        const h = measureTableRowHeight(doc, cols, rowH);
        checkPage(h);
        const drawn = drawTableRow(doc, y, cols, rowH, margin, maxWidth);
        y += drawn;
      });
      y += 6;

      // ── SITE DETAILS TABLE ──
      // Backfill from latest submitted form responses when no site row exists or fields are empty
      const responseSiteName = sheetResponses.map((r: any) => r.responses?.site_name || r.responses?.site).find((v: any) => v && String(v).trim());
      const responseSiteAddress = sheetResponses.map((r: any) => r.responses?.site_address || r.responses?.address).find((v: any) => v && String(v).trim());
      const siteName = site?.name || responseSiteName || "";
      const siteAddress = site?.address || responseSiteAddress || "";
      console.log("[JobPdfReport] site fields", { fromSiteRow: !!site, siteName, siteAddress });
      if (site || siteName || siteAddress) {
        checkPage(30);
        y = sectionTitle(doc, "Site Details", y, margin, maxWidth);
        const siteRows: [string, string][] = [
          ["Site Name", siteName || "—"],
          ["Address", siteAddress || "—"],
          ["Postcode", site?.postcode || "—"],
          ["Contact", site?.contact_name || "—"],
          ["Phone", site?.contact_phone || "—"],
          ["Email", site?.contact_email || "—"],
        ].filter(([, v]) => v !== "—") as [string, string][];
        siteRows.forEach(([label, value]) => {
          const cols: TableCol[] = [
            { text: label, x: margin, width: labelW, bold: true },
            { text: value, x: margin + labelW, width: valW },
          ];
          const h = measureTableRowHeight(doc, cols, rowH);
          checkPage(h);
          y += drawTableRow(doc, y, cols, rowH, margin, maxWidth);
        });
        y += 6;
      }

      // ── VISITS TABLE ──
      if (visits.length > 0) {
        checkPage(20);
        y = sectionTitle(doc, "Visits", y, margin, maxWidth);
        const dateW = maxWidth * 0.25;
        const statusW = maxWidth * 0.2;
        const notesW = maxWidth * 0.55;
        // Header
        y += drawTableRow(doc, y, [
          { text: "Date", x: margin, width: dateW, bold: true },
          { text: "Status", x: margin + dateW, width: statusW, bold: true },
          { text: "Notes", x: margin + dateW + statusW, width: notesW, bold: true },
        ], rowH, margin, maxWidth, [235, 240, 248]);
        visits.forEach((v: any) => {
          const cols: TableCol[] = [
            { text: v.scheduled_date || "—", x: margin, width: dateW },
            { text: (v.status || "—").toUpperCase(), x: margin + dateW, width: statusW },
            { text: v.notes || "—", x: margin + dateW + statusW, width: notesW },
          ];
          const h = measureTableRowHeight(doc, cols, rowH);
          checkPage(h);
          y += drawTableRow(doc, y, cols, rowH, margin, maxWidth);
        });
        y += 6;
      }

      // ── PARTS TABLE ──
      if (parts.length > 0) {
        checkPage(20);
        y = sectionTitle(doc, "Parts & Materials", y, margin, maxWidth);
        const nameW = maxWidth * 0.55;
        const qtyW = maxWidth * 0.1;
        const noteW = maxWidth * 0.35;

        y += drawTableRow(doc, y, [
          { text: "Part Name", x: margin, width: nameW, bold: true },
          { text: "Qty", x: 0, width: qtyW, bold: true, align: "center" },
          { text: "Notes", x: 0, width: noteW, bold: true },
        ], rowH, margin, maxWidth, [235, 240, 248]);
        parts.forEach((p: any) => {
          const cols: TableCol[] = [
            { text: p.name || "—", x: margin, width: nameW },
            { text: String(p.quantity), x: 0, width: qtyW, align: "center" },
            { text: p.notes || "", x: 0, width: noteW },
          ];
          const h = measureTableRowHeight(doc, cols, rowH);
          checkPage(h);
          y += drawTableRow(doc, y, cols, rowH, margin, maxWidth);
        });
        y += 6;
      }

      // ── ENGINEER CERTIFICATES ──
      if (certs.length > 0) {
        checkPage(20);
        y = sectionTitle(doc, "Engineer Certificates", y, margin, maxWidth);

        const certNameW = maxWidth * 0.55;
        const certEngW = maxWidth * 0.25;
        const certDateW = maxWidth * 0.2;

        y += drawTableRow(doc, y, [
          { text: "Certificate / Document", x: margin, width: certNameW, bold: true },
          { text: "Engineer", x: 0, width: certEngW, bold: true },
          { text: "Attached", x: 0, width: certDateW, bold: true, align: "center" },
        ], rowH, margin, maxWidth, [235, 240, 248]);

        certs.forEach((c: any) => {
          const withoutPrefix = (c.file_name || "").replace(/^\[Cert\]\s*/, "");
          const sepIdx = withoutPrefix.lastIndexOf(" — ");
          const certTitle = sepIdx > -1 ? withoutPrefix.slice(0, sepIdx) : withoutPrefix;
          const engName = engineerProfileMap[c.engineer_id] || "Unknown";
          const dateStr = new Date(c.created_at).toLocaleDateString("en-GB");
          // Zebra body stripes intentionally removed — they blank the
          // watermark inconsistently. Only header rows carry solid fills.
          const cols: TableCol[] = [
            { text: certTitle, x: margin, width: certNameW },
            { text: engName, x: 0, width: certEngW },
            { text: dateStr, x: 0, width: certDateW, align: "center" },
          ];
          const h = measureTableRowHeight(doc, cols, rowH);
          checkPage(h);
          y += drawTableRow(doc, y, cols, rowH, margin, maxWidth);
        });
        y += 6;
      }

      // ── JOB SHEET RESPONSES (tabular fallback) ──
      // Skipped when the user opted to embed the *filled* sheet report(s)
      // at the top of the export via pdf-lib merge — those render as the
      // full customer sheet PDF and this compact table would just duplicate.
      if (!includeFilledSheets && sheetResponses.length > 0) {
        for (const resp of sheetResponses) {
          const tpl = templateMap[resp.template_id];
          if (!tpl) continue;

          checkPage(20);
          y = sectionTitle(doc, `Job Sheet: ${tpl.name}`, y, margin, maxWidth);

          const fields = tpl.fields || [];
          const responses = resp.responses || {};
          // Identify repeating_table fields containing a photo_gallery column
          // (dwelling access log style) — these are rendered separately with
          // a professional layout instead of as flat label/value rows.
          const galleryFields = fields.filter((f: any) =>
            f.type === "repeating_table" &&
            Array.isArray(f.columns) &&
            f.columns.some((c: any) => c?.type === "photo_gallery")
          );
          const gallerySkipIds = new Set(galleryFields.map((f: any) => f.id));
          const sections = [...new Set(fields.map((f: any) => f.section || "General"))] as string[];
          const fieldLabelW = maxWidth * 0.6;
          const fieldValW = maxWidth * 0.4;

          for (const section of sections) {
            const sectionFields = fields.filter((f: any) =>
              (f.section || "General") === section && !gallerySkipIds.has(f.id)
            );
            if (sectionFields.length === 0) continue;

            checkPage(12);
            // Sub-section header
            y += drawTableRow(doc, y, [
              { text: section.toUpperCase(), x: margin, width: maxWidth, bold: true },
            ], rowH, margin, maxWidth, [220, 225, 235]);

            for (const field of sectionFields) {
              const val = responses[field.id];
              let displayVal = "—";
              let valColor: [number, number, number] | undefined;
              // For long descriptive values, don't force centre alignment —
              // wrapped multi-line text reads better left-aligned.
              let valAlign: "left" | "center" | "right" = "center";

              if (field.type === "pass_fail") {
                const normalizedVal = typeof val === "string" ? val.toLowerCase().trim() : "";
                if (normalizedVal === "pass") { displayVal = "PASS"; valColor = [0, 128, 0]; }
                else if (normalizedVal === "fail") { displayVal = "FAIL"; valColor = [200, 0, 0]; }
                else if (normalizedVal === "n/a") { displayVal = "N/A"; valColor = [120, 120, 120]; }
                else if (val !== undefined && val !== null && val !== "") { displayVal = String(val).toUpperCase(); }
              } else if (field.type === "checkbox") {
                const normalizedVal = typeof val === "string" ? val.toLowerCase().trim() : "";
                if (normalizedVal === "yes" || normalizedVal === "true" || val === true) {
                  displayVal = "YES";
                } else if (normalizedVal === "no" || normalizedVal === "false" || val === false) {
                  displayVal = "NO";
                } else if (normalizedVal === "n/a" || normalizedVal === "na") {
                  displayVal = "N/A";
                  valColor = [120, 120, 120];
                } else if (val !== undefined && val !== null && val !== "") {
                  displayVal = String(val).toUpperCase();
                }
              } else if (field.type === "photo") {
                displayVal = val ? "✓ Captured" : "—";
              } else if (val !== undefined && val !== null && val !== "") {
                const raw = String(val);
                displayVal = raw.charAt(0).toUpperCase() + raw.slice(1);
                // Long descriptive answers wrap and read best left-aligned.
                if (raw.length > 24) valAlign = "left";
              }

              // Zebra body stripes intentionally removed — they blank the
              // watermark inconsistently. Header rows above keep their fill.
              const cols: TableCol[] = [
                { text: field.label, x: margin, width: fieldLabelW },
                { text: displayVal, x: 0, width: fieldValW, bold: !!valColor, color: valColor, align: valAlign },
              ];
              const rowNeeded = measureTableRowHeight(doc, cols, rowH);
              checkPage(rowNeeded + 4);
              y += drawTableRow(doc, y, cols, rowH, margin, maxWidth);

              // Inline note — wraps within page width
              const noteVal = responses[`${field.id}_notes`];
              if (noteVal) {
                doc.setFontSize(9);
                doc.setFont("helvetica", "italic");
                doc.setTextColor(100, 100, 100);
                const noteLines = doc.splitTextToSize(`Note: ${noteVal}`, maxWidth - 8);
                noteLines.forEach((ln: string) => {
                  checkPage(4);
                  doc.text(ln, margin + 4, y + 3);
                  y += 4;
                });
                doc.setTextColor(30, 30, 30);
                doc.setFontSize(11);
                doc.setFont("helvetica", "normal");
                y += 1;
              }
            }
          }
          // Render dwelling access log fields with rich layout
          for (const galField of galleryFields) {
            y = await renderDwellingAccessLog(
              doc, galField, responses[galField.id], y, margin, maxWidth, 297, 22
            );
          }
          y += 6;
        }
      }

      // ── SERVEXA REPORTS ──
      if (includeFieldReports && reports.length > 0) {
        checkPage(20);
        y = sectionTitle(doc, "Servexa Reports", y, margin, maxWidth);
        reports.forEach((r: any) => {
          checkPage(15);
          y += drawTableRow(doc, y, [
            { text: r.title || "Untitled Report", x: margin, width: maxWidth, bold: true },
          ], rowH, margin, maxWidth, [245, 248, 255]);
          if (r.summary) {
            const lines = doc.splitTextToSize(r.summary, maxWidth - 4);
            lines.forEach((line: string) => {
              checkPage(5);
              doc.setFontSize(11);
              doc.setFont("helvetica", "normal");
              doc.text(line, margin + 2, y + 4);
              y += 4;
            });
          }
          y += 4;
        });
        y += 4;
      }

      // ── ENGINEER NOTES ──
      const notes = submissions.filter((s: any) => s.type === "note" && s.content);
      if (notes.length > 0) {
        checkPage(20);
        y = sectionTitle(doc, "Engineer Notes", y, margin, maxWidth);
        const noteDateW = maxWidth * 0.2;
        const noteTextW = maxWidth * 0.8;
        y += drawTableRow(doc, y, [
          { text: "Date", x: margin, width: noteDateW, bold: true },
          { text: "Note", x: 0, width: noteTextW, bold: true },
        ], rowH, margin, maxWidth, [235, 240, 248]);
        notes.forEach((n: any) => {
          const cols: TableCol[] = [
            { text: new Date(n.created_at).toLocaleDateString("en-GB"), x: margin, width: noteDateW },
            { text: n.content || "", x: 0, width: noteTextW },
          ];
          const h = measureTableRowHeight(doc, cols, rowH);
          checkPage(h);
          y += drawTableRow(doc, y, cols, rowH, margin, maxWidth);
        });
        y += 6;
      }

      // ── JOB PHOTOS (grid, 2 per row) ──
      if (jobPhotos.length > 0) {
        checkPage(20);
        y = sectionTitle(doc, `Job Photos (${jobPhotos.length})`, y, margin, maxWidth);
        const gap = 5;
        const cols = 2;
        const cellW = (maxWidth - gap * (cols - 1)) / cols;
        const cellH = 60;                 // mm — image area
        const captionH = 12;              // mm — 2 lines of meta
        const blockH = cellH + captionH + 4;

        let col = 0;
        for (const ph of jobPhotos) {
          if (col === 0) checkPage(blockH);
          const xPos = margin + col * (cellW + gap);

          // Neutral cell background so letterboxed images look intentional.
          doc.setFillColor(...PDF_PALETTE.zebra);
          doc.setDrawColor(...PDF_PALETTE.borderSoft);
          doc.setLineWidth(0.2);
          doc.rect(xPos, y, cellW, cellH, "FD");

          // Aspect-preserving fit
          const ratio = ph.natW / ph.natH || 1;
          let drawW = cellW - 2;
          let drawH = drawW / ratio;
          if (drawH > cellH - 2) {
            drawH = cellH - 2;
            drawW = drawH * ratio;
          }
          const ix = xPos + (cellW - drawW) / 2;
          const iy = y + (cellH - drawH) / 2;
          try {
            doc.addImage(ph.dataUrl, "JPEG", ix, iy, drawW, drawH, undefined, "FAST");
          } catch {
            doc.setFontSize(9);
            doc.setTextColor(150, 150, 150);
            doc.text("Image unavailable", xPos + cellW / 2, y + cellH / 2, { align: "center" });
          }

          // Caption block: caption (bold), then engineer · date/time
          const ts = new Date(ph.createdAt);
          const dateStr = ts.toLocaleDateString("en-GB");
          const timeStr = ts.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
          const meta = [ph.engineerName, `${dateStr} ${timeStr}`].filter(Boolean).join(" · ");

          doc.setFontSize(8.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(40, 40, 40);
          const capText = ph.caption || ph.fileName;
          const capLines = doc.splitTextToSize(capText, cellW).slice(0, 1);
          doc.text(capLines[0] || "", xPos, y + cellH + 4);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(110, 110, 110);
          const metaLines = doc.splitTextToSize(meta, cellW).slice(0, 1);
          doc.text(metaLines[0] || "", xPos, y + cellH + 8);
          doc.setTextColor(0, 0, 0);

          col++;
          if (col >= cols) {
            col = 0;
            y += blockH;
          }
        }
        if (col !== 0) y += blockH;
        y += 4;
      }


      // ── SIGNATURES ──
      // Compact block (~32mm ≈ 120px per signature) so it flows onto the
      // bottom of the previous page when there is room. Only break to a new
      // page if less than ~32mm remains.
      // Dedupe: multiple test sign-offs by the same person (same name+role)
      // should collapse to the LATEST one. Also drop rows that have no
      // file_path at all — those are placeholder rows with no signature image
      // and would print as an empty row.
      const dedupedSignatures = (() => {
        const byKey = new Map<string, any>();
        for (const s of signatures) {
          if (!s.file_path) continue;
          const key = `${(s.signer_name || "").trim().toLowerCase()}|${s.signer_role || ""}`;
          const existing = byKey.get(key);
          if (!existing || new Date(s.created_at).getTime() > new Date(existing.created_at).getTime()) {
            byKey.set(key, s);
          }
        }
        return Array.from(byKey.values());
      })();
      if (dedupedSignatures.length > 0) {
        const PAGE_BOTTOM = 275;
        const SIG_BLOCK_H = 32; // mm — title(7) + name row(6) + image(16) + gap(3)
        // Section title — only force a new page when the whole block won't fit.
        if (y + SIG_BLOCK_H > PAGE_BOTTOM) addPage();
        y = sectionTitle(doc, "Sign-Off Signatures", y, margin, maxWidth);
        for (const sig of dedupedSignatures) {

          // Per-signature: only break if this one signature won't fit.
          if (y + 22 > PAGE_BOTTOM) addPage();
          const signerLabel = sig.signer_name
            ? `${sig.signer_name}${sig.signer_position ? ", " + sig.signer_position : ""} (${sig.signer_role})`
            : `Not recorded (${sig.signer_role})`;
          const ts = new Date(sig.created_at).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
          const sigHeader = drawTableRow(doc, y, [
            { text: signerLabel, x: margin, width: maxWidth * 0.6, bold: true },
            { text: ts, x: 0, width: maxWidth * 0.4, align: "right" },
          ], 6, margin, maxWidth, [245, 248, 255]);
          y += sigHeader + 1;
          try {
            const { data: urlData } = await supabase.storage.from("signatures").createSignedUrl(sig.file_path, 60);
            if (urlData?.signedUrl) {
              const response = await fetch(urlData.signedUrl);
              const blob = await response.blob();
              const dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              doc.addImage(dataUrl, "PNG", margin, y, 50, 16);
              y += 17;
            }
          } catch {
            doc.text("[Signature unavailable]", margin, y + 3);
            y += 5;
          }
          y += 2;
        }
      }

      // ── DECLARATION FOOTER (dry riser pressure test) ──
      const hasPressureTest = (job.category || "").toLowerCase().includes("dry riser") ||
        templates.some((t: any) => (t.name || "").toLowerCase().includes("pressure") && sheetResponses.some((r: any) => r.template_id === t.id));
      const hasVisual = templates.some((t: any) => (t.name || "").toLowerCase().includes("visual") && sheetResponses.some((r: any) => r.template_id === t.id));

      if (hasPressureTest || hasVisual) {
        checkPage(20);
        y += 4;
        doc.setDrawColor(0);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 30, 30);

        if (hasVisual) {
          doc.rect(margin, y, maxWidth, 12);
          doc.text("Visual inspection completed in accordance with", pageWidth / 2, y + 4.5, { align: "center" });
          doc.text("BS 9990:2015", pageWidth / 2, y + 9, { align: "center" });
          y += 14;
        }
      }

      // ── WATERMARK + ACCREDITATIONS on every page ──
      const custAccredUrls = await fetchCustomerAccreditationLogos(job.customers?.name || job.customer);
      const [watermark, accredLogos] = await Promise.all([
        loadWatermarkImage(),
        loadAccreditationLogos(custAccredUrls),
      ]);
      // Accreditation logos sit just above the footer line drawn at y=286.
      await renderBrandingOverlay(doc, {
        watermark,
        brandColor: brandProfile.accentColor,
        accredLogos,
        accredFooterY: 286,
        accredLogoH: PDF_DIMENSIONS.accredLogoH,
      });

      // ── FOOTER on every page ──
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150, 150, 150);
        doc.text(`${job.reference_number}  —  Page ${i} of ${pageCount}`, pageWidth / 2, 290, { align: "center" });
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, 286, pageWidth - margin, 286);
      }


      // ── Prepend filled-in sheet PDFs (same look as customer sheet PDF) ──
      // We render each selected submitted response via the shared
      // `generateJobSheetPdf` helper and stitch them in front of the job
      // report using pdf-lib so the client sees the completed sheet first.
      let finalBytes: Uint8Array | ArrayBuffer;
      if (includeFilledSheets && sheetResponses.length > 0) {
        try {
          const merged = await PDFDocument.create();
          const jobInfoForSheet: any = {
            customer: job.customers?.name || job.customer || "",
            site_name: site?.name || "",
            site_address: site?.address || "",
            po_number: job.customer_po || "",
            reference_number: job.reference_number || "",
            date: new Date().toLocaleDateString("en-GB"),
          };
          for (const resp of sheetResponses) {
            const tpl = templateMap[resp.template_id];
            if (!tpl) continue;
            const submitterName = resp.submitted_by ? engineerProfileMap[resp.submitted_by] : undefined;
            try {
              const { base64 } = await generateJobSheetPdf(
                tpl,
                resp.responses || {},
                jobInfoForSheet,
                jobId,
                submitterName,
                resp.submitted_at || resp.created_at,
                job.category_name || job.job_category?.name,
              );
              const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
              const src = await PDFDocument.load(bytes);
              const pages = await merged.copyPages(src, src.getPageIndices());
              pages.forEach((p) => merged.addPage(p));
            } catch (sheetErr) {
              console.warn("[JobPdfReport] filled sheet render failed", tpl.name, sheetErr);
            }
          }
          // Append the main job report after the filled sheets.
          const jobReportBytes = doc.output("arraybuffer");
          const src = await PDFDocument.load(jobReportBytes);
          const pages = await merged.copyPages(src, src.getPageIndices());
          pages.forEach((p) => merged.addPage(p));
          finalBytes = await merged.save();
        } catch (mergeErr) {
          console.warn("[JobPdfReport] pdf-lib merge failed, saving report only", mergeErr);
          finalBytes = doc.output("arraybuffer");
        }
      } else {
        finalBytes = doc.output("arraybuffer");
      }

      // Trigger download of the (possibly merged) bytes.
      const blob = new Blob([finalBytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${job.reference_number}-report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF generated", description: `${job.reference_number}-report.pdf downloaded.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)} disabled={generating}>
        {generating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileDown className="mr-1.5 h-4 w-4" />}
        {generating ? "Generating..." : "Export PDF Report"}
      </Button>

      <ExportBundlePickerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        jobId={jobId}
        confirmLabel="Generate PDF"
        generating={generating}
        onConfirm={generate}
      />
    </>
  );

}

function extractPath(fileUrl: string): string | null {
  if (!fileUrl) return null;
  const match = fileUrl.match(/\/object\/(?:public|sign)\/submissions\/(.+?)(?:\?|$)/);
  if (match) return match[1];
  if (!fileUrl.startsWith("http")) return fileUrl;
  return null;
}
