/**
 * JobWordReport — "Export to Word (.docx)" companion to CustomerReportPdf.
 *
 * Produces the same branded customer report as an editable .docx so the
 * office can tweak wording before sending. Uses the `docx` npm library
 * entirely client-side, matching the PDF's information architecture:
 *   • Branded header (logo + JOB REPORT + ref / date)
 *   • Customer / Site block
 *   • Job info (status, category, dates, engineers)
 *   • Submitted job-sheet responses (one section per template)
 *   • Parts used
 *   • Comments (from submissions.type = "comment")
 *   • Signatures (embedded PNGs)
 *   • Accreditation footer note
 *
 * NOTE: We deliberately keep this simpler than the PDF (no photo grid,
 * no watermark) — the goal is an editable draft, not a pixel-perfect
 * replica. Formatting stays close to the PDF's Viva-Fire navy palette.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType, PageBreak,
} from "docx";
import {
  loadEngineerSignatureLibrary, findEngineerSignatureByName,
} from "@/lib/engineerSignatureLibrary";

interface Props {
  jobId: string;
  job: any;
}

// Viva Fire navy — matches PDF_PALETTE.navy (33, 61, 99).
const NAVY_HEX = "213D63";
const BORDER_HEX = "B4B4B4";

const border = { style: BorderStyle.SINGLE, size: 4, color: BORDER_HEX };
const cellBorders = { top: border, bottom: border, left: border, right: border };

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

function renderResponseValue(v: any): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.map(renderResponseValue).join(", ");
  if (typeof v === "object") {
    // Photo gallery / attachment refs — summarise.
    if (Array.isArray((v as any).photos)) return `${(v as any).photos.length} photo(s) attached`;
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

export default function JobWordReport({ jobId, job }: Props) {
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const generate = async () => {
    setGenerating(true);
    try {
      const [visitsRes, partsRes, assignRes, sigRes, sheetsRes, subsRes] = await Promise.all([
        supabase.from("job_visits").select("*").eq("job_id", jobId).order("scheduled_date", { ascending: true }),
        supabase.from("job_parts").select("*").eq("job_id", jobId),
        supabase.from("job_assignments").select("engineer_id").eq("job_id", jobId),
        supabase.from("job_signatures").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("job_sheet_responses")
          .select("id, template_id, responses, submitted_at")
          .eq("job_id", jobId).eq("status", "submitted"),
        supabase.from("submissions").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
      ]);

      const engIds = [...new Set((assignRes.data || []).map((a: any) => a.engineer_id))];
      let engineerNames: string[] = [];
      if (engIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", engIds);
        engineerNames = (profiles || []).map((p: any) => p.full_name || "Unknown");
      }

      // Template names for section headings.
      const tplIds = [...new Set((sheetsRes.data || []).map((s: any) => s.template_id).filter(Boolean))];
      const tplNames: Record<string, string> = {};
      if (tplIds.length) {
        const { data: tpls } = await supabase
          .from("job_sheet_templates").select("id, name").in("id", tplIds as string[]);
        (tpls || []).forEach((t: any) => { tplNames[t.id] = t.name; });
      }

      // Logo (customer brand > default Viva).
      const logoUrl = job?.customers?.logo_url || "/images/vivafire-logo-new.jpg";
      const logoBuf = await urlToArrayBuffer(logoUrl);

      // Signatures — download PNG bytes.
      const signatures = (sigRes.data as any[]) || [];
      const sigLib = await loadEngineerSignatureLibrary();
      const sigEntries: { role: string; name: string; date: string; bytes: ArrayBuffer | null }[] = [];
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
      // Fallback: if no engineer signature captured for this job, use stored one.
      if (!sigEntries.some((s) => s.role.toLowerCase().includes("engineer"))) {
        const first = engineerNames[0];
        if (first) {
          const stored = findEngineerSignatureByName(sigLib, first);
          if (stored?.file_path) {
            let bytes: ArrayBuffer | null = null;
            try {
              const { data } = await supabase.storage.from("signatures")
                .createSignedUrl(stored.file_path, 3600);
              if (data?.signedUrl) bytes = await urlToArrayBuffer(data.signedUrl);
            } catch { /* ignore */ }
            if (bytes) sigEntries.push({ role: "Engineer", name: first, date: fmtDate(new Date().toISOString()), bytes });
          }
        }
      }

      // ── Build docx body ────────────────────────────────────────────────
      const children: (Paragraph | Table)[] = [];

      // Header: logo + title
      if (logoBuf) {
        children.push(new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [new ImageRun({
            type: "png",
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
      children.push(new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: `Ref: ${job.reference_number || "—"}    Date: ${new Date().toLocaleDateString("en-GB")}`,
          size: 20, color: "555555",
        })],
      }));

      // Customer / Site
      children.push(sectionHeading("Customer & Site"));
      children.push(new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3200, 6160],
        rows: [
          labelValueRow("Customer", job.customers?.name || job.customer || "—"),
          labelValueRow("Contact", job.customers?.email || job.customers?.phone || "—"),
          labelValueRow("Site address", job.address || "—"),
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
          labelValueRow("Brief", job.brief || "—"),
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

      // Job sheet responses
      const sheets = (sheetsRes.data as any[]) || [];
      for (const sheet of sheets) {
        const tplName = tplNames[sheet.template_id] || "Job sheet";
        children.push(sectionHeading(tplName));
        const responses = (sheet.responses || {}) as Record<string, any>;
        const rows = Object.entries(responses)
          .filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0))
          .map(([k, v]) => labelValueRow(k, renderResponseValue(v)));
        if (rows.length) {
          children.push(new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [3200, 6160],
            rows,
          }));
        } else {
          children.push(new Paragraph({ children: [new TextRun({ text: "(no answers recorded)", italics: true, size: 20 })] }));
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

      // Accreditation note
      children.push(new Paragraph({
        spacing: { before: 360 },
        children: [new TextRun({
          text: "Report produced in accordance with the applicable British Standards. Accreditations shown on the branded PDF version.",
          italics: true, size: 18, color: "666666",
        })],
      }));

      const doc = new Document({
        creator: "Servexa",
        title: `Job Report ${job.reference_number || ""}`.trim(),
        styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
        sections: [{
          properties: {
            page: {
              size: { width: 11906, height: 16838 }, // A4
              margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
            },
          },
          children,
        }],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `job-report-${job.reference_number || jobId}.docx`;
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
