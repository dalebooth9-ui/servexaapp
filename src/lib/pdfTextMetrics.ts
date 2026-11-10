/**
 * Text widths that match what a PDF viewer actually paints.
 *
 * jsPDF carries its own approximate width table for the standard Helvetica
 * faces. It is up to ~1% narrow per glyph, so a line drawn with
 * `doc.getTextWidth()` (an underline under a heading, for example) stops short
 * of the last letter, and centred text sits slightly off centre. The PDFs the
 * app writes declare no /Widths array, so viewers lay the glyphs out with the
 * real Adobe AFM metrics. These tables are those metrics, so anything that has
 * to line up with painted text measures with them.
 */

// Widths per 1000 em, characters 32..126 in order, then the WinAnsi extras the
// app actually prints. Helvetica-Oblique shares Helvetica's widths and
// Helvetica-BoldOblique shares Helvetica-Bold's.
const HELVETICA_32_126 = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const HELVETICA_BOLD_32_126 = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

// ellipsis, quoteleft, quoteright, quotedblleft, quotedblright, bullet,
// endash, emdash, trademark, euro sign.
const HELVETICA_EXTRAS: Record<number, number> = {
  128: 556, 133: 1000, 145: 222, 146: 222, 147: 333, 148: 333, 149: 350,
  150: 333, 151: 1000, 153: 980,
};

const HELVETICA_BOLD_EXTRAS: Record<number, number> = {
  128: 556, 133: 1000, 145: 278, 146: 278, 147: 474, 148: 474, 149: 350,
  150: 333, 151: 1000, 153: 1000,
};

function tableOf(base: number[], extras: Record<number, number>): Record<number, number> {
  const table: Record<number, number> = {};
  base.forEach((w, i) => { table[32 + i] = w; });
  for (const [code, w] of Object.entries(extras)) table[Number(code)] = w;
  return table;
}

const AFM_TABLES: Record<string, Record<number, number>> = {
  "Helvetica": tableOf(HELVETICA_32_126, HELVETICA_EXTRAS),
  "Helvetica-Oblique": tableOf(HELVETICA_32_126, HELVETICA_EXTRAS),
  "Helvetica-Bold": tableOf(HELVETICA_BOLD_32_126, HELVETICA_BOLD_EXTRAS),
  "Helvetica-BoldOblique": tableOf(HELVETICA_BOLD_32_126, HELVETICA_BOLD_EXTRAS),
};

/** True when this font's widths are known here, so the measurement is exact. */
export function hasExactTextWidth(doc: any): boolean {
  const postScriptName = doc?.internal?.getFont?.()?.postScriptName;
  return Boolean(postScriptName && AFM_TABLES[postScriptName]);
}

/**
 * Width of `text` in the document's own units (mm on a `unit: "mm"` doc),
 * using the real font metrics a PDF viewer paints with. Falls back to jsPDF's
 * own measurement for fonts not listed here (embedded/custom fonts).
 */
export function pdfTextWidthUnits(doc: any, text: string): number {
  const postScriptName = doc?.internal?.getFont?.()?.postScriptName;
  const table = postScriptName ? AFM_TABLES[postScriptName] : undefined;
  if (!table) return doc.getTextWidth(text);

  let sum = 0;
  for (let i = 0; i < text.length; i++) {
    const w = table[text.charCodeAt(i)];
    if (w === undefined) return doc.getTextWidth(text);
    sum += w;
  }
  // setFontSize is always points; scaleFactor converts document units to points.
  const widthPt = (sum / 1000) * doc.getFontSize();
  return widthPt / doc.internal.scaleFactor;
}
