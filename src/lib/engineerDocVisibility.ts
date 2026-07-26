/**
 * Single source of truth for which job_documents.document_type values are
 * visible to engineers. Mirrors the defaults inside the
 * `public.is_engineer_visible_document_type` SQL function so the UI and RLS
 * agree without extra round-trips.
 *
 * Admins can override the SQL side by writing an array of hidden types into
 * `app_settings.value` under key `engineer_hidden_document_types`. The UI
 * layer intentionally keeps this list hard-coded — the RLS layer is the
 * authoritative gate, this file only exists so we don't render empty
 * placeholder rows for docs an engineer can't fetch anyway.
 */

export const ENGINEER_HIDDEN_DOCUMENT_TYPES: ReadonlySet<string> = new Set([
  "quote",
  "purchase_order",
  "invoice",
  "contract",
  "costing_sheet",
]);

// Labels we treat as commercial paperwork even when stored under a generic
// `uploaded_file` type (legacy rows created before dedicated types existed).
const ENGINEER_HIDDEN_LABEL_KEYWORDS = ["costing sheet", "invoice", "quote", "purchase order", "po ", "contract"];

export function isDocVisibleToEngineer(doc: { document_type?: string | null; label?: string | null } | null | undefined): boolean {
  if (!doc) return false;
  const type = (doc.document_type || "").toLowerCase();
  if (ENGINEER_HIDDEN_DOCUMENT_TYPES.has(type)) return false;
  const label = (doc.label || "").toLowerCase().trim();
  if (label && ENGINEER_HIDDEN_LABEL_KEYWORDS.some((kw) => label.includes(kw))) return false;
  return true;
}
