import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { PortalContext } from "./PortalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDate } from "@/lib/dateFormat";

interface QuoteRow {
  id: string; quote_number: string | null; total: number | null; status: string;
  created_at: string; issued_at: string | null;
  invoice_line_items: Array<{ id: string; description: string; quantity: number | null; unit_price: number | null }>;
}

export default function PortalQuotes() {
  const ctx = useOutletContext<PortalContext>();
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("invoices")
      .select("id, quote_number, total, status, created_at, issued_at, invoice_line_items(id,description,quantity,unit_price)")
      .eq("document_type", "quote")
      .in("status", ["sent", "accepted", "declined"])
      .order("created_at", { ascending: false });
    setQuotes((data || []) as any);
    setLoading(false);
  }
  useEffect(() => { load(); }, [ctx.customerId]);

  async function respond(id: string, status: "accepted" | "declined") {
    setBusyId(id);
    const { error } = await supabase.from("invoices")
      .update({ status, ...(status === "accepted" ? { accepted_at: new Date().toISOString() } : {}) })
      .eq("id", id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "accepted" ? "Quote accepted — we'll be in touch." : "Quote declined.");
    load();
  }

  if (loading) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      {quotes.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No quotes to review.</CardContent></Card>
      )}
      {quotes.map(q => (
        <Card key={q.id}>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Quote {q.quote_number || q.id.slice(0, 8)}</CardTitle>
              <div className="text-sm text-muted-foreground">Issued {formatDate(q.issued_at || q.created_at)}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="font-semibold">£{Number(q.total || 0).toFixed(2)}</div>
              </div>
              <StatusBadge status={q.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="text-sm divide-y">
              {q.invoice_line_items?.map(li => (
                <li key={li.id} className="py-1.5 flex justify-between gap-4">
                  <span>{li.description}</span>
                  <span className="text-muted-foreground">
                    {li.quantity ?? 1} × £{Number(li.unit_price || 0).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
            {q.status === "sent" && (
              <div className="flex gap-2 justify-end">
                <Button variant="outline" disabled={busyId === q.id} onClick={() => respond(q.id, "declined")}>Decline</Button>
                <Button disabled={busyId === q.id} onClick={() => respond(q.id, "accepted")}>Accept quote</Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "accepted") return <Badge className="bg-emerald-600">Accepted</Badge>;
  if (status === "declined") return <Badge variant="destructive">Declined</Badge>;
  return <Badge variant="secondary">Awaiting decision</Badge>;
}
