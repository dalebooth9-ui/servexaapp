/**
 * Single-source-of-truth branding resolver for PDF documents.
 *
 * One profile per document — the header logo, watermark tint, accreditation
 * strip, and footer must all come from the same source. Priority:
 *
 *   1. Template-level branding override (`template.branding.logo_url`)
 *      — set when a template is explicitly customer-branded.
 *   2. Customer record logo (`customer.logo_url`)
 *      — set when the job's customer has uploaded a logo.
 *   3. Default Viva Fire logo.
 *
 * The watermark accent colour prefers the customer's saved `brand_colour`
 * (hex) so we can tint the STANDARD flame graphic per-customer without
 * shipping bespoke watermark images. If no brand_colour is set but the
 * customer is otherwise branded, we fall back to a neutral grey; if the
 * customer isn't branded at all we extract from the org logo as before.
 */

import { getBrandColorFromLogo, extractDominantColor, rgbToHex, type RgbTriple } from "@/lib/extractLogoColors";

const DEFAULT_LOGO_URL = "/images/vivafire-logo-new.png";

export type DocumentBrandingProfile = {
  /** Logo shown in the PDF header — same source as the accent colour. */
  logoUrl: string;
  /** Loaded image element for the resolved logo (null if load failed). */
  logoImage: HTMLImageElement | null;
  /** Accent RGB used to tint the watermark. Either the customer's saved
   *  `brand_colour`, extracted from `logoImage`, or a neutral grey. */
  accentColor: RgbTriple;
  /** True when a customer branding profile is in effect (customer had a
   *  logo_url or brand_colour). Turns off the org's accreditation strip. */
  isCustomerBranded: boolean;
  /** Header company name to display (may be undefined for default). */
  companyName?: string;
  /** Header subtitle (usually a standard reference). */
  companySubtitle?: string;
  /** Footer text override, if branding supplied one. */
  footerText?: string;
};

export type BrandingInput = {
  template?: {
    branding?: {
      company_name?: string;
      company_subtitle?: string;
      logo_url?: string;
      footer_text?: string;
    } | null;
  } | null;
  customer?: {
    name?: string | null;
    logo_url?: string | null;
    brand_colour?: string | null;
  } | null;
};

/** Neutral grey used when a customer is branded but has no brand_colour. */
const NEUTRAL_GREY: RgbTriple = [140, 140, 140];

/** Parse `#rrggbb` (or `#rgb`) to an RgbTriple, or null if unparseable. */
export function parseHexColor(hex?: string | null): RgbTriple | null {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = url;
    });
    return img;
  } catch {
    return null;
  }
}

export async function resolveDocumentBrandingProfile(
  input: BrandingInput,
): Promise<DocumentBrandingProfile> {
  const templateLogo = input.template?.branding?.logo_url?.trim() || "";
  let customerLogo = input.customer?.logo_url?.trim() || "";
  let customerBrandColour = parseHexColor(input.customer?.brand_colour);

  // If caller passed the customer name but not the full branding fields,
  // hydrate them from the DB so every code path gets the same profile
  // without having to remember to select brand_colour everywhere.
  if (input.customer?.name && (!customerLogo || !customerBrandColour)) {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("customers")
        .select("logo_url, brand_colour")
        .ilike("name", input.customer.name)
        .maybeSingle();
      const row = data as any;
      if (!customerLogo && row?.logo_url) customerLogo = String(row.logo_url).trim();
      if (!customerBrandColour) customerBrandColour = parseHexColor(row?.brand_colour);
    } catch { /* fall through to what we have */ }
  }

  // Template branding wins so customer-branded templates stay consistent
  // even when the customer record has its own (differently sized) logo.
  const resolvedUrl = templateLogo || customerLogo || DEFAULT_LOGO_URL;
  const isCustomerBranded =
    Boolean(templateLogo || customerLogo) || Boolean(customerBrandColour);

  const logoImage = await loadImage(resolvedUrl);

  // Colour resolution: explicit brand_colour wins for customer-branded docs.
  // Otherwise, for the org's own docs we extract from the org logo; for a
  // customer-branded doc with no brand_colour we use neutral grey rather than
  // guessing a colour off their logo (which often produced garish tints).
  let accentColor: RgbTriple;
  if (customerBrandColour) {
    accentColor = customerBrandColour;
  } else if (isCustomerBranded) {
    accentColor = NEUTRAL_GREY;
  } else {
    accentColor = getBrandColorFromLogo(logoImage, false);
  }

  return {
    logoUrl: resolvedUrl,
    logoImage,
    accentColor,
    isCustomerBranded,
    companyName: input.template?.branding?.company_name,
    companySubtitle: input.template?.branding?.company_subtitle,
    footerText: input.template?.branding?.footer_text,
  };
}
