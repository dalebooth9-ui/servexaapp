/**
 * Customer paperwork revolves around the customer's PO — the internal
 * VFP-/TM- reference is a fallback shown only when no customer PO exists.
 *
 * Use these helpers everywhere a job reference is displayed to a
 * customer (site sheets, report PDFs, Word exports, customer emails,
 * edit-before-print dialog). Do NOT reach for `reference_number`
 * directly on customer-facing surfaces.
 */

export interface JobRefFields {
  customer_po?: string | null;
  reference_number?: string | null;
}

const clean = (v: string | null | undefined) => (v ?? "").trim();

/** Single-line customer-facing reference: PO first, VFP fallback. */
export function primaryJobReference(job: JobRefFields | null | undefined): string {
  if (!job) return "";
  return clean(job.customer_po) || clean(job.reference_number);
}

/**
 * Dual reference for headers with room for both fields.
 * - Both present & different → "PO: <po>  /  Our ref: <ref>"
 * - Only one present → that value, unlabelled
 * - Same value → single value, unlabelled (avoid pointless duplication)
 */
export function dualJobReference(job: JobRefFields | null | undefined): string {
  if (!job) return "";
  const po = clean(job.customer_po);
  const ref = clean(job.reference_number);
  if (po && ref && po !== ref) return `PO: ${po}  /  Our ref: ${ref}`;
  return po || ref;
}

/**
 * Label to accompany the primary reference on a single-field header.
 * "PO:" when the value is a customer PO, "Ref:" when we're falling
 * back to the internal reference.
 */
export function primaryJobReferenceLabel(job: JobRefFields | null | undefined): string {
  if (!job) return "Ref:";
  return clean(job.customer_po) ? "PO:" : "Ref:";
}
