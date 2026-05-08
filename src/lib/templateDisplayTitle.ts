/**
 * Single source of truth for the display title and subtitle shown on
 * blank/filled template exports. Both the PDF generator
 * (`BlankTemplatePdfExport`, `JobSheetPdfExport`) and the Word generator
 * (`wordTemplateBuilder`) consume this helper so the printed title above
 * the document chrome is always identical between the two formats.
 *
 * Add new template-name → title overrides here only. Both generators will
 * pick them up automatically.
 */
export type TemplateDisplayTitle = {
  /** Main title shown centred above the detail grid (e.g. "DRY RISER PRESSURE TEST"). */
  title: string;
  /** Optional smaller subtitle line under the title (e.g. "Wet & Dry Riser Specialists"). */
  subtitle?: string;
};

const RISER_SUBTITLE = "Wet & Dry Riser Specialists";

/** Heuristic match — same regex used historically in PDF generators. */
function isDryRiserName(name: string): boolean {
  return /dry\s*riser/i.test(name);
}
function isWetRiserName(name: string): boolean {
  return /wet\s*riser/i.test(name);
}

/**
 * Resolve the display title + subtitle for a template name. Falls back to
 * the raw template name when no override applies.
 */
export function resolveTemplateDisplayTitle(
  templateName: string,
  opts: { brandingSubtitle?: string | null } = {},
): TemplateDisplayTitle {
  const name = (templateName || "").trim();

  if (isDryRiserName(name)) {
    return { title: "Dry Riser Pressure Test", subtitle: RISER_SUBTITLE };
  }
  if (isWetRiserName(name)) {
    return { title: "Wet Riser Pressure Test", subtitle: RISER_SUBTITLE };
  }

  return {
    title: name,
    subtitle: opts.brandingSubtitle?.trim() || undefined,
  };
}
