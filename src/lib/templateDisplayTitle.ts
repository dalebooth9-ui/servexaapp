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

  // Title MUST come from the actual template the response belongs to — never
  // a hardcoded variant. Previously this collapsed every "Dry Riser *"
  // template to "Dry Riser Pressure Test", so Visual sheets rendered with
  // the wrong heading (regression on VFP-00163). Keep the riser subtitle
  // heuristic (branding line) but always emit the real template name as
  // the title so Visual → "Dry Riser Visual", Pressure Test → "Dry Riser
  // Pressure Test", etc.
  if (isDryRiserName(name) || isWetRiserName(name)) {
    // Riser Viva Fire logo image already contains the "Wet & Dry Riser
    // Specialists" strapline baked in. Emitting it again as a subtitle
    // stacks it under the title and — because the title/subtitle gap is
    // tight at 16pt — causes visible overlap on the printed sheet.
    // Only surface a subtitle when the caller has supplied a NON-default
    // branding line, e.g. a variant strapline for a different brand.
    const branded = opts.brandingSubtitle?.trim();
    const subtitle = branded && branded !== RISER_SUBTITLE ? branded : undefined;
    return { title: name, subtitle };
  }

  return {
    title: name,
    subtitle: opts.brandingSubtitle?.trim() || undefined,
  };
}
