import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

/** Default Viva Fire accreditation logos used as fallback */
const DEFAULT_ACCREDITATION_LOGOS = [
  "/accreditation/smas-logo.png",
  "/accreditation/constructionline-logo.png",
  "/accreditation/iso-9001-logo.jpg",
  "/accreditation/bafe-logo.jpeg",
];

/**
 * Fetch accreditation logo URLs for a customer from the database.
 * If the customer has their own, return those.
 * If they have none, fall back to the default Viva Fire accreditation logos.
 */
export async function fetchCustomerAccreditationLogos(
  customerName?: string | null
): Promise<string[]> {
  if (!customerName) return DEFAULT_ACCREDITATION_LOGOS;
  try {
    const { data } = await supabase
      .from("customers")
      .select("accreditation_logos")
      .ilike("name", customerName)
      .maybeSingle();
    const logos = (data as any)?.accreditation_logos as string[] | undefined;
    if (logos && logos.length > 0) return logos;
    return DEFAULT_ACCREDITATION_LOGOS;
  } catch {
    return DEFAULT_ACCREDITATION_LOGOS;
  }
}

/**
 * Load accreditation logos from an array of URLs.
 * Returns an array of loaded HTMLImageElements (nulls for failed loads).
 * If no URLs provided, returns an empty array (no logos).
 */
export async function loadAccreditationLogos(
  urls?: string[]
): Promise<(HTMLImageElement | null)[]> {
  if (!urls || urls.length === 0) return [];
  const results = await Promise.all(
    urls.map(
      (src) =>
        new Promise<HTMLImageElement | null>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = src;
        })
    )
  );
  return results;
}

/**
 * Render a centred row of faded accreditation logos above the footer.
 */
export function renderAccreditationLogos(
  doc: jsPDF,
  logos: (HTMLImageElement | null)[],
  rowY: number,
  logoH = 7,
  opacity = 0.22
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const gap = 5;

  const dims = logos.map((img) => {
    if (!img) return null;
    const aspect = img.naturalWidth / img.naturalHeight;
    return { img, w: aspect * logoH };
  });

  const valid = dims.filter(Boolean) as { img: HTMLImageElement; w: number }[];
  if (valid.length === 0) return;

  const totalW = valid.reduce((sum, d) => sum + d.w, 0) + gap * (valid.length - 1);
  let x = (pageWidth - totalW) / 2;

  const gState = (doc as any).GState({ opacity });
  doc.saveGraphicsState();
  (doc as any).setGState(gState);

  for (const { img, w } of valid) {
    try {
      const fmt = img.src.toLowerCase().endsWith(".jpg") || img.src.toLowerCase().endsWith(".jpeg") ? "JPEG" : "PNG";
      doc.addImage(img, fmt, x, rowY, w, logoH);
    } catch {
      // skip failed images
    }
    x += w + gap;
  }

  doc.restoreGraphicsState();
}

/**
 * Render accreditation logos on every page of the document.
 */
export function addAccreditationLogosToAllPages(
  doc: jsPDF,
  logos: (HTMLImageElement | null)[],
  footerY: number,
  logoH = 7,
  opacity = 0.22,
): void {
  if (logos.length === 0) return;
  const pageCount = doc.getNumberOfPages();
  const rowY = footerY - logoH - 3;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    renderAccreditationLogos(doc, logos, rowY, logoH, opacity);
  }
}
