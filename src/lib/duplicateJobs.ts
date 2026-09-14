/**
 * Duplicate-job guard.
 *
 * Two signals mark a likely duplicate:
 *   (a) the same customer PO (case / whitespace / punctuation insensitive),
 *       regardless of age — PO references are long-lived.
 *   (b) the same customer AND the same site address (or postcode) within the
 *       last 90 days.
 *
 * Cancelled jobs are ignored. Used by the New Job dialog, the
 * create-from-paperwork flow and the job detail "Possible duplicates" panel.
 */

import { supabase } from "@/integrations/supabase/client";
import { extractPostcode } from "@/lib/matchSiteFromHeader";

export const DUPLICATE_WINDOW_DAYS = 90;

export type DuplicateJob = {
  id: string;
  reference_number: string | null;
  name: string | null;
  customer_po: string | null;
  address: string | null;
  customer: string | null;
  customer_id: string | null;
  status: string | null;
  created_at: string | null;
  sites?: { name: string | null } | null;
  /** Why this job was flagged. */
  matchedBy: "customer_po" | "address";
};

export function normalisePoKey(v: string | null | undefined): string {
  return (v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normaliseAddressKey(v: string | null | undefined): string {
  return (v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function postcodeKey(v: string | null | undefined): string {
  const pc = extractPostcode(v || "");
  return pc ? pc.toLowerCase().replace(/\s+/g, "") : "";
}

const SELECT =
  "id, reference_number, name, customer_po, address, customer, customer_id, status, created_at, sites(name)";

export interface DuplicateCheckInput {
  customerPo?: string | null;
  address?: string | null;
  customerId?: string | null;
  /** Exclude this job (used on the job detail panel). */
  excludeJobId?: string | null;
}

/**
 * Returns any non-cancelled jobs that look like duplicates of the job about
 * to be created. RLS keeps the query inside the caller's organisation.
 */
export async function findDuplicateJobs(input: DuplicateCheckInput): Promise<DuplicateJob[]> {
  const poKey = normalisePoKey(input.customerPo);
  const addrKey = normaliseAddressKey(input.address);
  const pcKey = postcodeKey(input.address);
  const found = new Map<string, DuplicateJob>();

  if (poKey.length >= 3) {
    const { data } = await supabase
      .from("jobs")
      .select(SELECT)
      .neq("status", "cancelled")
      .not("customer_po", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);
    for (const row of (data || []) as any[]) {
      if (input.excludeJobId && row.id === input.excludeJobId) continue;
      if (normalisePoKey(row.customer_po) === poKey) {
        found.set(row.id, { ...row, matchedBy: "customer_po" });
      }
    }
  }

  if (input.customerId && (addrKey.length >= 6 || pcKey)) {
    const since = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * 86400000).toISOString();
    const { data } = await supabase
      .from("jobs")
      .select(SELECT)
      .eq("customer_id", input.customerId)
      .neq("status", "cancelled")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);
    for (const row of (data || []) as any[]) {
      if (input.excludeJobId && row.id === input.excludeJobId) continue;
      if (found.has(row.id)) continue;
      const rowAddr = normaliseAddressKey(row.address);
      const rowPc = postcodeKey(row.address);
      const addrHit = addrKey.length >= 6 && rowAddr.length >= 6 &&
        (rowAddr === addrKey || rowAddr.includes(addrKey) || addrKey.includes(rowAddr));
      const pcHit = !!pcKey && rowPc === pcKey;
      if (addrHit || pcHit) found.set(row.id, { ...row, matchedBy: "address" });
    }
  }

  return Array.from(found.values());
}

/** Short human label, e.g. "VFP-00249 — Cumbria House, Carlisle". */
export function duplicateJobLabel(job: DuplicateJob): string {
  const where = job.sites?.name || job.address || job.customer || "";
  const ref = job.reference_number || "job";
  return where ? `${ref} — ${where}` : ref;
}
