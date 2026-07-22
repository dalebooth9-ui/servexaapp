// scanPipeline.ts — SINGLE canonical extraction pipeline for every paper-scan
// door in the app: Scan Paper Report (job door), Paper Scan Queue (queue door),
// Archive Paper Backlog (archive door), plus the admin QuickScan/BatchScan
// launchers. Historically each caller invoked `ocr-job-sheet` with slightly
// different bodies and post-processed the response in its own way, which is
// why parity fixes kept landing in one door and missing the others.
//
// This module is the ONLY place any client-side code invokes `ocr-job-sheet`.
// It returns a normalised {extracted, header, fieldConfidence} shape and takes
// care of:
//   • checkbox coercion (yes/no/na → stored form)
//   • engineer fuzzy-match against org profiles
//   • confidence extraction (per-field flag stashed on `_field_confidence`)
//   • header → answer mirroring for common IDs (date, po_number, ...)
//
// Downstream review UIs (ScanReviewDialog and the legacy dialogs still being
// migrated) render from this canonical shape, so a fix here reaches every door
// at once.

import { supabase } from "@/integrations/supabase/client";
import { fuzzyMatchEngineer } from "@/lib/fuzzyEngineerMatch";

export type ScanTemplateField = {
  id: string;
  label: string;
  type: string;
  section?: string;
  options?: string[];
  required?: boolean;
  allow_notes?: boolean;
};

export type ScanImagePayload = {
  image_base64: string;
  mime_type?: string;
};

export interface RunScanExtractionInput {
  images: ScanImagePayload[];
  templateName: string;
  fields: ScanTemplateField[];
  /** When set, engineer header name is matched against org profiles. */
  matchEngineerToProfiles?: boolean;
}

export interface ScanExtractionResult {
  extracted: Record<string, any>;
  header: Record<string, any>;
  /** Per-field OCR confidence 0..1, keyed by field id. Also mirrored onto
   *  header._field_confidence so downstream code that only sees the header
   *  can still surface amber "check" flags. */
  fieldConfidence: Record<string, number>;
  engineerMatch: {
    raw: string | null;
    matchedName: string | null;
    matchedUserId: string | null;
    hasSignature: boolean;
  };
}

// Coerce checkbox-ish scan values into the canonical yes/no/na tri-state.
export function coerceCheckbox(val: unknown): "yes" | "no" | "na" | "" {
  if (val === true) return "yes";
  if (val === false) return "no";
  if (typeof val === "string") {
    const s = val.trim().toLowerCase();
    if (s === "yes" || s === "true" || s === "pass" || s === "y") return "yes";
    if (s === "no" || s === "false" || s === "fail" || s === "n") return "no";
    if (s === "n/a" || s === "na") return "na";
  }
  return "";
}

export function checkboxToStored(
  v: "yes" | "no" | "na" | "",
): boolean | string | undefined {
  if (v === "yes") return true;
  if (v === "no") return false;
  if (v === "na") return "N/A";
  return undefined;
}

// Normalise the raw {extracted} map returned by ocr-job-sheet into the
// stored form expected by responses/reviewers. Rules:
//   • blank ("", null, undefined) is dropped
//   • checkbox / yes_no / pass_fail get coerced via checkboxToStored
//   • strings never pass through as literal "N/A" — if the OCR failed to
//     read a mark, leave the field blank (see accuracy memory).
export function normalizeExtractedAnswers(
  raw: Record<string, any>,
  fields: ScanTemplateField[],
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of fields) {
    const v = raw[f.id];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "string" && v.trim().toLowerCase() === "n/a") {
      // Extraction hint that this is unmarked — never persist a fabricated N/A.
      continue;
    }
    if (
      f.type === "checkbox" ||
      f.type === "yes_no" ||
      f.type === "boolean" ||
      f.type === "pass_fail"
    ) {
      const cb = coerceCheckbox(v);
      const stored = checkboxToStored(cb);
      if (stored === undefined && typeof v === "string") {
        out[f.id] = v;
      } else if (stored !== undefined) {
        out[f.id] = stored;
      }
      continue;
    }
    out[f.id] = v;
  }
  return out;
}

// Common header→field mirrors that most templates need (date, po number,
// engineer, site/customer text). Only fills where the answer is blank so it
// never clobbers a hand-parsed value.
const HEADER_TO_FIELD_MAP: Record<string, string[]> = {
  date: ["date", "inspection_date"],
  riser_location: ["riser_location"],
  po_ref: ["po_number", "po_ref", "reference"],
  site: ["site_details", "site"],
  customer: ["customer_details"],
  engineer: ["technician_name", "engineer_name"],
};

export function mirrorHeaderIntoAnswers(
  answers: Record<string, any>,
  header: Record<string, any>,
  fields: ScanTemplateField[],
): Record<string, any> {
  const ids = new Set(fields.map((f) => f.id));
  const merged = { ...answers };
  for (const [headerKey, fieldKeys] of Object.entries(HEADER_TO_FIELD_MAP)) {
    const hv = header[headerKey];
    if (hv === undefined || hv === null || hv === "") continue;
    for (const fid of fieldKeys) {
      if (!ids.has(fid)) continue;
      if (merged[fid] !== undefined && merged[fid] !== null && merged[fid] !== "")
        continue;
      merged[fid] = hv;
      break;
    }
  }
  return merged;
}

function isCustomerSignerNameField(field: ScanTemplateField): boolean {
  const label = `${field.section || ""} ${field.label || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const hasSignerContext = /signature|sign off|signoff|declaration|completion|footer|signed|signatory|printed name/.test(label);
  const isCustomerName = /customer|client/.test(label) && /name|signatory|signed|printed/.test(label);
  return hasSignerContext && isCustomerName;
}

// Trim the field list down to the shape ocr-job-sheet needs, so callers can
// pass full TemplateField objects without leaking extra properties into the
// prompt payload.
function toOcrFieldPayload(fields: ScanTemplateField[]) {
  return fields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    section: f.section,
    options: f.options,
  }));
}

// Single canonical invocation of the ocr-job-sheet edge function. Every scan
// door — job, queue, archive, quick-scan, batch-scan — goes through here.
export async function runScanExtraction(
  input: RunScanExtractionInput,
): Promise<ScanExtractionResult> {
  const { data, error } = await supabase.functions.invoke("ocr-job-sheet", {
    body: {
      images: input.images,
      template_name: input.templateName,
      fields: toOcrFieldPayload(input.fields),
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  const extracted: Record<string, any> = data?.extracted || {};
  const header: Record<string, any> = data?.header || {};

  // Confidence — accept either data.field_confidence (canonical) or the older
  // header._field_confidence stash used by the archive path.
  const fieldConfidence: Record<string, number> =
    (data?.field_confidence as Record<string, number>) ||
    (header._field_confidence as Record<string, number>) ||
    {};
  header._field_confidence = fieldConfidence;

  // Customer signer names/signature rows are a high-risk hallucination area on
  // scanned forms. If the header did not confidently identify a customer signer,
  // keep any template-level customer sign-off name field blank as well; the
  // reviewer can type it manually when it is genuinely present.
  const hasCustomerSigner = typeof header.customer_signed_name === "string" && header.customer_signed_name.trim().length > 0;
  if (!hasCustomerSigner) {
    for (const field of input.fields) {
      if (isCustomerSignerNameField(field)) {
        delete extracted[field.id];
        fieldConfidence[field.id] = Math.min(fieldConfidence[field.id] ?? 0.4, 0.45);
      }
    }
  }

  // LETTERHEAD GUARD (defense-in-depth mirror of ocr-job-sheet post-process):
  // never let the sheet's own printed branding land in a customer / client
  // template field. Edge function should already have cleared these but we
  // repeat the check here so any older cached edge deploy is still safe.
  const normaliseCompany = (s: unknown) =>
    String(s ?? "")
      .toLowerCase()
      .replace(/https?:\/\//g, "")
      .replace(/^www\./, "")
      .replace(/\.(co\.uk|com|net|org|io|uk|ltd)\b/g, "")
      .replace(/\b(ltd|limited|plc|llp|inc|fire|protection|services|solutions|group|systems|company|co)\b\.?/g, "")
      .replace(/[^a-z0-9]/g, "");
  const letterhead = normaliseCompany(header.paperwork_owner_company);
  const collidesWithLetterhead = (v: unknown) => {
    if (!letterhead || letterhead.length < 3) return false;
    const c = normaliseCompany(v);
    if (!c || c.length < 3) return false;
    return c === letterhead || c.includes(letterhead) || letterhead.includes(c);
  };
  if (collidesWithLetterhead(header.customer)) {
    header.customer = "";
  }
  for (const field of input.fields) {
    const label = `${field.section || ""} ${field.label || ""}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const isCustomerish = /\b(customer|client)\b/.test(label) && !/site|address|postcode/.test(label);
    if (!isCustomerish) continue;
    if (collidesWithLetterhead(extracted[field.id])) {
      delete extracted[field.id];
      fieldConfidence[field.id] = Math.min(fieldConfidence[field.id] ?? 0.4, 0.4);
    }
  }

  // Engineer fuzzy match against org profiles (opt-in; the identify pass
  // shouldn't waste a DB round-trip).
  let engineerMatch: ScanExtractionResult["engineerMatch"] = {
    raw: (header.engineer ? String(header.engineer) : null) || null,
    matchedName: null,
    matchedUserId: null,
    hasSignature: false,
  };
  if (input.matchEngineerToProfiles !== false && engineerMatch.raw) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, signature_data");
    const list = ((profiles as any[]) || [])
      .filter((p) => p.full_name)
      .map((p) => ({
        user_id: p.user_id as string,
        full_name: p.full_name as string,
        has_signature: !!p.signature_data,
      }));
    if (list.length > 0) {
      const withSig = list.filter((e) => e.has_signature);
      const pool = withSig.length > 0 ? withSig : list;
      const matched = fuzzyMatchEngineer(engineerMatch.raw, pool as any);
      const found = pool.find(
        (e) => e.full_name.toUpperCase() === matched.toUpperCase(),
      );
      if (found) {
        engineerMatch.matchedName = found.full_name;
        engineerMatch.matchedUserId = found.user_id;
        engineerMatch.hasSignature = found.has_signature;
        header.engineer = found.full_name;
      }
    }
  }

  return { extracted, header, fieldConfidence, engineerMatch };
}

// Convenience: convert File objects to canonical base64 payloads (no data-url
// prefix) the way ocr-job-sheet expects. Downscales to keep the request small.
export async function fileToScanBase64(
  file: File,
  maxDim = 1800,
): Promise<string> {
  const buf = await file.arrayBuffer();
  const blob = new Blob([buf], { type: file.type });
  const bmp = await createImageBitmap(blob).catch(() => null);
  if (!bmp) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return dataUrl.split(",")[1];
}

// Category identification pass — used by admin QuickScan/BatchScan to pick a
// template before running full extraction. Same pipeline, thin wrapper.
export async function runScanCategoryIdentify(
  images: ScanImagePayload[],
  categories: { name: string }[],
): Promise<string | null> {
  const identifyFields = [
    {
      id: "detected_category",
      label: "Which category does this form belong to?",
      type: "select",
      options: categories.map((c) => c.name),
    },
  ];
  const { data, error } = await supabase.functions.invoke("ocr-job-sheet", {
    body: {
      images,
      template_name: "Category Identification",
      fields: identifyFields,
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  const name = data?.extracted?.detected_category;
  return typeof name === "string" && name.trim() ? name : null;
}
