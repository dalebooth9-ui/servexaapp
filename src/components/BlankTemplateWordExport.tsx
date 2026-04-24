import { useState, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Document,
  Packer,
  ImageRun,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
  VerticalAlign,
  HeightRule,
  Header,
  Footer,
  Tab,
  TabStopType,
  TabStopPosition,
} from "docx";
import { getDefaultFooterText } from "@/lib/pdfFooter";

type TemplateField = {
  id: string;
  label: string;
  type: string; // "text" | "number" | "pass_fail" | "select" | "section" etc.
  options?: string[];
  section?: string;
};

type Props = {
  template: {
    name: string;
    description?: string;
    standard?: string;
    fields: TemplateField[];
    footer_text?: string | null;
    branding?: { logo_url?: string; footer_text?: string } | null;
  };
  /** Visual size override; defaults to icon-only sm button to fit alongside other actions. */
  size?: "sm" | "default";
  /** When true, no UI is rendered; only the imperative ref API is exposed. */
  headless?: boolean;
};

/** Fetch an image URL and return raw bytes + mime + natural pixel dimensions; returns null on any error. */
async function fetchImageBytes(
  url: string,
): Promise<{ data: Uint8Array; type: "png" | "jpg"; width: number; height: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const mime = res.headers.get("content-type") || "";
    const type: "png" | "jpg" = mime.includes("png") || url.toLowerCase().endsWith(".png") ? "png" : "jpg";
    // Decode to read intrinsic pixel dimensions for proportional scaling.
    let width = 0;
    let height = 0;
    try {
      const blob = new Blob([buf], { type: mime || (type === "png" ? "image/png" : "image/jpeg") });
      const objectUrl = URL.createObjectURL(blob);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("decode failed"));
        i.src = objectUrl;
      });
      width = img.naturalWidth;
      height = img.naturalHeight;
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Fallback to a sensible default if decoding fails
      width = 0;
      height = 0;
    }
    return { data: buf, type, width, height };
  } catch {
    return null;
  }
}

/**
 * Compute proportional pixel dimensions for a logo so it fits within the
 * MAX_LOGO box without distortion or upscaling.
 *
 * docx-js `transformation` is in pixels (1 px = 9525 EMU).
 *   MAX_LOGO_WIDTH_EMU  = 1_440_000 ≈ 2.5 cm
 *   MAX_LOGO_HEIGHT_EMU =   720_000 ≈ 1.25 cm
 */
const EMU_PER_PX = 9525;
const MAX_LOGO_WIDTH_EMU = 1_440_000;
const MAX_LOGO_HEIGHT_EMU = 720_000;
const MAX_LOGO_WIDTH_PX = MAX_LOGO_WIDTH_EMU / EMU_PER_PX; // ~151
const MAX_LOGO_HEIGHT_PX = MAX_LOGO_HEIGHT_EMU / EMU_PER_PX; // ~75.6

function computeLogoSize(naturalW: number, naturalH: number): { width: number; height: number } {
  if (!naturalW || !naturalH) {
    // Unknown intrinsic size — fall back to the max box, preserving the
    // PDF's previous landscape-ish ratio.
    return { width: Math.round(MAX_LOGO_WIDTH_PX), height: Math.round(MAX_LOGO_HEIGHT_PX) };
  }
  const scaleX = MAX_LOGO_WIDTH_PX / naturalW;
  const scaleY = MAX_LOGO_HEIGHT_PX / naturalH;
  const scale = Math.min(scaleX, scaleY, 1.0);
  return {
    width: Math.max(1, Math.round(naturalW * scale)),
    height: Math.max(1, Math.round(naturalH * scale)),
  };
}

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "B4B4B4" } as const;
const cellBorders = {
  top: cellBorder,
  bottom: cellBorder,
  left: cellBorder,
  right: cellBorder,
};

// Column widths in DXA — mirrors the PDF's ~68% / 32% split
const LABEL_COL = 6360;
const VALUE_COL = 3000;
const TABLE_W = LABEL_COL + VALUE_COL; // 9360

const CHECKBOX_EMPTY = "\u2610"; // ☐
const CHECKBOX_TICK = "\u2611"; // ☑

const SIMPLE_TOKEN_SET = new Set(["yes", "no"]);
function isYesNoOptions(opts?: string[]): boolean {
  if (!opts || opts.length === 0 || opts.length > 3) return false;
  const lower = opts.map((o) => o.toLowerCase());
  return lower.includes("yes") && lower.includes("no");
}

/** Build the value-cell content (Paragraph[]) for a blank field row, mirroring the PDF. */
function buildValueCellChildren(field: TemplateField): Paragraph[] {
  // Pass / Fail / N/A boxes
  if (field.type === "pass_fail") {
    return [
      new Paragraph({
        children: [
          new TextRun({ text: `${CHECKBOX_EMPTY} P    `, size: 18 }),
          new TextRun({ text: `${CHECKBOX_EMPTY} F    `, size: 18 }),
          new TextRun({ text: `${CHECKBOX_EMPTY} N/A`, size: 18 }),
        ],
      }),
    ];
  }

  // Yes / No checkbox-style field
  if (field.type === "checkbox" || field.type === "yes_no") {
    return [
      new Paragraph({
        children: [
          new TextRun({ text: `${CHECKBOX_EMPTY} YES    `, size: 18 }),
          new TextRun({ text: `${CHECKBOX_EMPTY} NO`, size: 18 }),
        ],
      }),
    ];
  }

  // Select with explicit options
  if (field.type === "select" && field.options && field.options.length > 0) {
    // Yes/No-style select renders as compact toggle row
    if (isYesNoOptions(field.options)) {
      return [
        new Paragraph({
          children: field.options.flatMap((opt, i) => [
            new TextRun({ text: `${CHECKBOX_EMPTY} ${opt.toUpperCase()}`, size: 18 }),
            ...(i < field.options!.length - 1 ? [new TextRun({ text: "    ", size: 18 })] : []),
          ]),
        }),
      ];
    }
    // Multi-option select — list each option with a checkbox
    return [
      new Paragraph({
        children: field.options.flatMap((opt, i) => [
          new TextRun({ text: `${CHECKBOX_EMPTY} ${opt}`, size: 18 }),
          ...(i < field.options!.length - 1 ? [new TextRun({ text: "    ", size: 18 })] : []),
        ]),
      }),
    ];
  }

  // Date — labelled blank line with format hint
  if (field.type === "date") {
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: "_______ / _______ / _______",
            size: 18,
            color: "777777",
          }),
        ],
      }),
    ];
  }

  // Number — short underlined slot
  if (field.type === "number") {
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: " ".repeat(20),
            size: 18,
            underline: { type: "single", color: "999999" },
          }),
        ],
      }),
    ];
  }

  // Photo — tickbox + placeholder note
  if (field.type === "photo") {
    return [
      new Paragraph({
        children: [new TextRun({ text: `${CHECKBOX_EMPTY} Photo attached`, size: 18, color: "555555" })],
      }),
    ];
  }

  // Signature — taller blank box (handled via row height)
  if (field.type === "signature") {
    return [
      new Paragraph({
        children: [new TextRun({ text: " ", size: 18 })],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: "Signature: " + " ".repeat(40),
            size: 16,
            color: "777777",
            underline: { type: "single", color: "999999" },
          }),
        ],
      }),
    ];
  }

  // Long text / textarea — multi-line blank
  if (field.type === "textarea" || field.type === "long_text") {
    return [
      new Paragraph({
        children: [new TextRun({ text: " ".repeat(60), size: 18, underline: { type: "single", color: "999999" } })],
      }),
      new Paragraph({
        children: [new TextRun({ text: " ".repeat(60), size: 18, underline: { type: "single", color: "999999" } })],
      }),
      new Paragraph({
        children: [new TextRun({ text: " ".repeat(60), size: 18, underline: { type: "single", color: "999999" } })],
      }),
    ];
  }

  // Default: short text — single underlined line
  return [
    new Paragraph({
      children: [
        new TextRun({
          text: " ".repeat(60),
          size: 18,
          underline: { type: "single", color: "999999" },
        }),
      ],
    }),
  ];
}

function renderFieldRow(field: TemplateField): TableRow {
  // Signature rows need extra height to mirror the PDF's double-row signature area
  const isTall = field.type === "signature" || field.type === "textarea" || field.type === "long_text";
  return new TableRow({
    height: isTall ? { value: 700, rule: HeightRule.ATLEAST } : undefined,
    children: [
      new TableCell({
        borders: cellBorders,
        width: { size: LABEL_COL, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            children: [new TextRun({ text: field.label, bold: true, size: 20 })],
          }),
        ],
      }),
      new TableCell({
        borders: cellBorders,
        width: { size: VALUE_COL, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        children: buildValueCellChildren(field),
      }),
    ],
  });
}

/** Section header row — grey banner spanning label column with "RESULT" in value column, mirrors PDF. */
function renderSectionHeaderRow(sectionName: string): TableRow {
  const headerShading = { fill: "E6E6E6", type: ShadingType.CLEAR, color: "auto" };
  return new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        borders: cellBorders,
        shading: headerShading,
        width: { size: LABEL_COL, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            children: [new TextRun({ text: sectionName.toUpperCase(), bold: true, size: 20 })],
          }),
        ],
      }),
      new TableCell({
        borders: cellBorders,
        shading: headerShading,
        width: { size: VALUE_COL, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            children: [new TextRun({ text: "RESULT", bold: true, size: 20 })],
          }),
        ],
      }),
    ],
  });
}

/** Build a docx Document for a blank template. Exported so bulk export can reuse it. */
export async function buildBlankTemplateDoc(template: Props["template"]): Promise<Document> {
  // --- Branding assets: header logo + watermark + footer text -----------------
  const customLogoUrl = template.branding?.logo_url?.trim();
  const headerLogoUrl = customLogoUrl && customLogoUrl.length > 0 ? customLogoUrl : "/images/vivafire-logo-new.png";
  const [headerLogo, watermarkImg] = await Promise.all([
    fetchImageBytes(headerLogoUrl),
    fetchImageBytes("/images/viva-watermark.png"),
  ]);
  const footerText = getDefaultFooterText(
    template.name,
    template.branding || undefined,
    template.footer_text || undefined,
  );

  // Skip pseudo "section" fields (their label is just a section header from OCR import)
  // and skip fields whose label exactly matches their section name.
  const renderable = template.fields.filter((f) => {
    if (f.type === "section") return false;
    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    if (f.section && norm(f.label) === norm(f.section)) return false;
    return true;
  });

  // Group fields by section, preserving insertion order
  const sectionMap = new Map<string, TemplateField[]>();
  for (const f of renderable) {
    const key = f.section || "Details";
    if (!sectionMap.has(key)) sectionMap.set(key, []);
    sectionMap.get(key)!.push(f);
  }

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: template.name, bold: true })],
    }),
  ];
  if (template.standard) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: template.standard, italics: true, size: 20, color: "555555" })],
        spacing: { after: 120 },
      }),
    );
  }
  if (template.description) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: template.description, size: 20 })],
        spacing: { after: 240 },
      }),
    );
  }

  for (const [sectionName, fields] of sectionMap) {
    if (fields.length === 0) continue;
    children.push(
      new Table({
        width: { size: TABLE_W, type: WidthType.DXA },
        columnWidths: [LABEL_COL, VALUE_COL],
        rows: [renderSectionHeaderRow(sectionName), ...fields.map(renderFieldRow)],
      }),
    );
    // Small gap between sections
    children.push(new Paragraph({ children: [new TextRun({ text: " ", size: 12 })], spacing: { after: 60 } }));
  }

  // Sign-off block
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "Sign-off", bold: true })],
      spacing: { before: 300, after: 100 },
    }),
    new Table({
      width: { size: TABLE_W, type: WidthType.DXA },
      columnWidths: [LABEL_COL, VALUE_COL],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: cellBorders,
              width: { size: LABEL_COL, type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "Engineer name", bold: true, size: 20 })] })],
            }),
            new TableCell({
              borders: cellBorders,
              width: { size: VALUE_COL, type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: " " })] })],
            }),
          ],
        }),
        new TableRow({
          height: { value: 700, rule: HeightRule.ATLEAST },
          children: [
            new TableCell({
              borders: cellBorders,
              width: { size: LABEL_COL, type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "Signature", bold: true, size: 20 })] })],
            }),
            new TableCell({
              borders: cellBorders,
              width: { size: VALUE_COL, type: WidthType.DXA },
              margins: { top: 200, bottom: 200, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: " " })] })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              borders: cellBorders,
              width: { size: LABEL_COL, type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "Date", bold: true, size: 20 })] })],
            }),
            new TableCell({
              borders: cellBorders,
              width: { size: VALUE_COL, type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: " " })] })],
            }),
          ],
        }),
      ],
    }),
  );

  // --- Build header (logo) and footer (text) -----------------------------------
  const headerChildren: Paragraph[] = [];
  if (headerLogo) {
    const logoSize = computeLogoSize(headerLogo.width, headerLogo.height);
    headerChildren.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new ImageRun({
            type: headerLogo.type,
            data: headerLogo.data,
            transformation: logoSize,
            altText: { title: "Logo", description: "Company logo", name: "Logo" },
          }),
        ],
      }),
    );
  }
  // Watermark — large faded image floating behind the page content.
  if (watermarkImg) {
    headerChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: watermarkImg.type,
            data: watermarkImg.data,
            transformation: { width: 480, height: 480 },
            altText: { title: "Watermark", description: "Watermark", name: "Watermark" },
            floating: {
              horizontalPosition: { relative: "page" as any, align: "center" as any },
              verticalPosition: { relative: "page" as any, align: "center" as any },
              behindDocument: true,
              wrap: { type: "none" as any, side: "bothSides" as any },
            },
          }),
        ],
      }),
    );
  }
  if (headerChildren.length === 0) {
    headerChildren.push(new Paragraph({ children: [new TextRun({ text: " " })] }));
  }

  const footerPara = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: footerText, size: 16, color: "666666" })],
  });

  return new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 22 } } },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1700, right: 1134, bottom: 1134, left: 1134, header: 567, footer: 567 },
          },
        },
        headers: {
          default: new Header({ children: headerChildren }),
        },
        footers: {
          default: new Footer({ children: [footerPara] }),
        },
        children,
      },
    ],
  });
}

/** Filename-safe slug for a template name. */
export function blankTemplateFileSlug(name: string): string {
  return (
    name
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "template"
  );
}

/** Build a value-cell preview string mirroring buildValueCellChildren for on-screen review. */
function previewValueForField(field: TemplateField): string {
  const EMPTY = "☐";
  if (field.type === "pass_fail") return `${EMPTY} P    ${EMPTY} F    ${EMPTY} N/A`;
  if (field.type === "checkbox" || field.type === "yes_no") return `${EMPTY} YES    ${EMPTY} NO`;
  if (field.type === "select" && field.options && field.options.length > 0) {
    return field.options.map((o) => `${EMPTY} ${isYesNoOptions(field.options) ? o.toUpperCase() : o}`).join("    ");
  }
  if (field.type === "date") return "_______ / _______ / _______";
  if (field.type === "number") return "____________________";
  if (field.type === "photo") return `${EMPTY} Photo attached`;
  if (field.type === "signature") return "Signature: ____________________________________________";
  if (field.type === "textarea" || field.type === "long_text")
    return "____________________________________________________________\n____________________________________________________________\n____________________________________________________________";
  return "____________________________________________________________";
}

type SectionPreview = { name: string; fields: TemplateField[] };

function buildPreviewSections(template: Props["template"]): SectionPreview[] {
  const renderable = template.fields.filter((f) => {
    if (f.type === "section") return false;
    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    if (f.section && norm(f.label) === norm(f.section)) return false;
    return true;
  });
  const sectionMap = new Map<string, TemplateField[]>();
  for (const f of renderable) {
    const key = f.section || "Details";
    if (!sectionMap.has(key)) sectionMap.set(key, []);
    sectionMap.get(key)!.push(f);
  }
  return Array.from(sectionMap, ([name, fields]) => ({ name, fields }));
}

export type BlankTemplateWordExportHandle = {
  openPreview: () => void;
  download: () => Promise<void> | void;
};

const BlankTemplateWordExport = forwardRef<BlankTemplateWordExportHandle, Props>(function BlankTemplateWordExport(
  { template, size = "sm", headless = false },
  ref,
) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const sections = buildPreviewSections(template);

  const download = async () => {
    setBusy(true);
    try {
      const doc = await buildBlankTemplateDoc(template);
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${blankTemplateFileSlug(template.name)}-blank.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast({ title: "Word document downloaded", description: `${template.name} (.docx)` });
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Word export failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  useImperativeHandle(ref, () => ({
    openPreview: () => setOpen(true),
    download,
  }));

  return (
    <>
      {!headless && (
        <Button
          variant="outline"
          size={size}
          className="h-7 gap-1.5"
          onClick={() => setOpen(true)}
          title="Preview & download blank template as Word (.docx)"
          aria-label={`Preview and download ${template.name} as Word document`}
        >
          <FileText className="h-3.5 w-3.5" aria-hidden />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Preview: {template.name}</DialogTitle>
            <DialogDescription>Review the blank Word document layout below. Download when ready.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto rounded-md border bg-card p-6 text-sm">
            <h2 className="text-center text-xl font-bold">{template.name}</h2>
            {template.standard && <p className="text-center italic text-muted-foreground mt-1">{template.standard}</p>}
            {template.description && <p className="mt-3 text-muted-foreground">{template.description}</p>}

            {sections.map((s) => (
              <div key={s.name} className="mt-5">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border border-border px-2 py-1.5 text-left font-bold uppercase w-[68%]">
                        {s.name}
                      </th>
                      <th className="border border-border px-2 py-1.5 text-left font-bold uppercase">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.fields.map((f) => (
                      <tr key={f.id}>
                        <td className="border border-border px-2 py-1.5 font-medium align-top">{f.label}</td>
                        <td className="border border-border px-2 py-1.5 align-top whitespace-pre-line text-muted-foreground">
                          {previewValueForField(f)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            <div className="mt-6">
              <h3 className="font-bold mb-2">Sign-off</h3>
              <table className="w-full border-collapse text-xs">
                <tbody>
                  <tr>
                    <td className="border border-border px-2 py-1.5 font-medium w-[68%]">Engineer name</td>
                    <td className="border border-border px-2 py-3"></td>
                  </tr>
                  <tr>
                    <td className="border border-border px-2 py-1.5 font-medium">Signature</td>
                    <td className="border border-border px-2 py-6"></td>
                  </tr>
                  <tr>
                    <td className="border border-border px-2 py-1.5 font-medium">Date</td>
                    <td className="border border-border px-2 py-3"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={download} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download .docx
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});

export default BlankTemplateWordExport;
