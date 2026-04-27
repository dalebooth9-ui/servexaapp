/**
 * PDF colour palette — single source of truth for every named fill, border, and
 * ink colour used across the document generators.
 *
 * Rules:
 *  - Generators MUST use these tokens instead of hard-coded RGB literals.
 *  - The only legitimate exceptions are caller-supplied colours (e.g. the RAMS
 *    risk-rating red/amber/green legend) and the dynamic per-customer brand
 *    colour, which is resolved through `brandedNavy()` below.
 *
 * Hex equivalents are kept as comments for designers.
 */
export type RGB = [number, number, number];

export const PDF_PALETTE = {
  // Brand
  navy: [33, 61, 99] as RGB, // #213D63 — section title bands, page-break headers
  navyText: [255, 255, 255] as RGB,

  // Section / table headers
  headerStrip: [217, 217, 217] as RGB, // #D9D9D9 — default section header bar
  headerSoft: [235, 235, 235] as RGB, // #EBEBEB — handfill / lighter band
  headerTable: [230, 230, 230] as RGB, // #E6E6E6 — table column headers

  // Zebra row tint
  zebra: [248, 248, 248] as RGB, // #F8F8F8 — alternating data rows

  // Borders
  border: [180, 180, 180] as RGB, // standard row / cell border
  borderSoft: [220, 220, 220] as RGB, // image cells, faint dividers

  // Text
  ink: [30, 30, 30] as RGB, // body text
  inkMuted: [110, 117, 125] as RGB, // micro labels (e.g. "CONTRACT NO.")
  inkDark: [33, 37, 41] as RGB, // strong labels
  white: [255, 255, 255] as RGB,
} as const;

/**
 * Branding object as produced by the report branding engine. Only the fields
 * actually consumed by PDF row chrome are typed here; the engine returns more.
 */
export interface PdfBrandingTokens {
  primary?: RGB;
  primaryText?: RGB;
}

/**
 * Resolve the navy/primary band colour. Per-customer branding (when present)
 * wins over the platform default — this lets `JobPdfReport`, `PreStartChecklist`,
 * etc. theme automatically without each generator re-implementing the override.
 */
export function brandedNavy(branding?: PdfBrandingTokens): RGB {
  return branding?.primary ?? PDF_PALETTE.navy;
}

export function brandedNavyText(branding?: PdfBrandingTokens): RGB {
  return branding?.primaryText ?? PDF_PALETTE.navyText;
}
