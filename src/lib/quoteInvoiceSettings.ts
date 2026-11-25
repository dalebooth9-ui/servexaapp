import { supabase } from "@/integrations/supabase/client";
import { requireCurrentOrgId } from "./tenantQueries";

export type QuoteInvoiceSettings = { default_vat_rate: number; quote_valid_days: number; payment_terms: string };
export type CompanyFooter = { company_name: string; address: string; phone: string; email: string; website: string; company_number: string; vat_number: string };

export const DEFAULT_QI_SETTINGS: QuoteInvoiceSettings = { default_vat_rate: 20, quote_valid_days: 30, payment_terms: "" };

export function normaliseQiSettings(v: any): QuoteInvoiceSettings {
  const vat = Number(v?.default_vat_rate);
  const days = Number(v?.quote_valid_days);
  return {
    default_vat_rate: Number.isFinite(vat) && vat >= 0 && vat <= 100 ? vat : 20,
    quote_valid_days: Number.isFinite(days) && days > 0 ? Math.round(days) : 30,
    payment_terms: typeof v?.payment_terms === "string" ? v.payment_terms : "",
  };
}

export function normaliseCompanyFooter(v: any, orgName?: string | null): CompanyFooter {
  const s = (x: any) => (typeof x === "string" ? x.trim() : "");
  return {
    company_name: s(v?.company_name) || s(orgName), address: s(v?.address), phone: s(v?.phone), email: s(v?.email),
    website: s(v?.website), company_number: s(v?.company_number), vat_number: s(v?.vat_number),
  };
}

export async function loadQuoteInvoiceSettings(): Promise<{ settings: QuoteInvoiceSettings; company: CompanyFooter }> {
  const orgId = await requireCurrentOrgId();
  const [{ data: rows }, { data: org }] = await Promise.all([
    supabase.from("app_settings").select("key,value").eq("org_id", orgId).in("key", ["quote_invoice_settings", "org_branding"]),
    supabase.from("organisations").select("name").eq("id", orgId).maybeSingle(),
  ]);
  const get = (k: string) => (rows || []).find((r: any) => r.key === k)?.value;
  return { settings: normaliseQiSettings(get("quote_invoice_settings")), company: normaliseCompanyFooter(get("org_branding"), (org as any)?.name) };
}

/** "Valid for 30 days" style line for a quote. */
export function quoteValidityText(days: number) { return `Valid for ${days} day${days === 1 ? "" : "s"} from the date of issue.`; }

/** Customer-facing notes: AI-written summaries never print. */
export function customerNotes(inv: { notes?: string | null; ai_drafted?: boolean | null; ai_draft_notes?: string | null }) {
  const n = (inv.notes || "").trim();
  return n || null;
}
