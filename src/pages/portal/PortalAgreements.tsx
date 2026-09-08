import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { PortalContext } from "./PortalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatDate } from "@/lib/dateFormat";
import InlineSignaturePad from "@/components/InlineSignaturePad";
import {
  AGREEMENT_STATUS_LABEL, AgreementDetails, ContractClause, buildMergeContext, mergeClauses,
} from "@/lib/contractTemplates";

export default function PortalAgreements() {
  const ctx = useOutletContext<PortalContext>();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signerRole, setSignerRole] = useState("");

  const load = async () => {
    const { data } = await supabase
      .from("contract_agreements")
      .select("*")
      .order("created_at", { ascending: false });
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [ctx.customerId]);

  const sign = async (row: any, signature: string) => {
    if (!signerName.trim()) { toast.error("Please type your name first"); return; }
    const { error } = await supabase.from("contract_agreements").update({
      status: "signed",
      signed_at: new Date().toISOString(),
      signer_name: signerName.trim(),
      signer_role: signerRole.trim() || null,
      signature_data: signature,
    } as any).eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Thank you — your agreement has been signed.");
    setSigningId(null); setSignerName(""); setSignerRole("");
    load();
  };

  if (loading) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      {rows.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No agreements to review.</CardContent></Card>
      )}
      {rows.map((row) => (
        <AgreementCard
          key={row.id}
          row={row}
          providerName={ctx.orgName}
          customerName={ctx.customerName}
          signing={signingId === row.id}
          onStartSigning={() => setSigningId(row.id)}
          onCancelSigning={() => setSigningId(null)}
          signerName={signerName}
          signerRole={signerRole}
          setSignerName={setSignerName}
          setSignerRole={setSignerRole}
          onSign={(sig) => sign(row, sig)}
        />
      ))}
    </div>
  );
}

function AgreementCard(props: {
  row: any; providerName: string; customerName: string; signing: boolean;
  onStartSigning: () => void; onCancelSigning: () => void;
  signerName: string; signerRole: string;
  setSignerName: (v: string) => void; setSignerRole: (v: string) => void;
  onSign: (signature: string) => void;
}) {
  const { row } = props;
  const details: AgreementDetails = row.details || {};
  const merged = useMemo(() => {
    const ctx = buildMergeContext({
      reference: row.reference,
      customerName: props.customerName,
      customerAddress: details.customer_address ?? null,
      providerName: props.providerName,
      sites: details.sites || [],
      services: details.services || [],
      startDate: row.start_date,
      endDate: row.end_date,
      termMonths: row.term_months,
      renewalBasis: row.renewal_basis,
      totalValue: Number(row.total_value || 0),
    });
    return mergeClauses((row.clauses || []) as ContractClause[], ctx);
  }, [row, details, props.customerName, props.providerName]);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{row.title}</CardTitle>
          <div className="text-sm text-muted-foreground">
            {row.reference} · {formatDate(row.start_date)} – {row.end_date ? formatDate(row.end_date) : "—"}
          </div>
        </div>
        <Badge variant={row.status === "signed" ? "default" : "secondary"}>
          {AGREEMENT_STATUS_LABEL[row.status] || row.status}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 max-h-96 overflow-y-auto rounded-md border p-3">
          {merged.map((c, i) => (
            <section key={i} className="space-y-1">
              {c.heading && <h3 className="text-sm font-semibold">{c.heading}</h3>}
              <p className="whitespace-pre-line text-sm text-muted-foreground">{c.text}</p>
            </section>
          ))}
        </div>

        {row.status === "signed" && (
          <p className="text-sm text-muted-foreground">
            Signed by {row.signer_name}{row.signer_role ? ` (${row.signer_role})` : ""} on {formatDate(row.signed_at)}.
          </p>
        )}

        {row.status === "sent" && !props.signing && (
          <div className="flex justify-end">
            <Button onClick={props.onStartSigning}>Accept &amp; sign</Button>
          </div>
        )}

        {row.status === "sent" && props.signing && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Your full name</Label><Input value={props.signerName} onChange={(e) => props.setSignerName(e.target.value)} /></div>
              <div><Label>Position (optional)</Label><Input value={props.signerRole} onChange={(e) => props.setSignerRole(e.target.value)} /></div>
            </div>
            <p className="text-xs text-muted-foreground">
              By signing you accept the terms above on behalf of {props.customerName}.
            </p>
            <InlineSignaturePad onCapture={props.onSign} onCancel={props.onCancelSigning} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
