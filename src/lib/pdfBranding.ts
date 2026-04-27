import jsPDF from "jspdf";
import {
  loadWatermarkSettings,
  type WatermarkSettings,
} from "@/hooks/useWatermarkSettings";
import { addWatermarkToAllPages } from "@/lib/pdfWatermark";
import { addAccreditationLogosToAllPages } from "@/lib/pdfAccreditations";
import type { RgbTriple } from "@/lib/extractLogoColors";

/** Per-export override that the PDF preview dialog can pass back. */
export type WatermarkOverride = Partial<WatermarkSettings>;

/** Resolve the effective watermark settings — the saved org-wide value with
 *  any per-export override applied. */
export async function resolveWatermarkSettings(
  override?: WatermarkOverride | null,
): Promise<WatermarkSettings> {
  const base = await loadWatermarkSettings();
  return {
    mode: override?.mode ?? base.mode,
    opacity: typeof override?.opacity === "number" ? override.opacity : base.opacity,
  };
}

/** Render the Viva Flame watermark and accreditation logos on every page using
 *  the same opacity / mode so they always blend identically. Pass a per-export
 *  override (from the PDF preview dialog) to deviate from the org-wide default. */
export async function renderBrandingOverlay(
  doc: jsPDF,
  args: {
    watermark: HTMLImageElement | null;
    brandColor?: RgbTriple | null;
    accredLogos: (HTMLImageElement | null)[];
    accredFooterY: number;
    accredLogoH?: number;
    override?: WatermarkOverride | null;
  },
): Promise<WatermarkSettings> {
  const settings = await resolveWatermarkSettings(args.override);

  if (args.watermark) {
    addWatermarkToAllPages(doc, args.watermark, args.brandColor, {
      mode: settings.mode,
      opacity: settings.opacity,
    });
  }

  // Accreditation logos honour the same mode + opacity. "none" hides them too
  // so the footer stays consistent with the watermark choice.
  if (settings.mode !== "none" && args.accredLogos.length > 0) {
    addAccreditationLogosToAllPages(
      doc,
      args.accredLogos,
      args.accredFooterY,
      args.accredLogoH ?? 7,
      settings.opacity,
    );
  }

  return settings;
}
