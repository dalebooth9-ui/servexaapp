import jsPDF from "jspdf";
import {
  loadWatermarkSettings,
  type WatermarkSettings,
} from "@/hooks/useWatermarkSettings";
import { addWatermarkToAllPages } from "@/lib/pdfWatermark";
import { addAccreditationLogosToAllPages } from "@/lib/pdfAccreditations";
import type { RgbTriple } from "@/lib/extractLogoColors";
import {printPdfProfiles} from '@/lib/printPdfProfile';

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
    accreditationOpacity:
      typeof override?.accreditationOpacity === "number"
        ? override.accreditationOpacity
        : base.accreditationOpacity,
  };
}

/** Render the Viva Flame watermark and accreditation logos on every page. The
 *  watermark and accreditation logo row honour independent opacity values so
 *  they can be tuned separately. Pass a per-export override (from the PDF
 *  preview dialog) to deviate from the org-wide defaults. */
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
  const entry=printPdfProfiles.get(doc);
  if(entry){
    const {profile,logoPages}=entry;
    args.watermark=null;
    if(profile.watermarkUrl){const img=new Image();img.src=profile.watermarkUrl;await img.decode();args.watermark=img;args.brandColor=null;settings.mode='untinted';settings.opacity=0.11;}
    for(let page=1;page<=doc.getNumberOfPages();page++){
      doc.setPage(page);
      if(!logoPages.has(page)&&profile.logoImage){const img=profile.logoImage;const w=Math.min(35,6*img.naturalWidth/img.naturalHeight);const h=w*img.naturalHeight/img.naturalWidth;doc.addImage(img,'PNG',doc.internal.pageSize.getWidth()-w-10,2,w,h);}
      if(profile.servicedBy){doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(80);doc.text(profile.servicedBy,doc.internal.pageSize.getWidth()/2,doc.internal.pageSize.getHeight()-4,{align:'center'});}
    }
  }

  if (args.watermark) {
    addWatermarkToAllPages(doc, args.watermark, args.brandColor, {
      mode: settings.mode,
      opacity: settings.opacity,
    });
  }

  // Accreditation logos honour the mode toggle (so "none" hides them too) but
  // use their own dedicated opacity, independent of the watermark.
  if (settings.mode !== "none" && args.accredLogos.length > 0) {
    addAccreditationLogosToAllPages(
      doc,
      args.accredLogos,
      args.accredFooterY,
      args.accredLogoH ?? 7,
      settings.accreditationOpacity,
    );
  }

  return settings;
}
