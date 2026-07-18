/**
 * Single-source-of-truth branding resolver for PDF documents.
 *
 * Historically each PDF generator (JobSheetPdfExport, JobPdfReport,
 * CustomerReportPdf) resolved the header logo, accent colour, and watermark
 * tint independently. That let a customer-branded template (e.g. Besseges)
 * render with the customer's tinted flame watermark AND a Viva Fire header —
 * mixed branding. This resolver forces one profile per document: header logo,
 * watermark tint, and footer all derive from the SAME image source.
 *
 * Priority for the logo image:
 *   1. Template-level branding override (`template.branding.logo_url`)
 *      — set when a template is explicitly customer-branded.
 *   2. Customer record logo (`customer.logo_url`)
 *      — set when the job's customer has uploaded a logo.
 *   3. Default Viva Fire logo.
 */

import { getBrandColorFromLogo, type RgbTriple } from "@/lib/extractLogoColors";

const DEFAULT_LOGO_URL = "/images/vivafire-logo-new.png";

export type DocumentBrandingProfile = {
  /** Logo shown in the PDF header — same source as the accent colour. */
  logoUrl: string;
  /** Loaded image element for the resolved logo (null if load failed). */
  logoImage: HTMLImageElement | null;
  /** Accent RGB extracted from `logoImage`, used to tint the watermark. */
  accentColor: RgbTriple;
  /** True when a non-default (customer-specific) logo was resolved. */
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
  } | null;
};

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
  const customerLogo = input.customer?.logo_url?.trim() || "";

  // Template branding wins so customer-branded templates stay consistent
  // even when the customer record has its own (differently sized) logo.
  const resolvedUrl = templateLogo || customerLogo || DEFAULT_LOGO_URL;
  const isCustomerBranded = Boolean(templateLogo || customerLogo);

  const logoImage = await loadImage(resolvedUrl);
  const accentColor = getBrandColorFromLogo(logoImage, isCustomerBranded);

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
