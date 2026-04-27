/**
 * PDF dimension tokens — single source of truth for layout numbers shared
 * across every generator (margins, accreditation logo strip, watermark sizing,
 * header chrome). Generators should reference these tokens instead of using
 * magic numbers so the document chrome stays visually consistent and any
 * change here propagates to every template.
 *
 * All values are in millimetres unless noted otherwise.
 */
export const PDF_DIMENSIONS = {
  /** A4 page dimensions */
  pageWidth: 210,
  pageHeight: 297,

  /** Default page margin used by JobSheet / BlankTemplate / CustomerReport / Scan / JobReport / PreStart / Cert. */
  margin: 10,
  /** Wider margin used by RAMS and CoC layouts where the bespoke header chrome
   *  needs more breathing room. Kept as a separate token so the divergence is
   *  intentional rather than hard-coded magic. */
  marginWide: 14,

  /** Header height for the shared `renderPdfHeader` chrome. */
  headerHeight: 30,
  /** Customer/brand logo height inside the page header. */
  headerLogoH: 20,

  /** Accreditation logo strip — applied above the footer on every page. */
  accredLogoH: 12,
  /** Vertical breathing room between the accreditation logos and the footer. */
  accredLogoGapToFooter: 3,

  /** Watermark sizing — fraction of page height the watermark occupies. */
  watermarkHeightRatio: 0.85,

  /** Standard footer band height (used to compute `accredFooterY`). */
  footerBandH: 18,
} as const;

/**
 * Resolve the Y coordinate where the accreditation logo strip should land.
 * Logos render above this Y; the helper subtracts logo height + gap internally.
 *
 * Pass an explicit `footerTop` when the generator already knows where the
 * footer chrome begins; otherwise this falls back to a sensible default that
 * leaves room for the standard footer band.
 */
export function resolveAccredFooterY(footerTop?: number): number {
  if (typeof footerTop === "number") return footerTop;
  return PDF_DIMENSIONS.pageHeight - PDF_DIMENSIONS.margin - PDF_DIMENSIONS.footerBandH;
}
