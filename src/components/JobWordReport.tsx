/**
 * JobWordReport — "Export to Word (.docx)" companion to CustomerReportPdf.
 *
 * Produces the same branded customer report as an editable .docx so the
 * office can tweak wording before sending. Uses the `docx` npm library
 * entirely client-side.
 *
 * Rendering rules — matches the PDF (CustomerReportPdf / JobSheetPdfExport):
 *   • Header ONCE — Viva Fire logo + customer/site/ref/date block.
 *     Header fields (site, address, customer, engineer, ref, date, comments,
 *     materials) are excluded from the responses tables via buildSkipIds so
 *     they don't render twice.
 *   • Template-driven — each job_sheet_response is rendered using the
 *     template's field labels and section groupings (never raw field IDs).
 *     Blank/omitted fields and empty sections are skipped.
 *   • Repeating tables (e.g. Dwelling Access Log) render as proper Word
 *     tables using the template's column definitions — one row per entry,
 *     internal `id`/photo columns hidden.
 *   • Accreditation strip in the page footer (customer logos or default
 *     Viva Fire set) + declaration text on every page.
 *   • Engineer signature falls back to the stored engineer_signatures
 *     library (same as the PDF).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  Header, Footer, VerticalAlign,
} from "docx";
import {
  loadEngineerSignatureLibrary, findEngineerSignatureByName,
} from "@/lib/engineerSignatureLibrary";
import {
  isBlankAnswer, filterNonBlankRows,
  buildSkipIds, getRenderableSections, getRenderableSectionFields,
  type PdfTemplateField,
} from "@/lib/pdfBody";
import { fetchCustomerAccreditationLogos } from "@/lib/pdfAccreditations";
import { getDefaultFooterText } from "@/lib/pdfFooter";

interface Props {
  jobId: string;
  job: any;
}

// Viva Fire navy — matches PDF_PALETTE.navy (33, 61, 99).
const NAVY_HEX = "213D63";
const BORDER_HEX = "B4B4B4";

const border = { style: BorderStyle.SINGLE, size: 4, color: BORDER_HEX };
const cellBorders = { top: border, bottom: border, left: border, right: border };
const noBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

function labelValueRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 3200, type: WidthType.DXA },
        borders: cellBorders,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        shading: { fill: "F0F0F0", type: ShadingType.CLEAR, color: "auto" },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20 })] })],
      }),
      new TableCell({
        width: { size: 6160, type: WidthType.DXA },
        borders: cellBorders,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: value || "—", size: 20 })] })],
      }),
    ],
  });
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    shading: { type: ShadingType.CLEAR, fill: NAVY_HEX, color: "auto" },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, color: "FFFFFF", size: 24 })],
  });
}

type ImgFormat = "png" | "jpg" | "gif" | "bmp";
function detectImgFormat(url: string): ImgFormat {
  const u = url.toLowerCase().split("?")[0];
  if (u.endsWith(".png")) return "png";
  if (u.endsWith(".gif")) return "gif";
  if (u.endsWith(".bmp")) return "bmp";
  return "jpg";
}
async function urlToArrayBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch { return null; }
}

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-GB"); } catch { return d; }
}

/** Render a single field value as a display string (non-table fields only). */
function renderFieldValue(field: PdfTemplateField, v: any): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
  }
  if (typeof v === "object") {
    if (Array.isArray((v as any).photos)) return `${(v as any).photos.length} photo(s) attached`;
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  const s = String(v).trim();
  // Handle yes/no style
  const low = s.toLowerCase();
  if (low === "yes" || low === "true") return "Yes";
  if (low === "no" || low === "false") return "No";
  return s;
}

/** Build a repeating-table as a proper Word table using column defs. */
function buildRepeatingTable(field: any, rowsIn: any[]): (Paragraph | Table)[] {
  const rows = filterNonBlankRows(rowsIn);
  if (rows.length === 0) return [];
  const rawCols: any[] = Array.isArray(field.columns) ? field.columns : [];
  // Hide internal columns: id, photo galleries, hidden.
  const columns = rawCols.filter((c) => {
    if (!c) return false;
    const id = String(c.id || "").toLowerCase();
    if (id === "id") return false;
    if (c.type === "photo_gallery" || c.type === "photo" || c.type === "image") return false;
    return true;
  });
  // If no column defs, derive from the union of row keys (excluding id/photos).
  const derivedKeys: string[] = columns.length === 0
    ? Array.from(rows.reduce<Set<string>>((set, r) => {
        Object.keys(r || {}).forEach((k) => {
          if (k === "id") return;
          if (/photo|image|picture/i.test(k)) return;
          set.add(k);
        });
        return set;
      }, new Set()))
    : [];
  const colDefs = columns.length > 0
    ? columns.map((c) => ({ id: String(c.id), label: String(c.label || c.id) }))
    : derivedKeys.map((k) => ({ id: k, label: k.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) }));

  if (colDefs.length === 0) return [];

  const tableWidth = 9360;
  const colW = Math.floor(tableWidth / colDefs.length);
  const colWidths = colDefs.map(() => colW);

  const headerRow = new TableRow({
    tableHeader: true,
    children: colDefs.map((c) => new TableCell({
      width: { size: colW, type: WidthType.DXA },
      borders: cellBorders,
      shading: { type: ShadingType.CLEAR, fill: NAVY_HEX, color: "auto" },
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: [new TextRun({ text: c.label, bold: true, color: "FFFFFF", size: 18 })] })],
    })),
  });

  const bodyRows = rows.map((row) => new TableRow({
    children: colDefs.map((c) => {
      const raw = row?.[c.id];
      let txt: string;
      if (raw == null || raw === "") txt = "—";
      else if (typeof raw === "boolean") txt = raw ? "Yes" : "No";
      else if (Array.isArray(raw)) txt = raw.map((x) => (typeof x === "object" ? "" : String(x))).filter(Boolean).join(", ") || "—";
      else if (typeof raw === "object") { try { txt = JSON.stringify(raw); } catch { txt = "—"; } }
      else txt = String(raw);
      return new TableCell({
        width: { size: colW, type: WidthType.DXA },
        borders: cellBorders,
        margins: { top: 50, bottom: 50, left: 100, right: 100 },
        verticalAlign: VerticalAlign.TOP,
        children: [new Paragraph({ children: [new TextRun({ text: txt, size: 18 })] })],
      });
    }),
  }));

  return [new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...bodyRows],
  })];
}

export default function JobWordReport({ jobId, job }: Props) {
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const generate = async () => {
    setGenerating(true);
    try {
      const custName = job.customers?.name || job.customer || "";
      const [visitsRes, partsRes, assignRes, sigRes, sheetsRes, subsRes, accredUrls] = await Promise.all([
        supabase.from("job_visits").select("*").eq("job_id", jobId).order("scheduled_date", { ascending: true }),
        supabase.from("job_parts").select("*").eq("job_id", jobId),
        supabase.from("job_assignments").select("engineer_id").eq("job_id", jobId),
        supabase.from("job_signatures").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("job_sheet_responses")
          .select("id, template_id, responses, submitted_at")
          .eq("job_id", jobId).eq("status", "submitted"),
        supabase.from("submissions").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        fetchCustomerAccreditationLogos(custName),
      ]);

      const engIds = [...new Set((assignRes.data || []).map((a: any) => a.engineer_id))];
      let engineerNames: string[] = [];
      if (engIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", engIds);
        engineerNames = (profiles || []).map((p: any) => p.full_name || "Unknown");
      }

      // Load templates for each response (name + fields + branding).
      const tplIds = [...new Set((sheetsRes.data || []).map((s: any) => s.template_id).filter(Boolean))];
      const templatesById: Record<string, { name: string; fields: PdfTemplateField[] }> = {};
      if (tplIds.length) {
        const { data: tpls } = await supabase
          .from("job_sheet_templates").select("id, name, fields").in("id", tplIds as string[]);
        (tpls || []).forEach((t: any) => {
          const fields = Array.isArray(t.fields) ? (t.fields as PdfTemplateField[]) : [];
          templatesById[t.id] = { name: t.name, fields };
        });
      }

      // Logo (customer brand > default Viva).
      const logoUrl = job?.customers?.logo_url || "/vivafire-logo.png";
      const logoBuf = await urlToArrayBuffer(logoUrl);
      const logoFmt = detectImgFormat(logoUrl);

      // Accreditation logos → ArrayBuffer for footer strip.
      const accredEntries = await Promise.all(
        (accredUrls || []).slice(0, 6).map(async (u) => ({
          bytes: await urlToArrayBuffer(u),
          fmt: detectImgFormat(u),
        })),
      );
      const accredImgs = accredEntries.filter((e): e is { bytes: ArrayBuffer; fmt: ImgFormat } => !!e.bytes);

      // Signatures — download PNG bytes.
      const signatures = (sigRes.data as any[]) || [];
      const sigLib = await loadEngineerSignatureLibrary();
      type SigEntry = { role: string; name: string; date: string; bytes: ArrayBuffer | null };
      const sigEntries: SigEntry[] = [];
      for (const s of signatures) {
        let bytes: ArrayBuffer | null = null;
        try {
          const { data } = await supabase.storage.from("signatures").createSignedUrl(s.file_path, 3600);
          if (data?.signedUrl) bytes = await urlToArrayBuffer(data.signedUrl);
        } catch { /* ignore */ }
        sigEntries.push({
          role: s.signer_role || "Signature",
          name: s.signer_name || "",
          date: fmtDate(s.created_at),
          bytes,
        });
      }
      // Fallback engineer signature from library (matches PDF behaviour).
      if (!sigEntries.some((s) => s.role.toLowerCase().includes("engineer"))) {
        // Prefer technician_name captured in the response over assigned-engineer list.
        const techFromSheet = ((sheetsRes.data as any[]) || [])
          .map((row: any) => (row?.responses?.technician_name || "").toString().trim())
          .find((v: string) => v.length > 0);
        const techName = techFromSheet || engineerNames[0];
        if (techName) {
          const stored = findEngineerSignatureByName(sigLib, techName);
          if (stored?.file_path) {
            let bytes: ArrayBuffer | null = null;
            try {
              const { data } = await supabase.storage.from("signatures").createSignedUrl(stored.file_path, 3600);
              if (data?.signedUrl) bytes = await urlToArrayBuffer(data.signedUrl);
            } catch { /* ignore */ }
            if (bytes) sigEntries.push({ role: "Engineer", name: techName, date: fmtDate(new Date().toISOString()), bytes });
          }
        }
      }

      // ── Build docx body ────────────────────────────────────────────────
      const children: (Paragraph | Table)[] = [];

      // Header block — logo + title (ONCE — no repeated site/address rows).
      if (logoBuf) {
        children.push(new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [new ImageRun({
            type: logoFmt,
            data: logoBuf,
            transformation: { width: 140, height: 60 },
            altText: { title: "Logo", description: "Company logo", name: "logo" },
          })],
        }));
      }
      children.push(new Paragraph({
        spacing: { before: 120, after: 60 },
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "JOB REPORT", bold: true, color: NAVY_HEX, size: 40 })],
      }));
      // Customer paperwork leads with the customer's PO; internal ref only when missing.
      const _wCustPo = (job.customer_po || "").toString().trim();
      const _wIntRef = (job.reference_number || "").toString().trim();
      const _wRefLine = _wCustPo && _wIntRef && _wCustPo !== _wIntRef
        ? `PO: ${_wCustPo}    Our ref: ${_wIntRef}`
        : `Ref: ${_wCustPo || _wIntRef || "—"}`;
      children.push(new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: `${_wRefLine}    Date: ${new Date().toLocaleDateString("en-GB")}`,
          size: 20, color: "555555",
        })],
      }));

      // Customer / Site (rendered ONCE here — matching fields are skipped in the responses tables).
      children.push(sectionHeading("Customer & Site"));
      const siteName = job.sites?.name || "";
      const siteAddress = job.sites?.address || job.address || "";
      children.push(new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3200, 6160],
        rows: [
          labelValueRow("Customer", custName || "—"),
          labelValueRow("Site", siteName || "—"),
          labelValueRow("Site address", siteAddress || "—"),
          labelValueRow("Contact", job.customers?.email || job.customers?.phone || "—"),
        ],
      }));

      // Job info
      children.push(sectionHeading("Job details"));
      children.push(new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3200, 6160],
        rows: [
          labelValueRow("Job", job.name || "—"),
          labelValueRow("Category", job.category || "—"),
          labelValueRow("Priority", job.priority || "—"),
          labelValueRow("Status", job.status || "—"),
          labelValueRow("Due date", fmtDate(job.due_date)),
          labelValueRow("Engineers", engineerNames.join(", ") || "—"),
          // Internal job brief intentionally omitted from customer-facing report.
        ],
      }));

      // Visits
      const visits = (visitsRes.data as any[]) || [];
      if (visits.length) {
        children.push(sectionHeading("Visits"));
        for (const v of visits) {
          children.push(new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [new TextRun({
              text: `${fmtDate(v.scheduled_date)} — ${v.status || "scheduled"}${v.notes ? ` — ${v.notes}` : ""}`,
              size: 20,
            })],
          }));
        }
      }

      // Template-driven job-sheet responses — use field labels + section order
      // exactly like the PDF, and skip fields already rendered in the header.
      const sheets = (sheetsRes.data as any[]) || [];
      for (const sheet of sheets) {
        const tpl = templatesById[sheet.template_id];
        if (!tpl || !Array.isArray(tpl.fields) || tpl.fields.length === 0) continue;
        const responses = (sheet.responses || {}) as Record<string, any>;
        const skipIds = buildSkipIds(tpl.fields);
        const omittedSections: string[] = Array.isArray((responses as any).__omitted_sections__)
          ? ((responses as any).__omitted_sections__ as string[])
          : [];
        const sections = getRenderableSections(tpl.fields, skipIds, responses, omittedSections);
        if (sections.length === 0) continue;

        // Template name as a top-level section banner (deduped against sections below).
        children.push(sectionHeading(tpl.name || "Job sheet"));

        for (const section of sections) {
          const sectionFields = getRenderableSectionFields(
            tpl.fields, section, skipIds, responses, omittedSections,
          );
          if (sectionFields.length === 0) continue;

          // Sub-section banner (skip if it duplicates the template name).
          if ((section || "").trim().toLowerCase() !== (tpl.name || "").trim().toLowerCase()) {
            children.push(sectionHeading(section));
          }

          // Split simple fields (rendered as one label/value table) from
          // repeating tables (rendered as their own tables).
          const simple = sectionFields.filter((f) => f.type !== "repeating_table");
          const tables = sectionFields.filter((f) => f.type === "repeating_table");

          if (simple.length > 0) {
            const rows: TableRow[] = [];
            for (const f of simple) {
              const raw = responses[f.id];
              if (isBlankAnswer(raw)) continue;
              rows.push(labelValueRow(f.label, renderFieldValue(f, raw)));
              const notesVal = responses[`${f.id}_notes`];
              if (!isBlankAnswer(notesVal)) {
                rows.push(labelValueRow(`${f.label} — notes`, String(notesVal)));
              }
            }
            if (rows.length > 0) {
              children.push(new Table({
                width: { size: 9360, type: WidthType.DXA },
                columnWidths: [3200, 6160],
                rows,
              }));
            }
          }

          for (const tf of tables) {
            let rowsVal = responses[tf.id];
            if (typeof rowsVal === "string" && rowsVal.trim().startsWith("[")) {
              try { rowsVal = JSON.parse(rowsVal); } catch { rowsVal = []; }
            }
            if (!Array.isArray(rowsVal) || rowsVal.length === 0) continue;
            // Field label above the table for clarity.
            children.push(new Paragraph({
              spacing: { before: 160, after: 80 },
              children: [new TextRun({ text: tf.label, bold: true, size: 22, color: NAVY_HEX })],
            }));
            const built = buildRepeatingTable(tf, rowsVal);
            for (const b of built) children.push(b);
          }
        }
      }

      // Parts
      const parts = (partsRes.data as any[]) || [];
      if (parts.length) {
        children.push(sectionHeading("Parts used"));
        children.push(new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [5200, 1500, 2660],
          rows: [
            new TableRow({ children: [
              new TableCell({ width: { size: 5200, type: WidthType.DXA }, borders: cellBorders,
                shading: { type: ShadingType.CLEAR, fill: NAVY_HEX, color: "auto" },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: "Part", bold: true, color: "FFFFFF", size: 20 })] })] }),
              new TableCell({ width: { size: 1500, type: WidthType.DXA }, borders: cellBorders,
                shading: { type: ShadingType.CLEAR, fill: NAVY_HEX, color: "auto" },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: "Qty", bold: true, color: "FFFFFF", size: 20 })] })] }),
              new TableCell({ width: { size: 2660, type: WidthType.DXA }, borders: cellBorders,
                shading: { type: ShadingType.CLEAR, fill: NAVY_HEX, color: "auto" },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: "Notes", bold: true, color: "FFFFFF", size: 20 })] })] }),
            ] }),
            ...parts.map((p: any) => new TableRow({ children: [
              new TableCell({ width: { size: 5200, type: WidthType.DXA }, borders: cellBorders,
                margins: { top: 60, bottom: 60, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: p.name || p.part_name || "—", size: 20 })] })] }),
              new TableCell({ width: { size: 1500, type: WidthType.DXA }, borders: cellBorders,
                margins: { top: 60, bottom: 60, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: String(p.quantity ?? "—"), size: 20 })] })] }),
              new TableCell({ width: { size: 2660, type: WidthType.DXA }, borders: cellBorders,
                margins: { top: 60, bottom: 60, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: p.notes || "", size: 20 })] })] }),
            ] })),
          ],
        }));
      }

      // Comments (submissions type comment)
      const comments = ((subsRes.data as any[]) || []).filter((s: any) => s.type === "comment" && s.content);
      if (comments.length) {
        children.push(sectionHeading("Comments"));
        for (const c of comments) {
          children.push(new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: `${fmtDate(c.created_at)} — `, bold: true, size: 20 }),
              new TextRun({ text: c.content, size: 20 })],
          }));
        }
      }

      // Signatures
      if (sigEntries.length) {
        children.push(sectionHeading("Signatures"));
        for (const s of sigEntries) {
          children.push(new Paragraph({
            spacing: { before: 120 },
            children: [new TextRun({ text: `${s.role}: `, bold: true, size: 20 }),
              new TextRun({ text: `${s.name}   ${s.date}`, size: 20 })],
          }));
          if (s.bytes) {
            children.push(new Paragraph({
              children: [new ImageRun({
                type: "png",
                data: s.bytes,
                transformation: { width: 200, height: 80 },
                altText: { title: "Signature", description: `${s.role} signature`, name: "signature" },
              })],
            }));
          }
        }
      }

      // ── Footer with accreditation logo strip + declaration text ────────
      const footerText = getDefaultFooterText(job.name || "");
      const footerChildren: (Paragraph | Table)[] = [];
      if (accredImgs.length > 0) {
        // One-row table with each accreditation logo in its own borderless cell.
        const cellW = Math.floor(9360 / accredImgs.length);
        footerChildren.push(new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: accredImgs.map(() => cellW),
          rows: [new TableRow({
            children: accredImgs.map((a) => new TableCell({
              width: { size: cellW, type: WidthType.DXA },
              borders: noBorders,
              margins: { top: 40, bottom: 40, left: 40, right: 40 },
              children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new ImageRun({
                  type: a.fmt as any,
                  data: a.bytes,
                  transformation: { width: 70, height: 30 },
                  altText: { title: "Accreditation", description: "Accreditation logo", name: "accred" },
                })],
              })],
            })),
          })],
        }));
      }
      footerChildren.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: footerText || "", italics: true, size: 16, color: "666666" })],
      }));

      const doc = new Document({
        creator: "Servexa",
        title: `Job Report ${job.customer_po || job.reference_number || ""}`.trim(),
        styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
        sections: [{
          properties: {
            page: {
              size: { width: 11906, height: 16838 }, // A4
              margin: { top: 1000, right: 1000, bottom: 1600, left: 1000 },
            },
          },
          footers: {
            default: new Footer({ children: footerChildren }),
          },
          children,
        }],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `job-report-${job.customer_po || job.reference_number || jobId}.docx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast({ title: "Word report ready", description: "Downloaded — edit and send from Word." });
    } catch (e: any) {
      console.error("[JobWordReport]", e);
      toast({ title: "Could not generate Word report", description: e?.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={generate} disabled={generating}>
      {generating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />}
      Export to Word
    </Button>
  );
}
