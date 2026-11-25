import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireCurrentOrgId } from "@/lib/tenantQueries";
import { normaliseCompanyFooter, normaliseQiSettings, type CompanyFooter, type QuoteInvoiceSettings } from "@/lib/quoteInvoiceSettings";

const FIELDS: [keyof CompanyFooter, string][] = [
  ["company_name", "Company name (as printed)"], ["address", "Address"], ["phone", "Phone"], ["email", "Email"],
  ["website", "Website"], ["company_number", "Company number"], ["vat_number", "VAT number"],
];

/** Company details, default VAT, quote validity and payment terms printed on quotes and invoices. */
export default function QuoteInvoiceDetailsCard() {
  const [orgId, setOrgId] = useState("");
  const [branding, setBranding] = useState<any>({});
  const [company, setCompany] = useState<CompanyFooter>(normaliseCompanyFooter({}));
  const [qi, setQi] = useState<QuoteInvoiceSettings>(normaliseQiSettings(undefined));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { (async () => {
    const id = await requireCurrentOrgId(); setOrgId(id);
    const { data } = await supabase.from("app_settings").select("key,value").eq("org_id", id).in("key", ["org_branding", "quote_invoice_settings"]);
    const b = (data || []).find((r: any) => r.key === "org_branding")?.value || {};
    setBranding(b); setCompany(normaliseCompanyFooter(b));
    setQi(normaliseQiSettings((data || []).find((r: any) => r.key === "quote_invoice_settings")?.value));
  })().catch(() => toast.error("Quote and invoice details could not be loaded.")).finally(() => setLoading(false)); }, []);
  const save = async () => {
    if (!orgId) return;
    setBusy(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from("app_settings").upsert([
      { org_id: orgId, key: "org_branding", value: { ...branding, ...company }, updated_at: now },
      { org_id: orgId, key: "quote_invoice_settings", value: qi, updated_at: now },
    ] as any, { onConflict: "org_id,key" });
    setBusy(false);
    if (error) { toast.error("Could not save.", { description: error.message }); return; }
    setBranding({ ...branding, ...company });
    toast.success("Quote and invoice details saved");
  };
  return <section id="quote-invoice-details" data-assistant-target="Quote and invoice details" className="space-y-4 border-b pb-6">
    <div><h2 className="text-lg font-semibold">Quote and invoice details</h2>
      <p className="text-sm text-muted-foreground">Printed on every quote and invoice. Leave a box blank and it won't print.</p></div>
    {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : <>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map(([k, label]) => <div key={k} className="space-y-1.5"><Label htmlFor={`qi-${k}`}>{label}</Label>
          <Input id={`qi-${k}`} value={company[k]} onChange={(e) => setCompany((c) => ({ ...c, [k]: e.target.value }))} /></div>)}
        <div className="space-y-1.5"><Label htmlFor="qi-vat">Default VAT rate (%)</Label>
          <Input id="qi-vat" type="number" min={0} max={100} step={0.01} value={qi.default_vat_rate} onChange={(e) => setQi((q) => ({ ...q, default_vat_rate: parseFloat(e.target.value) || 0 }))} /></div>
        <div className="space-y-1.5"><Label htmlFor="qi-valid">Quotes valid for (days)</Label>
          <Input id="qi-valid" type="number" min={1} step={1} value={qi.quote_valid_days} onChange={(e) => setQi((q) => ({ ...q, quote_valid_days: parseInt(e.target.value) || 30 }))} /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="qi-terms">Payment terms</Label>
        <Textarea id="qi-terms" rows={2} value={qi.payment_terms} placeholder="e.g. Payment due within 30 days of invoice." onChange={(e) => setQi((q) => ({ ...q, payment_terms: e.target.value }))} /></div>
      <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
    </>}
  </section>;
}
