// Headless helper that generates a single blank-job-sheet PDF Blob for a
// given template + jobInfo, reusing the same worker pipeline the on-screen
// BlankTemplatePdfExport component uses. Intended for bulk/print flows
// (e.g. the Planner "Print all job sheets" feature) where we need to
// generate many PDFs and merge them without mounting a component tree.
//
// Keep this in sync with the payload builder inside BlankTemplatePdfExport.tsx.

import { loadWatermarkSettings } from "@/hooks/useWatermarkSettings";
import { getGeneratingOrgFallbackLogoUrl, getGeneratingOrgWatermarkUrl } from "@/lib/generatingOrgBranding";
import { fetchCustomerAccreditationLogos } from "@/lib/pdfAccreditations";
import { getBrandColorFromLogo } from "@/lib/extractLogoColors";
import { DRY_RISER_LAYOUT } from "@/lib/dryRiserLayout";
import type { WatermarkOverride } from "@/lib/pdfBranding";
import type { PdfTemplateField } from "@/lib/pdfBody";

export type BlankSheetTemplate = {
  id: string;
  name: string;
  description: string | null;
  standard?: string | null;
  fields: PdfTemplateField[];
  footer_text?: string | null;
  branding?: {
    company_name?: string;
    company_subtitle?: string;
    logo_url?: string;
    footer_text?: string;
    declaration_text?: string;
  };
};

export type BlankSheetJobInfo = {
  address: string | null;
  customer: string | null;
  customers?: { name: string; logo_url?: string | null } | null;
  reference_number: string;
  customer_po?: string | null;
  category?: string | null;
  name?: string | null;
  priority?: string | null;
  visual_qty?: number;
  pressure_test_qty?: number;
  engineers?: string[];
  other_qty?: number;
  other_service_type?: string | null;
  due_date?: string | null;
  printNotes?: string | null;
  site?: {
    name: string;
    address: string | null;
    postcode: string | null;
    contact_name: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    riser_location?: string | null;
  } | null;
};

function runWorker(payload: any): Promise<{ blob: Blob; fileName: string }> {
  return new Promise((resolve, reject) => {
    if (typeof Worker === "undefined") return reject(new Error("Web Worker unavailable"));
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const worker = new Worker(
      new URL("../workers/blankTemplatePdf.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (evt) => {
      const data = evt.data;
      if (!data || data.requestId !== requestId) return;
      worker.terminate();
      if (data.type === "success") {
        resolve({ blob: new Blob([data.buffer], { type: "application/pdf" }), fileName: data.fileName });
      } else {
        reject(new Error(data.error || "PDF generation failed"));
      }
    };
    worker.onerror = (evt) => {
      worker.terminate();
      reject(new Error(evt.message || "PDF worker crashed"));
    };
    worker.postMessage({ type: "generate", requestId, payload });
  });
}

/**
 * Generate a single blank job sheet PDF as a Blob. Reuses the exact same
 * worker pipeline (branding, watermark, accreditations, dry-riser layout)
 * as the interactive component so paper output matches what admins see in
 * the on-screen preview.
 */
export async function generateBlankSheetPdfBlob(
  template: BlankSheetTemplate,
  jobInfo: BlankSheetJobInfo | null,
  opts: {
    categoryName?: string;
    watermarkOverride?: WatermarkOverride | null;
    copiesOverride?: number | null;
  } = {},
): Promise<Blob> {
  const customerLogoUrl = jobInfo?.customers?.logo_url || null;
  const isDryRiser = /dry\s*riser/i.test(template.name || "");
  const customerName = jobInfo?.customers?.name || jobInfo?.customer || "";

  let brandLogoImg: HTMLImageElement | null = null;
  if (customerLogoUrl) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej();
        img.src = customerLogoUrl;
      });
      brandLogoImg = img;
    } catch {
      /* fall through to text branding */
    }
  }

  const accentColor = (isDryRiser
    ? DRY_RISER_LAYOUT.header.brandBlueRgb
    : getBrandColorFromLogo(brandLogoImg, !!customerLogoUrl)) as [number, number, number];

  const [watermarkSettings, accreditationLogoUrls, orgFallbackLogoUrl, orgWatermarkUrl] = await Promise.all([
    loadWatermarkSettings(),
    fetchCustomerAccreditationLogos(customerName),
    getGeneratingOrgFallbackLogoUrl(),
    getGeneratingOrgWatermarkUrl(),
  ]);

  const { blob } = await runWorker({
    template,
    jobInfo,
    handfill: false,
    watermarkOverride: opts.watermarkOverride ?? null,
    watermarkSettings,
    categoryName: opts.categoryName || "",
    accentColor,
    accreditationLogoUrls,
    orgFallbackLogoUrl: orgFallbackLogoUrl || null,
    orgWatermarkUrl,
    copiesOverride: opts.copiesOverride ?? null,
  });
  return blob;
}
