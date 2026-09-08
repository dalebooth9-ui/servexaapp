/**
 * Contract (service agreement) assembly.
 *
 * SAFETY GUARDRAIL: the app never authors legal wording. A contract template
 * holds wording that the organisation supplied — either imported verbatim from
 * their own document or typed/edited by them from a clearly-labelled example
 * skeleton. Templates start as `draft` and can only be used to build a real
 * agreement once an owner/competent person approves them.
 *
 * Assembling an agreement is a pure text merge: merge fields are replaced with
 * structured data from the customer, sites, services and dates. No generative
 * text is added at any point.
 */

export type ContractClause = { heading: string; text: string };

export type ContractTemplateStatus = "draft" | "approved" | "archived";

export interface ContractTemplate {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  clauses: ContractClause[];
  source: "manual" | "import" | "starter" | string;
  source_file: string | null;
  is_starter: boolean;
  status: ContractTemplateStatus;
  review_note: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AgreementStatus = "draft" | "sent" | "signed" | "cancelled" | "expired";

export interface AgreementServiceLine {
  description: string;
  frequency: string;
  quantity: number;
  unit_price: number;
}

export interface AgreementDetails {
  customer_name?: string;
  customer_address?: string | null;
  sites?: { id: string; name: string; address?: string | null }[];
  services?: AgreementServiceLine[];
  provider_name?: string;
}

/** Merge fields an org can use inside their own wording. */
export const MERGE_FIELDS: { token: string; describes: string }[] = [
  { token: "{{customer_name}}", describes: "The customer's name" },
  { token: "{{customer_address}}", describes: "The customer's address" },
  { token: "{{provider_name}}", describes: "Your company name" },
  { token: "{{reference}}", describes: "Agreement reference (e.g. AGR-00001)" },
  { token: "{{sites}}", describes: "Bullet list of covered sites" },
  { token: "{{services}}", describes: "Bullet list of services and frequency" },
  { token: "{{start_date}}", describes: "Start date" },
  { token: "{{end_date}}", describes: "End date" },
  { token: "{{term}}", describes: "Term, e.g. 12 months" },
  { token: "{{renewal_basis}}", describes: "How the agreement renews" },
  { token: "{{total_value}}", describes: "Total annual value" },
  { token: "{{today}}", describes: "Today's date" },
];

/**
 * Example skeleton only. Shown with an explicit warning in the UI — every org
 * must have their own terms reviewed before approving a template.
 */
export const STARTER_CLAUSES: ContractClause[] = [
  {
    heading: "Parties",
    text:
      "This agreement is made between {{provider_name}} (\"the Contractor\") and {{customer_name}} of {{customer_address}} (\"the Client\").",
  },
  {
    heading: "Covered sites",
    text: "The Contractor will provide the services set out below at the following sites:\n{{sites}}",
  },
  {
    heading: "Services and frequency",
    text: "{{services}}",
  },
  {
    heading: "Term",
    text:
      "This agreement begins on {{start_date}} and runs for {{term}}, ending {{end_date}}. Renewal basis: {{renewal_basis}}.",
  },
  {
    heading: "Charges",
    text:
      "The total annual charge for the services described is {{total_value}}, exclusive of VAT. Additional or remedial works are quoted separately and are not covered by this agreement.",
  },
  {
    heading: "Access and client obligations",
    text:
      "The Client will provide safe and reasonable access to all covered areas on agreed visit dates, and will notify the Contractor of any site-specific hazards or permit requirements in advance.",
  },
  {
    heading: "Acceptance",
    text:
      "By signing below the Client accepts the terms of this agreement dated {{today}}, reference {{reference}}.",
  },
];

const money = (n: number) =>
  `£${Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ukDate = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-GB");
};

export interface MergeContextInput {
  reference?: string;
  customerName?: string;
  customerAddress?: string | null;
  providerName?: string;
  sites?: { name: string; address?: string | null }[];
  services?: AgreementServiceLine[];
  startDate?: string | null;
  endDate?: string | null;
  termMonths?: number;
  renewalBasis?: string | null;
  totalValue?: number;
}

export function buildMergeContext(input: MergeContextInput): Record<string, string> {
  const sites = (input.sites || []).map((s) => `• ${s.name}${s.address ? ` — ${s.address}` : ""}`).join("\n");
  const services = (input.services || [])
    .map((s) => {
      const qty = Number(s.quantity || 1);
      const price = Number(s.unit_price || 0);
      const bits = [s.description];
      if (s.frequency) bits.push(s.frequency);
      const line = bits.filter(Boolean).join(" — ");
      return `• ${line}${price ? ` (${qty} × ${money(price)})` : ""}`;
    })
    .join("\n");

  return {
    "{{customer_name}}": input.customerName || "—",
    "{{customer_address}}": input.customerAddress || "—",
    "{{provider_name}}": input.providerName || "—",
    "{{reference}}": input.reference || "—",
    "{{sites}}": sites || "• (no sites listed)",
    "{{services}}": services || "• (no services listed)",
    "{{start_date}}": ukDate(input.startDate),
    "{{end_date}}": ukDate(input.endDate),
    "{{term}}": `${input.termMonths ?? 12} months`,
    "{{renewal_basis}}": input.renewalBasis || "—",
    "{{total_value}}": money(input.totalValue || 0),
    "{{today}}": new Date().toLocaleDateString("en-GB"),
  };
}

/** Replace merge tokens in template wording. Unknown tokens are left visible
 *  so an admin can spot and fix them rather than silently losing meaning. */
export function mergeClauses(clauses: ContractClause[], ctx: Record<string, string>): ContractClause[] {
  const apply = (s: string) =>
    Object.entries(ctx).reduce(
      (acc, [token, value]) => acc.split(token).join(value),
      String(s ?? "")
    );
  return (clauses || []).map((c) => ({ heading: apply(c.heading || ""), text: apply(c.text || "") }));
}

/** Merge tokens still present after assembly (shown as a warning). */
export function unresolvedTokens(clauses: ContractClause[]): string[] {
  const found = new Set<string>();
  for (const c of clauses || []) {
    for (const m of `${c.heading}\n${c.text}`.matchAll(/\{\{[a-z0-9_]+\}\}/gi)) found.add(m[0]);
  }
  return Array.from(found);
}

export function agreementEndDate(start: string, termMonths: number): string {
  const d = new Date(start);
  if (isNaN(d.getTime())) return start;
  d.setMonth(d.getMonth() + (termMonths || 12));
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const AGREEMENT_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Awaiting signature",
  signed: "Signed",
  cancelled: "Cancelled",
  expired: "Expired",
};
