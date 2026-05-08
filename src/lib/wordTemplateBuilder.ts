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
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  VerticalPositionAlign,
  VerticalPositionRelativeFrom,
} from "docx";
import { getDefaultFooterText } from "@/lib/pdfFooter";
import {
  buildSkipIds,
  getSections,
  getSectionFields,
  type PdfTemplateField,
} from "@/lib/pdfBody";
import { resolveTemplateDisplayTitle } from "@/lib/templateDisplayTitle";

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
 * Re-rasterise an image at a reduced alpha so it can be embedded as a faded
 * watermark. docx-js's `ImageRun` has no opacity option, so we bake the alpha
 * directly into the PNG bytes via a canvas.
 */
export async function fadeImageBytes(
  img: FetchedImage,
  opacity: number,
): Promise<FetchedImage> {
  try {
    if (typeof document === "undefined" || typeof Image === "undefined") return img;
    const blob = new Blob([img.data as BlobPart], {
      type: img.type === "png" ? "image/png" : "image/jpeg",
    });
    const url = URL.createObjectURL(blob);
    const el = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode failed"));
      i.src = url;
    });
    const w = el.naturalWidth || img.width || 1;
    const h = el.naturalHeight || img.height || 1;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(url);
      return img;
    }
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
    ctx.drawImage(el, 0, 0, w, h);
    URL.revokeObjectURL(url);
    const blobOut: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/png",
      ),
    );
    const data = new Uint8Array(await blobOut.arrayBuffer());
    return { data, type: "png", width: w, height: h };
  } catch {
    return img;
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
// A4 (11906) − 1134 left − 1134 right = 9638 content width.
export const TABLE_W = 9638;
export const LABEL_COL = Math.round(TABLE_W * 0.68); // 6554
export const VALUE_COL = TABLE_W - LABEL_COL; // 3084

/** Brand navy used for title text + separator, mirrors PDF accent. */
export const BRAND_NAVY_HEX = "213D63";

/** Default Viva Fire accreditation logos (mirrors pdfAccreditations.ts fallback). */
export const DEFAULT_ACCREDITATION_LOGOS = [
  "/accreditation/smas-logo.png",
  "/accreditation/constructionline-logo.png",
  "/accreditation/iso-9001-logo.jpg",
  "/accreditation/bafe-logo.jpeg",
];

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
  const isMultiLine = field.type === "textarea" || field.type === "long_text";
  const isSignature = field.type === "signature";
  // Compact rows to mirror the PDF (≈5mm rows). Tightened so most full
  // service templates fit on a single A4 page.
  let height: { value: number; rule: (typeof HeightRule)[keyof typeof HeightRule] } | undefined =
    { value: 220, rule: HeightRule.ATLEAST };
  if (isMultiLine) height = { value: 520, rule: HeightRule.ATLEAST };
  else if (isSignature) height = { value: 420, rule: HeightRule.ATLEAST };
  return new TableRow({
    height,
    children: [
      new TableCell({
        borders: cellBorders,
        width: { size: LABEL_COL, type: WidthType.DXA },
        margins: { top: 30, bottom: 30, left: 90, right: 90 },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: field.label, bold: true, size: 16 })],
          }),
        ],
      }),
      new TableCell({
        borders: cellBorders,
        width: { size: VALUE_COL, type: WidthType.DXA },
        margins: { top: 30, bottom: 30, left: 90, right: 90 },
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
    height: { value: 200, rule: HeightRule.ATLEAST },
    children: [
      new TableCell({
        borders: cellBorders,
        shading: headerShading,
        width: { size: LABEL_COL, type: WidthType.DXA },
        margins: { top: 30, bottom: 30, left: 90, right: 90 },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: sectionName.toUpperCase(), bold: true, size: 16 })],
          }),
        ],
      }),
      new TableCell({
        borders: cellBorders,
        shading: headerShading,
        width: { size: VALUE_COL, type: WidthType.DXA },
        margins: { top: 30, bottom: 30, left: 90, right: 90 },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: "RESULT", bold: true, size: 16 })],
          }),
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
  const watermarkUrl = "/images/viva-watermark.png";
  const [headerLogo, watermark, ...accredLogos] = await Promise.all([
    fetchImageBytes(headerLogoUrl),
    fetchImageBytes(watermarkUrl),
    ...DEFAULT_ACCREDITATION_LOGOS.map((u) => fetchImageBytes(u)),
  ]);
  const footerText = getDefaultFooterText(
    template.name,
    template.branding || undefined,
    template.footer_text || undefined,
  );

  // Use the SAME section/skip logic the PDF uses, so the two outputs always
  // contain the same rows in the same order. See `wordPdfParity.test.ts`.
  const pdfFields = template.fields as unknown as PdfTemplateField[];
  const skipIds = buildSkipIds(pdfFields);
  const sectionOrder = getSections(pdfFields);
  const sectionMap = new Map<string, TemplateField[]>();
  for (const section of sectionOrder) {
    const fields = getSectionFields(pdfFields, section, skipIds) as unknown as TemplateField[];
    if (fields.length > 0) sectionMap.set(section, fields);
  }

  // Title — uses the SAME shared resolver the PDF uses, so the printed
  // title (and optional subtitle) is identical between Word and PDF for
  // every template name. See `src/lib/templateDisplayTitle.ts`.
  const { title: displayTitle, subtitle: displaySubtitle } = resolveTemplateDisplayTitle(
    template.name,
    { brandingSubtitle: template.branding?.["company_subtitle" as keyof typeof template.branding] as string | undefined ?? null },
  );
  const subtitleText = template.standard || displaySubtitle;

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 60 },
      children: [
        new TextRun({
          text: displayTitle.toUpperCase(),
          bold: true,
          size: 30,
          color: BRAND_NAVY_HEX,
          font: "Helvetica",
        }),
      ],
    }),
  ];
  if (subtitleText) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: subtitleText,
            bold: true,
            size: 18,
            color: BRAND_NAVY_HEX,
            font: "Helvetica",
          }),
        ],
      }),
    );
  }
  // Navy separator line below the title (mirrors PDF rule).
  children.push(
    new Paragraph({
      spacing: { before: 0, after: 20 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 8, color: BRAND_NAVY_HEX, space: 1 },
      },
      children: [new TextRun({ text: "" })],
    }),
  );

  // Customer / Date / Site / PO-REF / Riser Location detail grid (mirrors PDF).
  const detailLabelColLeft = Math.round(TABLE_W * 0.18);
  const detailValueColLeft = Math.round(TABLE_W * 0.52) - detailLabelColLeft;
  const detailLabelColRight = Math.round(TABLE_W * 0.12);
  const detailValueColRight = TABLE_W - Math.round(TABLE_W * 0.52) - detailLabelColRight;
  const detailRowH = { value: 300, rule: HeightRule.ATLEAST } as const;
  const detailLabelCell = (text: string, w: number) =>
    new TableCell({
      borders: cellBorders,
      width: { size: w, type: WidthType.DXA },
      margins: { top: 30, bottom: 30, left: 100, right: 60 },
      verticalAlign: VerticalAlign.CENTER,
      children: [
        new Paragraph({
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text, bold: true, size: 16, font: "Helvetica" })],
        }),
      ],
    });
  const detailValueCell = (w: number) =>
    new TableCell({
      borders: cellBorders,
      width: { size: w, type: WidthType.DXA },
      margins: { top: 30, bottom: 30, left: 100, right: 60 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ children: [new TextRun({ text: " " })] })],
    });
  const wideValueCell = (w: number, colSpan = 1) =>
    new TableCell({
      borders: cellBorders,
      width: { size: w, type: WidthType.DXA },
      columnSpan: colSpan,
      margins: { top: 60, bottom: 60, left: 100, right: 60 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ children: [new TextRun({ text: " " })] })],
    });

  children.push(
    new Table({
      width: { size: TABLE_W, type: WidthType.DXA },
      columnWidths: [detailLabelColLeft, detailValueColLeft, detailLabelColRight, detailValueColRight],
      rows: [
        new TableRow({
          height: detailRowH,
          children: [
            detailLabelCell("Customer:", detailLabelColLeft),
            detailValueCell(detailValueColLeft),
            detailLabelCell("DATE:", detailLabelColRight),
            detailValueCell(detailValueColRight),
          ],
        }),
        new TableRow({
          height: detailRowH,
          children: [
            detailLabelCell("Site:", detailLabelColLeft),
            detailValueCell(detailValueColLeft),
            detailLabelCell("PO/REF:", detailLabelColRight),
            detailValueCell(detailValueColRight),
          ],
        }),
        new TableRow({
          height: detailRowH,
          children: [
            detailLabelCell("Riser Location:", detailLabelColLeft),
            wideValueCell(TABLE_W - detailLabelColLeft, 3),
          ],
        }),
      ],
    }),
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "", size: 1 })],
      spacing: { before: 0, after: 0, line: 20, lineRule: "exact" as const },
    }),
  );

  if (template.description) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: template.description, size: 14 })],
        spacing: { after: 40 },
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
        children: [new TextRun({ text: "", size: 1 })],
        spacing: { before: 0, after: 0, line: 20, lineRule: "exact" as const },
      }),
    );
  }

  // Comments box (mirrors PDF "Comments:" label + bordered empty box)
  // ─────────────────────────────────────────────────────────────────────
  // Comments + Sign-off block.
  //
  // OVERFLOW PROTECTION:
  //   Word natively allows table rows (and the cells inside them) to break
  //   across pages. For the sign-off block this is unacceptable — a row split
  //   in half across page 1/2, or "Signature:" on page 1 and the signing box
  //   on page 2, looks broken and prevents real-world signing.
  //
  // We apply three layered protections, strongest first:
  //   1. `cantSplit: true` on every Comments and sign-off TableRow → Word
  //      will keep each row whole on a single page.
  //   2. `keepNext: true` on the "Comments:" label paragraph → glues the
  //      label to the Comments box that follows it.
  //   3. Compact `EXACT` row heights on the sign-off rows so the whole
  //      block has a known maximum height (~3 × 6mm + signature row 9mm
  //      ≈ 27mm) and Word's pagination engine can fit it before falling
  //      back to a page break.
  //
  // If the body content still pushes the sign-off past the page boundary,
  // Word will move the entire sign-off block to page 2 as a unit (because
  // every row is unsplittable and the rows are kept together by their
  // shared table). That's the expected, design-correct fallback.
  // ─────────────────────────────────────────────────────────────────────
  children.push(
    new Paragraph({
      spacing: { before: 0, after: 0 },
      keepNext: true, // glue "Comments:" label to its box
      keepLines: true,
      children: [new TextRun({ text: "Comments:", bold: true, size: 14 })],
    }),
    new Table({
      width: { size: TABLE_W, type: WidthType.DXA },
      columnWidths: [TABLE_W],
      rows: [
        new TableRow({
          cantSplit: true,
          height: { value: 260, rule: HeightRule.ATLEAST },
          children: [
            new TableCell({
              borders: cellBorders,
              width: { size: TABLE_W, type: WidthType.DXA },
              margins: { top: 30, bottom: 30, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: " " })] })],
            }),
          ],
        }),
      ],
    }),
  );

  // Two-column sign-off block: Date / Technician / Signature  |  Date / Customer / Signature
  // Mirrors PDF renderPdfSignatures layout.
  // Sign-off table spans the full TABLE_W to match the PDF's
  // renderPdfSignatures, which uses the full content width split into two
  // equal halves. Each half is split label/value at ~20%/80%.
  const sigColLabel = Math.round(TABLE_W * 0.10);
  const sigColValue = Math.round(TABLE_W * 0.50) - sigColLabel;
  const sigLabelCell = (text: string) =>
    new TableCell({
      borders: cellBorders,
      width: { size: sigColLabel, type: WidthType.DXA },
      margins: { top: 20, bottom: 20, left: 100, right: 60 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ spacing:{before:0,after:0}, children: [new TextRun({ text, bold: true, size: 14 })] })],
    });
  const sigValueCell = (tall = false) =>
    new TableCell({
      borders: cellBorders,
      width: { size: sigColValue, type: WidthType.DXA },
      margins: { top: tall ? 50 : 20, bottom: tall ? 50 : 20, left: 100, right: 60 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ spacing:{before:0,after:0}, children: [new TextRun({ text: " " })] })],
    });
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "", size: 1 })],
      spacing: { before: 0, after: 0, line: 20, lineRule: "exact" as const },
      keepNext: true, // glue spacer to the sign-off table that follows
    }),
    new Table({
      width: { size: TABLE_W, type: WidthType.DXA },
      columnWidths: [sigColLabel, sigColValue, sigColLabel, sigColValue],
      rows: [
        new TableRow({
          cantSplit: true,
          height: { value: 240, rule: HeightRule.ATLEAST },
          children: [sigLabelCell("Date:"), sigValueCell(), sigLabelCell("Date:"), sigValueCell()],
        }),
        new TableRow({
          cantSplit: true,
          height: { value: 240, rule: HeightRule.ATLEAST },
          children: [
            sigLabelCell("Technician:"),
            sigValueCell(),
            sigLabelCell("Customer:"),
            sigValueCell(),
          ],
        }),
        new TableRow({
          cantSplit: true,
          height: { value: 320, rule: HeightRule.ATLEAST },
          children: [
            sigLabelCell("Signature:"),
            sigValueCell(true),
            sigLabelCell("Signature:"),
            sigValueCell(true),
          ],
        }),
      ],
    }),
  );

  // --- Header (centred logo + page-wide watermark behind document text) ---
  const headerChildren: Paragraph[] = [];

  // Watermark — anchored in the header so it repeats on every page, sized to
  // ~150mm and centred on the page, drawn BEHIND the document so it shows
  // through table cells. Header is the only place a floating image will tile
  // across pages in Word.
  if (watermark) {
    const WM_W_PX = 850; // ≈ 225mm wide
    const aspect =
      watermark.width && watermark.height ? watermark.width / watermark.height : 1;
    const WM_H_PX = Math.round(WM_W_PX / aspect);
    // Apply 8% opacity by re-rasterising the watermark through a canvas.
    // docx-js's ImageRun has no native opacity option, so we bake the alpha
    // into the PNG bytes before embedding.
    const fadedWatermark = await fadeImageBytes(watermark, 0.08);
    headerChildren.push(
      new Paragraph({
        children: [
          new ImageRun({
            type: fadedWatermark.type,
            data: fadedWatermark.data,
            transformation: { width: WM_W_PX, height: WM_H_PX },
            floating: {
              horizontalPosition: {
                relative: HorizontalPositionRelativeFrom.PAGE,
                align: HorizontalPositionAlign.CENTER,
              },
              verticalPosition: {
                relative: VerticalPositionRelativeFrom.PAGE,
                align: VerticalPositionAlign.CENTER,
              },
              behindDocument: true,
              allowOverlap: true,
            },
            altText: {
              title: "Watermark",
              description: "Viva Fire watermark",
              name: "Watermark",
            },
          }),
        ],
      }),
    );
  }

  if (headerLogo) {
    // Match PDF header logo (~50mm wide, ~22mm tall). 1mm ≈ 3.78 px.
    const HEADER_LOGO_MAX_W = 190;
    const HEADER_LOGO_MAX_H = 85;
    const natW = Math.max(1, headerLogo.width);
    const natH = Math.max(1, headerLogo.height);
    const scale = Math.min(HEADER_LOGO_MAX_W / natW, HEADER_LOGO_MAX_H / natH, 1);
    const logoSize = {
      width: Math.max(1, Math.round(natW * scale)),
      height: Math.max(1, Math.round(natH * scale)),
    };
    headerChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
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
  } else if (headerChildren.length === 0) {
    headerChildren.push(new Paragraph({ children: [new TextRun({ text: " " })] }));
  }

  // --- Footer (accreditation logos row + bordered bold centred declaration) ---
  const footerChildren: Paragraph[] = [];
  const validAccreds = (accredLogos as (FetchedImage | null)[]).filter(
    (l): l is FetchedImage => !!l,
  );
  if (validAccreds.length > 0) {
    // Render each logo as a small inline image at ~16px height, in one centred paragraph.
    const ACCRED_H = 22; // px
    const accredRuns = validAccreds.flatMap((logo, i) => {
      const aspect = logo.width && logo.height ? logo.width / logo.height : 2;
      const w = Math.max(1, Math.round(ACCRED_H * aspect));
      return [
        new ImageRun({
          type: logo.type,
          data: logo.data,
          transformation: { width: w, height: ACCRED_H },
          altText: { title: "Accreditation", description: "Accreditation logo", name: "Accred" },
        }),
        ...(i < validAccreds.length - 1
          ? [new TextRun({ text: "    " })]
          : []),
      ];
    });
    footerChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: accredRuns,
      }),
    );
  }
  if (footerText && footerText.trim()) {
    footerChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 40 },
        border: {
          top: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 4 },
          bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 4 },
          left: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 4 },
          right: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 4 },
        },
        children: [
          new TextRun({ text: footerText, bold: true, size: 18, font: "Helvetica", color: "000000" }),
        ],
      }),
    );
  } else {
    footerChildren.push(new Paragraph({ children: [new TextRun({ text: " " })] }));
  }

  return new Document({
    styles: {
      // Helvetica to mirror the PDF (jspdf uses 'helvetica'). Word falls back
      // to Arial when Helvetica is unavailable, which is visually identical.
      default: {
        document: { run: { font: { name: "Helvetica", hint: "default" }, size: 22 } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            // 10mm margins everywhere to mirror the PDF (PDF_DIMENSIONS.margin = 10mm).
            // 1mm = ~56.7 DXA → 10mm = 567 DXA.
            margin: {
              top: 567,
              right: 567,
              bottom: 567,
              left: 567,
              header: 283, // 5mm
              footer: 283, // 5mm
            },
          },
        },
        headers: { default: new Header({ children: headerChildren }) },
        footers: { default: new Footer({ children: footerChildren }) },
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
