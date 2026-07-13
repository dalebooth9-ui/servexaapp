import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, FileText, ArrowRight, PoundSterling, CheckCircle2 } from "lucide-react";

type Row = { id: string; status: string; quote_id: string | null; remedial_job_id: string | null; created_at: string };
type Quote = { id: string; status: string; total: number | null };

export default function DefectFlywheelCard() {
  const [loading, setLoading] = useState(true);
  const [openUnquoted, setOpenUnquoted] = useState(0);
  const [oldestDays, setOldestDays] = useState(0);
  const [quotesAwaiting, setQuotesAwaiting] = useState(0);
  const [quotesAwaitingValue, setQuotesAwaitingValue] = useState(0);
  const [conversion, setConversion] = useState({ quotedToApproved: 0, approvedToResolved: 0 });

  useEffect(() => {
    (async () => {
      const { data: defects } = await supabase
        .from("defects")
        .select("id, status, quote_id, remedial_job_id, created_at");
      const list = (defects || []) as Row[];

      const openList = list.filter(d => (d.status === "open" || d.status === "in_progress") && !d.quote_id);
      setOpenUnquoted(openList.length);
      if (openList.length) {
        const oldest = Math.min(...openList.map(d => new Date(d.created_at).getTime()));
        setOldestDays(Math.floor((Date.now() - oldest) / (1000 * 60 * 60 * 24)));
      }

      const quoteIds = Array.from(new Set(list.map(d => d.quote_id).filter(Boolean))) as string[];
      let quotes: Quote[] = [];
      if (quoteIds.length) {
        const { data: qs } = await supabase
          .from("invoices")
          .select("id, status, total")
          .in("id", quoteIds)
          .eq("document_type", "quote");
        quotes = (qs || []) as any;
      }
      const awaiting = quotes.filter(q => q.status === "draft" || q.status === "sent");
      setQuotesAwaiting(awaiting.length);
      setQuotesAwaitingValue(awaiting.reduce((s, q) => s + Number(q.total || 0), 0));

      const quoted = list.filter(d => ["quoted", "approved", "job_created", "resolved", "declined"].includes(d.status)).length;
      const approvedOrBeyond = list.filter(d => ["approved", "job_created", "resolved"].includes(d.status)).length;
      const resolvedFromApproved = list.filter(d => d.status === "resolved" && d.quote_id).length;
      setConversion({
        quotedToApproved: quoted ? Math.round((approvedOrBeyond / quoted) * 100) : 0,
        approvedToResolved: approvedOrBeyond ? Math.round((resolvedFromApproved / approvedOrBeyond) * 100) : 0,
      });

      setLoading(false);
    })();
  }, []);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" /> Defect flywheel
        </CardTitle>
        <Link to="/defects" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          Defects <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <Link to="/defects?filter=unquoted" className="block rounded-md border p-3 hover:bg-muted/40 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{openUnquoted}</p>
                  <p className="text-xs text-muted-foreground">Open, not yet quoted</p>
                </div>
                {oldestDays > 0 && <Badge variant="outline">Oldest {oldestDays}d</Badge>}
              </div>
              {openUnquoted > 0 && (
                <p className="mt-2 text-[11px] text-primary inline-flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Money waiting to be quoted
                </p>
              )}
            </Link>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border p-3">
                <p className="text-lg font-semibold">{quotesAwaiting}</p>
                <p className="text-[11px] text-muted-foreground">Quotes awaiting response</p>
                {quotesAwaitingValue > 0 && (
                  <p className="text-[11px] mt-0.5 inline-flex items-center gap-0.5 text-muted-foreground">
                    <PoundSterling className="h-3 w-3" />
                    {quotesAwaitingValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                )}
              </div>
              <div className="rounded-md border p-3">
                <div className="flex items-center gap-1.5 text-lg font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {conversion.quotedToApproved}%
                </div>
                <p className="text-[11px] text-muted-foreground">Quote → approved</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{conversion.approvedToResolved}% approved → done</p>
              </div>
            </div>

            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/defects?filter=unquoted"><FileText className="mr-2 h-3.5 w-3.5" /> Review open defects</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
