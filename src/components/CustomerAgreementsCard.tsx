import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileSignature, Plus } from "lucide-react";
import { formatDate } from "@/lib/dateFormat";
import { AGREEMENT_STATUS_LABEL } from "@/lib/contractTemplates";
import { CreateAgreementDialog } from "@/pages/ContractAgreements";

/** Service agreements held on a customer record, with their current status. */
export default function CustomerAgreementsCard({ customerId }: { customerId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("contract_agreements")
      .select("id, reference, title, status, start_date, end_date, total_value")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, [customerId]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSignature className="h-4 w-4" /> Service agreements
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> New
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agreements yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded border p-2 text-sm">
                <Link to={`/agreements/${r.id}`} className="min-w-0">
                  <p className="font-medium truncate">{r.title}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {r.reference} · {formatDate(r.start_date)} – {r.end_date ? formatDate(r.end_date) : "—"}
                  </p>
                </Link>
                <Badge variant="outline">{AGREEMENT_STATUS_LABEL[r.status] || r.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {createOpen && (
        <CreateAgreementDialog
          presetCustomerId={customerId}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); load(); }}
        />
      )}
    </Card>
  );
}
