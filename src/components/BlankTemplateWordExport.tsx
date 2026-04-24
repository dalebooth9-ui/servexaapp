import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
} from "docx";

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
  };
  /** Visual size override; defaults to icon-only sm button to fit alongside other actions. */
  size?: "sm" | "default";
};

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" } as const;
const cellBorders = {
  top: cellBorder,
  bottom: cellBorder,
  left: cellBorder,
  right: cellBorder,
};

function renderFieldRow(field: TemplateField): TableRow {
  let valueRun: TextRun;
  if (field.type === "pass_fail") {
    valueRun = new TextRun({ text: "☐ Pass    ☐ Fail    ☐ N/A" });
  } else if (field.type === "select" && field.options?.length) {
    valueRun = new TextRun({ text: field.options.map((o) => `☐ ${o}`).join("    ") });
  } else {
    valueRun = new TextRun({ text: " ".repeat(60), underline: { type: "single", color: "999999" } });
  }
  return new TableRow({
    children: [
      new TableCell({
        borders: cellBorders,
        width: { size: 3500, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [
          new Paragraph({
            children: [new TextRun({ text: field.label, bold: true, size: 20 })],
          }),
        ],
      }),
      new TableCell({
        borders: cellBorders,
        width: { size: 5860, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [valueRun] })],
      }),
    ],
  });
}

/** Build a docx Document for a blank template. Exported so bulk export can reuse it. */
export function buildBlankTemplateDoc(template: Props["template"]): Document {
  const sectionMap = new Map<string, TemplateField[]>();
  for (const f of template.fields) {
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
      })
    );
  }
  if (template.description) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: template.description, size: 20 })],
        spacing: { after: 240 },
      })
    );
  }

  for (const [sectionName, fields] of sectionMap) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: sectionName, bold: true })],
        spacing: { before: 200, after: 100 },
      })
    );
    children.push(
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3500, 5860],
        rows: fields.map(renderFieldRow),
      })
    );
  }

  // Sign-off block
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "Sign-off", bold: true })],
      spacing: { before: 300, after: 100 },
    }),
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [3500, 5860],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: cellBorders,
              width: { size: 3500, type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "Engineer name", bold: true, size: 20 })] })],
            }),
            new TableCell({
              borders: cellBorders,
              width: { size: 5860, type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: " " })] })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              borders: cellBorders,
              width: { size: 3500, type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "Signature", bold: true, size: 20 })] })],
            }),
            new TableCell({
              borders: cellBorders,
              width: { size: 5860, type: WidthType.DXA },
              margins: { top: 200, bottom: 200, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: " " })] })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              borders: cellBorders,
              width: { size: 3500, type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "Date", bold: true, size: 20 })] })],
            }),
            new TableCell({
              borders: cellBorders,
              width: { size: 5860, type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: " " })] })],
            }),
          ],
        }),
      ],
    })
  );

  return new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 22 } } },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        children,
      },
    ],
  });
}

/** Filename-safe slug for a template name. */
export function blankTemplateFileSlug(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "template";
}

export default function BlankTemplateWordExport({ template, size = "sm" }: Props) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const generate = async () => {
    setBusy(true);
    try {
      // Group fields by section, preserving order
      const sectionMap = new Map<string, TemplateField[]>();
      for (const f of template.fields) {
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
          })
        );
      }
      if (template.description) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: template.description, size: 20 })],
            spacing: { after: 240 },
          })
        );
      }

      for (const [sectionName, fields] of sectionMap) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: sectionName, bold: true })],
            spacing: { before: 200, after: 100 },
          })
        );
        children.push(
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [3500, 5860],
            rows: fields.map(renderFieldRow),
          })
        );
      }

      // Signature block
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: "Sign-off", bold: true })],
          spacing: { before: 300, after: 100 },
        }),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [3500, 5860],
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  borders: cellBorders,
                  width: { size: 3500, type: WidthType.DXA },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [new Paragraph({ children: [new TextRun({ text: "Engineer name", bold: true, size: 20 })] })],
                }),
                new TableCell({
                  borders: cellBorders,
                  width: { size: 5860, type: WidthType.DXA },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [new Paragraph({ children: [new TextRun({ text: " " })] })],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  borders: cellBorders,
                  width: { size: 3500, type: WidthType.DXA },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [new Paragraph({ children: [new TextRun({ text: "Signature", bold: true, size: 20 })] })],
                }),
                new TableCell({
                  borders: cellBorders,
                  width: { size: 5860, type: WidthType.DXA },
                  margins: { top: 200, bottom: 200, left: 120, right: 120 },
                  children: [new Paragraph({ children: [new TextRun({ text: " " })] })],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  borders: cellBorders,
                  width: { size: 3500, type: WidthType.DXA },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [new Paragraph({ children: [new TextRun({ text: "Date", bold: true, size: 20 })] })],
                }),
                new TableCell({
                  borders: cellBorders,
                  width: { size: 5860, type: WidthType.DXA },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [new Paragraph({ children: [new TextRun({ text: " " })] })],
                }),
              ],
            }),
          ],
        })
      );

      const doc = new Document({
        styles: {
          default: { document: { run: { font: "Arial", size: 22 } } },
        },
        sections: [
          {
            properties: {
              page: {
                size: { width: 11906, height: 16838 }, // A4
                margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
              },
            },
            children,
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safe = template.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "template";
      a.href = url;
      a.download = `${safe}-blank.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast({ title: "Word document downloaded", description: `${template.name} (.docx)` });
    } catch (err: any) {
      toast({ title: "Word export failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size={size}
      className="h-7 gap-1.5"
      onClick={generate}
      disabled={busy}
      title="Download blank template as Word (.docx)"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
    </Button>
  );
}
