// Builds the starting values for a new Site Visit Report from the job and
// (optionally) its job sheet. Blank stays blank — never block, never guess.
// Scanned-sheet rules: illegible handwriting is left out and flagged for the
// reviewer; the client always comes from the job, never the sheet letterhead.
import { supabase } from "@/integrations/supabase/client";

const COMMENT_KEYS = ["comments", "engineer_comments", "further_works_required_notes", "remedial_required_notes"];
const ENGINEER_KEYS = ["engineer", "technician_name", "engineers_name", "engineer_name"];

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

function isoDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // UK DD/MM/YYYY
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

function lowConfidence(header: any, key: string): boolean {
  const c = header?.field_confidence?.[key];
  return typeof c === "number" && c < 0.5;
}

export type SheetComments = { text: string; gaps: string[] };

/** Engineer comments from a job sheet, with unreadable bits flagged not guessed. */
export function extractSheetComments(responses: Record<string, any>): SheetComments {
  const isScan = !!responses?._scan_source;
  const header = responses?._scan_header || {};
  const lines: string[] = [];
  const gaps: string[] = [];
  for (const k of COMMENT_KEYS) {
    const v = str(responses?.[k]);
    if (!v) continue;
    if (isScan && lowConfidence(header, k)) {
      gaps.push("Part of the job sheet comments could not be read clearly — check the scanned sheet.");
      continue;
    }
    lines.push(v);
  }
  const extra = str(header.additional_notes);
  if (extra) {
    if (lowConfidence(header, "additional_notes")) gaps.push("Handwritten notes on the scanned sheet could not be read clearly — check the sheet.");
    else lines.push(extra);
  }
  const notes = responses?._scan_field_notes || {};
  for (const k of COMMENT_KEYS) {
    if (str(notes[k])) gaps.push(`Reviewer note on job sheet comments: ${str(notes[k])}`);
  }
  return { text: lines.join("\n"), gaps: Array.from(new Set(gaps)) };
}

export async function buildSiteVisitPrefill(jobId: string, sheetId: string | null, userId: string) {
  const [{ data: job }, { data: profile }] = await Promise.all([
    supabase.from("jobs").select("id, customer, customer_po, reference_number, address, brief, name, site_id").eq("id", jobId).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("user_id", userId).maybeSingle(),
  ]);
  const j: any = job || {};
  let site: any = null;
  if (j.site_id) {
    const { data } = await supabase.from("sites").select("name, address, postcode").eq("id", j.site_id).maybeSingle();
    site = data;
  }

  let sheet: any = null;
  if (sheetId) {
    const { data } = await supabase.from("job_sheet_responses").select("id, responses, status").eq("id", sheetId).maybeSingle();
    sheet = data;
  } else {
    const { data } = await supabase
      .from("job_sheet_responses")
      .select("id, responses, status, submitted_at")
      .eq("job_id", jobId)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .limit(1);
    sheet = data?.[0] || null;
  }
  const r: Record<string, any> = sheet?.responses || {};
  const header = r._scan_header || {};
  const isScan = !!r._scan_source;

  // Engineer on the sheet, else signed-in user.
  let engineer = "";
  for (const k of ENGINEER_KEYS) if (str(r[k])) { engineer = str(r[k]); break; }
  if (!engineer && isScan && str(header.engineer) && !lowConfidence(header, "engineer")) engineer = str(header.engineer);
  const attended = engineer || str((profile as any)?.full_name);

  // Site contact from the customer sign-off.
  let contactName = "";
  let contactTitle = "";
  const { data: sigs } = await supabase
    .from("job_signatures")
    .select("signer_name, signer_position, signer_role, created_at")
    .eq("job_id", jobId)
    .eq("signer_role", "customer")
    .order("created_at", { ascending: false })
    .limit(1);
  if (sigs?.[0]) {
    contactName = str((sigs[0] as any).signer_name);
    contactTitle = str((sigs[0] as any).signer_position);
  } else if (isScan && str(header.customer_signed_name) && !lowConfidence(header, "customer_signed_name")) {
    contactName = str(header.customer_signed_name);
  }

  const comments = sheet ? extractSheetComments(r) : { text: "", gaps: [] };
  const rawNotes = comments.text ? `From the job sheet:\n${comments.text}\n\n` : "";
  const siteAddress = site?.address ? [site.address, site.postcode].filter(Boolean).join(", ") : str(j.address);

  return {
    job_id: jobId,
    source_job_sheet_id: sheet?.id || null,
    po_reference: str(j.customer_po) || str(j.reference_number) || null,
    client_name: str(j.customer) || null, // never from the sheet letterhead
    site_name: str(site?.name) || null,
    site_address: siteAddress || null,
    visit_date: isoDate(r.date) || (isScan ? isoDate(header.date) : null) || new Date().toISOString().slice(0, 10),
    attended_by: attended || null,
    site_contact_name: contactName || null,
    site_contact_title: contactTitle || null,
    work_instructed: str(j.brief) || str(j.name) || null,
    raw_notes: rawNotes || null,
    gaps_to_confirm: comments.gaps,
    status: "draft" as const,
  };
}
