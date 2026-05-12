/**
 * Dry Riser blank template — shared layout config.
 *
 * SINGLE SOURCE OF TRUTH consumed by BOTH the Word generator
 * (`src/lib/wordTemplateBuilder.ts`) and the PDF generator
 * (`src/components/BlankTemplatePdfExport.tsx`). Changing a value here
 * propagates to both renderers automatically.
 *
 * Pinned by `src/test/dryRiserLayoutParity.test.ts`.
 *
 * Units:
 *   - Word uses DXA (twentieths of a point); 1mm ≈ 56.6929 DXA, but Word
 *     itself rounds to the conventional 567 DXA = 10mm.
 *   - PDF uses millimetres natively (jsPDF default unit).
 */

export const MM_TO_DXA = 56.6929;
export const PT_TO_DXA = 20;

export const mmToDxa = (mm: number): number => Math.round(mm * MM_TO_DXA);
export const ptToDxa = (pt: number): number => Math.round(pt * PT_TO_DXA);
export const mmToPt = (mm: number): number => mm * (72 / 25.4);

/** Detect Dry Riser blank template by name. */
export const isDryRiserName = (name: string | null | undefined): boolean =>
  /dry\s*riser/i.test(name || "");

export const DRY_RISER_LAYOUT = {
  // ── Page (A4 portrait) ────────────────────────────────────────────
  page: {
    widthMm: 210,
    heightMm: 297,
    marginTopMm: 10,
    marginBottomMm: 10,
    marginLeftMm: 12,
    marginRightMm: 12,
    // DXA equivalents — Word's pgSz/pgMar use these directly.
    widthDxa: 11906,
    heightDxa: 16838,
    marginTopDxa: 567, // 10mm
    marginBottomDxa: 567, // 10mm
    marginLeftDxa: 680, // 12mm
    marginRightDxa: 680, // 12mm
  },

  // ── Header ────────────────────────────────────────────────────────
  header: {
    logoHeightMm: 25,
    gapAfterLogoPt: 4,
    titleSizePt: 16,
    subtitleGapPt: 2,
    subtitleSizePt: 10,
    ruleGapPt: 2,
    ruleThicknessPt: 1,
    /** Brand dark blue used for title + subtitle + rule + section headers. */
    brandBlueHex: "1F4E79",
    brandBlueRgb: [31, 78, 121] as [number, number, number],
    /** Total header chrome height estimate in mm — used for elastic math. */
    totalChromeMm: 25 + 1.4 + 5.6 + 0.7 + 3.5 + 0.7 + 0.4, // ≈ 37mm
  },

  // ── Body row heights ──────────────────────────────────────────────
  body: {
    infoRowMm: 6,
    sectionHeaderRowMm: 6,
    fieldRowMm: 6,
    signOffRowMm: 8,
    commentsMinMm: 25,
  },

  // ── Footer (page footer, anchored to page bottom) ─────────────────
  footer: {
    accredStripMm: 18,
    bannerMm: 8,
    /** Total footer height (logos + banner). */
    totalMm: 26,
  },

  // ── Colours ───────────────────────────────────────────────────────
  colours: {
    sectionHeaderFillHex: "1F4E79",
    sectionHeaderTextHex: "FFFFFF",
    cellBorderHex: "B4B4B4",
  },
} as const;

/** Body content width in mm (page width − left − right margins). */
export const dryRiserContentWidthMm = (): number =>
  DRY_RISER_LAYOUT.page.widthMm
  - DRY_RISER_LAYOUT.page.marginLeftMm
  - DRY_RISER_LAYOUT.page.marginRightMm; // 186mm

/** Body content width in DXA (Word). */
export const dryRiserContentWidthDxa = (): number =>
  DRY_RISER_LAYOUT.page.widthDxa
  - DRY_RISER_LAYOUT.page.marginLeftDxa
  - DRY_RISER_LAYOUT.page.marginRightDxa; // 10546

/** Page content height in mm (page height − top − bottom margins). */
export const dryRiserContentHeightMm = (): number =>
  DRY_RISER_LAYOUT.page.heightMm
  - DRY_RISER_LAYOUT.page.marginTopMm
  - DRY_RISER_LAYOUT.page.marginBottomMm; // 277mm

/**
 * Compute the height the Comments cell must take so the body table fills the
 * page exactly between the sign-off block and the page footer.
 *
 * Returns mm. Clamped to `commentsMinMm`. Both renderers call this so the
 * elastic math is byte-identical between Word and PDF.
 */
export function commentsElasticMm(usedAboveMm: number): number {
  const available =
    dryRiserContentHeightMm()
    - DRY_RISER_LAYOUT.header.totalChromeMm
    - usedAboveMm
    - DRY_RISER_LAYOUT.body.signOffRowMm * 3 // 3 sign-off rows
    - DRY_RISER_LAYOUT.footer.totalMm;
  return Math.max(DRY_RISER_LAYOUT.body.commentsMinMm, available);
}

/** DXA variant of `commentsElasticMm`. */
export function commentsElasticDxa(usedAboveDxa: number): number {
  const usedAboveMm = usedAboveDxa / MM_TO_DXA;
  return mmToDxa(commentsElasticMm(usedAboveMm));
}
