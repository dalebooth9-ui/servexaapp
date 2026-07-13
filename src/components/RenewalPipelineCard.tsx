import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Repeat, ArrowRight, PoundSterling } from "lucide-react";
import { differenceInDays, format } from "date-fns";

type Row = {
  id: string;
  reference_number: string;
  name: string;
  renewal_date: string;
  contract_value: number;
  price_increase_pct: number;
  customers: { name: string } | null;
};

export default function RenewalPipelineCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const in60 = new Date();
      in60.setDate(in60.getDate() + 60);
      const { data } = await supabase
        .from("service_contracts")
        .select("id, reference_number, name, renewal_date, contract_value, price_increase_pct, customers(name)")
        .neq("status", "cancelled")
        .lte("renewal_date", in60.toISOString().slice(0, 10))
        .order("renewal_date");
      setRows((data || []) as any);
      setLoading(false);
    })();
  }, []);

  const totalRenewalValue = rows.reduce((s, r) => s + Number(r.contract_value || 0), 0);
  const totalNewValue = rows.reduce((s, r) => s + Number(r.contract_value || 0) * (1 + Number(r.price_increase_pct || 0) / 100), 0);
  const uplift = totalNewValue - totalRenewalValue;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Repeat className="h-4 w-4 text-primary" /> Renewal autopilot
        </CardTitle>
        <Link to="/contracts" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          Contracts <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contracts due within 60 days.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border p-3">
                <p className="text-2xl font-bold">{rows.length}</p>
                <p className="text-xs text-muted-foreground">Due within 60 days</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-lg font-semibold inline-flex items-center"><PoundSterling className="h-4 w-4" />{totalRenewalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                <p className="text-xs text-muted-foreground">Renewal value</p>
                {uplift > 0 && <p className="text-[11px] text-emerald-600">+£{uplift.toLocaleString(undefined, { maximumFractionDigits: 0 })} after uplift</p>}
              </div>
            </div>
            <ul className="space-y-1">
              {rows.slice(0, 5).map(r => {
                const days = differenceInDays(new Date(r.renewal_date), new Date());
                const cls = days < 0 ? "text-red-600" : days <= 30 ? "text-amber-600" : "text-muted-foreground";
                return (
                  <Link key={r.id} to={`/contracts/${r.id}`} className="flex items-center justify-between text-xs border rounded px-2 py-1.5 hover:bg-muted">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.customers?.name || "—"}</p>
                      <p className="text-muted-foreground truncate">{r.name}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className={cls}>{days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}</p>
                      <p className="text-muted-foreground">£{Number(r.contract_value).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                    </div>
                  </Link>
                );
              })}
            </ul>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/contracts">Review renewals</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
