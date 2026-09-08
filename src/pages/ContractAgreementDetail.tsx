import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft, Download, Send, Ban, CalendarPlus, Loader2, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { formatDate } from "@/lib/dateFormat";
import {
  AGREEMENT_STATUS_LABEL, AgreementDetails, ContractClause, buildMergeContext, mergeClauses, unresolvedTokens,
} from "@/lib/contractTemplates";
import { generateAgreementPdf } from "@/lib/contractAgreementPdf";
import { getGeneratingOrgBranding } from "@/lib/generatingOrgBranding";

export default function ContractAgreementDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [row, setRow] = useState<any>(null);
  const [providerName, setProviderName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from("contract_agreements")
      .select("*, customers(id, name, address, email)")
      .eq("id", id)
      .maybeSingle();
    if (error) toast.error(error.message);
    setRow(data);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { getGeneratingOrgBranding().then((b) => setProviderName(b.name || "")); }, []);

  const details: AgreementDetails = (row?.details || {}) as AgreementDetails;

  const merged: ContractClause[] = useMemo(() => {
    if (!row) return [];
    const ctx = buildMergeContext({
      reference: row.reference,
      customerName: row.customers?.name || details.customer_name,
      customerAddress: row.customers?.address ?? details.customer_address ?? null,
      providerName,
      sites: details.sites || [],
      services: details.services || [],
      startDate: row.start_date,
      endDate: row.end_date,
      termMonths: row.term_months,
      renewalBasis: row.renewal_basis,
      totalValue: Number(row.total_value || 0),
    });
    return mergeClauses((row.clauses || []) as ContractClause[], ctx);
  }, [row, details, providerName]);

  const missing = useMemo(() => unresolvedTokens(merged), [merged]);

  const logAction = async (action: string) => {
    if (!row) return;
    await supabase.from("audit_logs").insert({
      action: `${action}: ${row.reference}`,
      resource_id: row.id,
      user_id: user?.id ?? null,
    } as any);
  };

  const downloadPdf = async () => {
    if (!row) return;
    setBusy("pdf");
    try {
      const { blob, fileName } = await generateAgreementPdf({
        reference: row.reference,
        title: row.title,
        customerName: row.customers?.name || "Customer",
        status: AGREEMENT_STATUS_LABEL[row.status] || row.status,
        startDate: row.start_date,
        endDate: row.end_date,
        totalValue: Number(row.total_value || 0),
        clauses: merged,
        signerName: row.signer_name,
        signerRole: row.signer_role,
        signedAt: row.signed_at,
        signatureData: row.signature_data,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.message || "Could not build the PDF");
    } finally {
      setBusy(null);
    }
  };

  const sendToPortal = async () => {
    if (!row) return;
    setBusy("send");
    const { error } = await supabase.from("contract_agreements")
      .update({ status: "sent", sent_at: new Date().toISOString() } as any).eq("id", row.id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    await logAction("Agreement sent for signature");
    toast.success("Sent — the customer can now sign it in their portal");
    load();
  };

  const cancelAgreement = async () => {
    if (!row || !confirm("Cancel this agreement?")) return;
    const { error } = await supabase.from("contract_agreements").update({ status: "cancelled" } as any).eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    await logAction("Agreement cancelled");
    load();
  };

  /** Turn the signed agreement into the scheduling/renewal record so covered
   *  visits and renewal reminders come from the agreement itself. */
  const createServiceContract = async () => {
    if (!row || !user) return;
    setBusy("contract");
    const { data: contract, error } = await supabase.from("service_contracts").insert({
      name: row.title,
      customer_id: row.customer_id,
      start_date: row.start_date,
      renewal_date: row.end_date || row.start_date,
      contract_value: Number(row.total_value || 0),
      billing_frequency: "annual",
      price_increase_pct: 0,
      reference_number: "",
      notes: `Created from signed agreement ${row.reference}`,
      created_by: user.id,
    } as any).select("id").single();
    if (error || !contract) { setBusy(null); toast.error(error?.message || "Could not set up the contract"); return; }

    const services = details.services || [];
    if (services.length) {
      await supabase.from("service_contract_services").insert(
        services.map((s, i) => ({
          contract_id: contract.id,
          description: `${s.description}${s.frequency ? ` — ${s.frequency}` : ""}`,
          quantity: s.quantity || 1,
          unit_price: s.unit_price || 0,
          sort_order: i,
        })) as any
      );
    }
    const siteIds = (details.sites || []).map((s) => s.id).filter(Boolean);
    if (siteIds.length) {
      await supabase.from("service_contract_sites").insert(
        siteIds.map((site_id) => ({ contract_id: contract.id, site_id })) as any
      );
    }
    await supabase.from("contract_agreements").update({ contract_id: contract.id } as any).eq("id", row.id);
    await logAction("Agreement scheduled as service contract");
    setBusy(null);
    toast.success("Cover set up — visits and renewals now run from this agreement");
    navigate(`/contracts/${contract.id}`);
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading…</div>;
  if (!row) return <div className="py-12 text-center text-muted-foreground">Agreement not found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/agreements" className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> All agreements
          </Link>
          <h1 className="text-2xl font-bold">{row.title}</h1>
          <p className="text-sm text-muted-foreground font-mono">
            {row.reference} •{" "}
            <Link to={`/customers/${row.customer_id}`} className="text-primary hover:underline">{row.customers?.name}</Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{AGREEMENT_STATUS_LABEL[row.status] || row.status}</Badge>
          <Button size="sm" variant="outline" onClick={downloadPdf} disabled={busy === "pdf"}>
            {busy === "pdf" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}PDF
          </Button>
          {row.status === "draft" && (
            <Button size="sm" onClick={sendToPortal} disabled={busy === "send"}>
              <Send className="mr-1.5 h-4 w-4" />Send for signature
            </Button>
          )}
          {row.status === "signed" && !row.contract_id && (
            <Button size="sm" onClick={createServiceContract} disabled={busy === "contract"}>
              {busy === "contract" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-1.5 h-4 w-4" />}
              Set up cover &amp; renewals
            </Button>
          )}
          {["draft", "sent"].includes(row.status) && (
            <Button size="sm" variant="ghost" onClick={cancelAgreement}><Ban className="mr-1.5 h-4 w-4" />Cancel</Button>
          )}
        </div>
      </div>

      {missing.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
          <span>These fill-in fields had no matching detail and will print as written: {missing.join(", ")}</span>
        </div>
      )}

      {row.status === "signed" && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm flex gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
          <span>Signed by {row.signer_name}{row.signer_role ? ` (${row.signer_role})` : ""} on {formatDate(row.signed_at)}.</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4">
          <p className="text-lg font-bold">{formatDate(row.start_date)}</p><p className="text-xs text-muted-foreground">Starts</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-lg font-bold">{row.end_date ? formatDate(row.end_date) : "—"}</p><p className="text-xs text-muted-foreground">Ends</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-lg font-bold">{row.term_months} months</p><p className="text-xs text-muted-foreground">Term</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-lg font-bold">£{Number(row.total_value || 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-muted-foreground">Annual value</p>
        </CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Covered sites</CardTitle></CardHeader>
          <CardContent>
            {(details.sites || []).length === 0 ? <p className="text-sm text-muted-foreground">None listed.</p> : (
              <ul className="space-y-1 text-sm">
                {(details.sites || []).map((s) => (
                  <li key={s.id}><span className="font-medium">{s.name}</span>{s.address ? <span className="text-muted-foreground"> — {s.address}</span> : null}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Services</CardTitle></CardHeader>
          <CardContent>
            {(details.services || []).length === 0 ? <p className="text-sm text-muted-foreground">None listed.</p> : (
              <ul className="space-y-1 text-sm">
                {(details.services || []).map((s, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>{s.description}{s.frequency ? ` — ${s.frequency}` : ""}</span>
                    <span className="text-muted-foreground">{s.quantity} × £{Number(s.unit_price || 0).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Agreement wording</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {merged.map((c, i) => (
            <section key={i} className="space-y-1">
              {c.heading && <h2 className="font-semibold text-sm">{c.heading}</h2>}
              <p className="whitespace-pre-line text-sm text-muted-foreground">{c.text}</p>
            </section>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
