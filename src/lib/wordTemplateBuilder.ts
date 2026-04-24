import {
  Document,
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
} from "docx";
import { getDefaultFooterText } from "@/lib/pdfFooter";

export type TemplateField = {
  id: string;
  label: string;
  type: string; // "text" | "number" | "pass_fail" | "select" | "section" etc.
  options?: string[];
  section?: string;
};

export type WordTemplateInput = {
  name: string;
  description?: string;
  standard?: string;
  fields: TemplateField[];
  footer_text?: string | null;
  branding?: { logo_url?: string; footer_text?: string } | null;
};

// ---------------------------------------------------------------------------
// Image fetching + cache + scaling
// ---------------------------------------------------------------------------

export type FetchedImage = {
  data: Uint8Array;
  type: "png" | "jpg";
  width: number;
  height: number;
};

type CacheEntry = FetchedImage & { cachedAt: number };

const IMAGE_CACHE_TTL_MS = 10 * 60 * 1000;
const imageBytesCache = new Map<string, CacheEntry>();

async function fetchImageBytesUncached(url: string): Promise<FetchedImage | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const mime = res.headers.get("content-type") || "";
    const type: "png" | "jpg" =
      mime.includes("png") || url.toLowerCase().endsWith(".png") ? "png" : "jpg";
    let width = 0;
    let height = 0;
    try {
      const blob = new Blob([buf], {
        type: mime || (type === "png" ? "image/png" : "image/jpeg"),
      });
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
      width = 0;
      height = 0;
    }
    return { data: buf, type, width, height };
  } catch {
    return null;
  }
}

/** Fetch image bytes (with intrinsic dimensions) for a URL, with a 10-minute TTL cache. */
export async function fetchImageBytes(url: string): Promise<FetchedImage | null> {
  const now = Date.now();
  const hit = imageBytesCache.get(url);
  if (hit && now - hit.cachedAt < IMAGE_CACHE_TTL_MS) {
    const { data, type, width, height } = hit;
    return { data, type, width, height };
  }
  const fresh = await fetchImageBytesUncached(url);
  if (fresh) {
    imageBytesCache.set(url, { ...fresh, cachedAt: now });
  } else {
    imageBytesCache.delete(url);
  }
  return fresh;
}

/**
 * Compute proportional pixel dimensions for a logo so it fits within the
 * MAX_LOGO box without distortion or upscaling.
 *
 * docx-js `transformation` is in pixels (1 px = 9525 EMU).
 *   MAX_LOGO_WIDTH_EMU  = 1_440_000 ≈ 2.5 cm
 *   MAX_LOGO_HEIGHT_EMU =   720_000 ≈ 1.25 cm
 */
export const EMU_PER_PX = 9525;
export const MAX_LOGO_WIDTH_EMU = 1_440_000;
export const MAX_LOGO_HEIGHT_EMU = 720_000;
export const MAX_LOGO_WIDTH_PX = MAX_LOGO_WIDTH_EMU / EMU_PER_PX; // ~151
export const MAX_LOGO_HEIGHT_PX = MAX_LOGO_HEIGHT_EMU / EMU_PER_PX; // ~75.6

export function computeLogoSize(
  naturalW: number,
  naturalH: number,
): { width: number; height: number } {
  if (!naturalW || !naturalH) {
    return {
      width: Math.round(MAX_LOGO_WIDTH_PX),
      height: Math.round(MAX_LOGO_HEIGHT_PX),
    };
  }
  const scaleX = MAX_LOGO_WIDTH_PX / naturalW;
  const scaleY = MAX_LOGO_HEIGHT_PX / naturalH;
  const scale = Math.min(scaleX, scaleY, 1.0);
  return {
    width: Math.max(1, Math.round(naturalW * scale)),
    height: Math.max(1, Math.round(naturalH * scale)),
  };
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "B4B4B4" } as const;
export const cellBorders = {
  top: cellBorder,
  bottom: cellBorder,
  left: cellBorder,
  right: cellBorder,
};

// Column widths in DXA — mirrors the PDF's ~68% / 32% split
export const LABEL_COL = 6360;
export const VALUE_COL = 3000;
export const TABLE_W = LABEL_COL + VALUE_COL; // 9360

export const CHECKBOX_EMPTY = "\u2610"; // ☐
export const CHECKBOX_TICK = "\u2611"; // ☑

export function isYesNoOptions(opts?: string[]): boolean {
  if (!opts || opts.length === 0 || opts.length > 3) return false;
  const lower = opts.map((o) => o.toLowerCase());
  return lower.includes("yes") && lower.includes("no");
}

// ---------------------------------------------------------------------------
// Cell / row builders
// ---------------------------------------------------------------------------

/** Build the value-cell content (Paragraph[]) for a blank field row, mirroring the PDF. */
export function buildValueCellChildren(field: TemplateField): Paragraph[] {
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

  if (field.type === "select" && field.options && field.options.length > 0) {
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
    return [
      new Paragraph({
        children: field.options.flatMap((opt, i) => [
          new TextRun({ text: `${CHECKBOX_EMPTY} ${opt}`, size: 18 }),
          ...(i < field.options!.length - 1 ? [new TextRun({ text: "    ", size: 18 })] : []),
        ]),
      }),
    ];
  }

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

  if (field.type === "photo") {
    return [
      new Paragraph({
        children: [
          new TextRun({ text: `${CHECKBOX_EMPTY} Photo attached`, size: 18, color: "555555" }),
        ],
      }),
    ];
  }

  if (field.type === "signature") {
    return [
      new Paragraph({ children: [new TextRun({ text: " ", size: 18 })] }),
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

  if (field.type === "textarea" || field.type === "long_text") {
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
      new Paragraph({
        children: [
          new TextRun({
            text: " ".repeat(60),
            size: 18,
            underline: { type: "single", color: "999999" },
          }),
        ],
      }),
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

export function renderFieldRow(field: TemplateField): TableRow {
  // Multi-line / signature rows need a generous *minimum* height so the row
  // never visually clips, but use HeightRule.ATLEAST so Word can grow the row
  // to fit longer content rather than overlapping the next row.
  const isMultiLine = field.type === "textarea" || field.type === "long_text";
  const isSignature = field.type === "signature";
  let height: { value: number; rule: (typeof HeightRule)[keyof typeof HeightRule] } | undefined;
  if (isMultiLine) height = { value: 1100, rule: HeightRule.ATLEAST };
  else if (isSignature) height = { value: 900, rule: HeightRule.ATLEAST };
  return new TableRow({
    height,
    children: [
      new TableCell({
        borders: cellBorders,
        width: { size: LABEL_COL, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({ children: [new TextRun({ text: field.label, bold: true, size: 20 })] }),
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

/** Section header row — grey banner with "RESULT" in value column, mirrors PDF. */
export function renderSectionHeaderRow(sectionName: string): TableRow {
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
          new Paragraph({ children: [new TextRun({ text: "RESULT", bold: true, size: 20 })] }),
        ],
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Document builder
// ---------------------------------------------------------------------------

/** Build a docx Document for a blank template. */
export async function buildBlankTemplateDoc(template: WordTemplateInput): Promise<Document> {
  const customLogoUrl = template.branding?.logo_url?.trim();
  const headerLogoUrl =
    customLogoUrl && customLogoUrl.length > 0 ? customLogoUrl : "/images/vivafire-logo-new.png";
  const [headerLogo, watermarkImg] = await Promise.all([
    fetchImageBytes(headerLogoUrl),
    fetchImageBytes("/images/viva-watermark.png"),
  ]);
  const footerText = getDefaultFooterText(
    template.name,
    template.branding || undefined,
    template.footer_text || undefined,
  );

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
        children: [
          new TextRun({ text: template.standard, italics: true, size: 20, color: "555555" }),
        ],
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
    children.push(
      new Paragraph({
        children: [new TextRun({ text: " ", size: 12 })],
        spacing: { after: 60 },
      }),
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
      width: { size: TABLE_W, type: WidthType.DXA },
      columnWidths: [LABEL_COL, VALUE_COL],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: cellBorders,
              width: { size: LABEL_COL, type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: "Engineer name", bold: true, size: 20 })],
                }),
              ],
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
          // ATLEAST so Word can expand if a real signature image is taller.
          height: { value: 900, rule: HeightRule.ATLEAST },
          children: [
            new TableCell({
              borders: cellBorders,
              width: { size: LABEL_COL, type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: "Signature", bold: true, size: 20 })],
                }),
              ],
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
              children: [
                new Paragraph({
                  children: [new TextRun({ text: "Date", bold: true, size: 20 })],
                }),
              ],
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

  // --- Header (logo) and footer (text) ---
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
            margin: {
              top: 1700,
              right: 1134,
              bottom: 1134,
              left: 1134,
              header: 567,
              footer: 567,
            },
          },
        },
        headers: { default: new Header({ children: headerChildren }) },
        footers: { default: new Footer({ children: [footerPara] }) },
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
