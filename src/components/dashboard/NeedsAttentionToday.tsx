import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ClipboardCheck,
  ShieldAlert,
  Clock,
  PoundSterling,
  CalendarDays,
  FileSignature,
} from "lucide-react";

/**
 * "Needs attention today" — the prime dashboard block.
 * Every number is a real, org-scoped query (RLS does the org scoping).
 * Nothing here is estimated or invented; a zero is shown as a zero.
 */

type Tile = {
  key: string;
  label: string;
  value: number;
  to: string;
  icon: any;
  tone: "urgent" | "warn" | "normal";
};

const todayISO = () => new Date().toISOString().slice(0, 10);

function startOfWeekISO() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

const OPEN_JOB_STATUSES = "(completed,archived,rejected)";

export default function NeedsAttentionToday() {
  const [loading, setLoading] = useState(true);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [week, setWeek] = useState({ completed: 0, defects: 0, outstanding: 0 });

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const today = todayISO();
      const weekStart = startOfWeekISO();
      const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

      const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const days14Ago = new Date(Date.now() - 14 * 86400000).toISOString();

      const [
        overdueRes,
        awaitingReviewRes,
        defectsRes,
        quotesRes,
        completedJobsRes,
        scheduledTodayRes,
        weekCompletedRes,
        weekDefectsRes,
        outstandingRes,
        highDefectsRes,
        staleQuotesRes,
        expiringAgreementsRes,
      ] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .lt("due_date", today).not("status", "in", OPEN_JOB_STATUSES),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("status", "pending_review"),
        supabase.from("defects").select("id", { count: "exact", head: true })
          .eq("status", "open").is("quote_id", null),
        supabase.from("invoices").select("id", { count: "exact", head: true })
          .eq("document_type", "quote").not("status", "in", "(accepted,paid,rejected)")
          .not("due_date", "is", null).lte("due_date", in7),
        supabase.from("jobs").select("id").eq("status", "completed").limit(1000),
        supabase.from("job_schedule").select("job_id").eq("schedule_date", today),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("status", "completed").gte("completed_at", weekStart),
        supabase.from("defects").select("id", { count: "exact", head: true })
          .gte("created_at", weekStart),
        supabase.from("invoices").select("id", { count: "exact", head: true })
          .eq("document_type", "invoice").not("status", "in", "(paid,cancelled)"),
        supabase.from("defects").select("id", { count: "exact", head: true })
          .eq("status", "open").is("quote_id", null).in("severity", ["high", "critical", "urgent"]),
        supabase.from("invoices").select("id", { count: "exact", head: true })
          .eq("document_type", "quote").eq("status", "sent").lt("sent_at", days14Ago),
        supabase.from("contract_agreements").select("id", { count: "exact", head: true })
          .eq("status", "signed").gte("end_date", today).lte("end_date", in30),
      ]);

      // Completed but not invoiced — compare completed job ids against invoice job links.
      const completedIds = (completedJobsRes.data || []).map((j: any) => j.id);
      let notInvoiced = 0;
      if (completedIds.length > 0) {
        const { data: invoiced } = await supabase
          .from("invoices")
          .select("job_id")
          .eq("document_type", "invoice")
          .in("job_id", completedIds);
        const invoicedSet = new Set((invoiced || []).map((i: any) => i.job_id));
        notInvoiced = completedIds.filter((id) => !invoicedSet.has(id)).length;
      }

      const scheduledToday = new Set((scheduledTodayRes.data || []).map((s: any) => s.job_id)).size;

      if (!mounted) return;
      setTiles([
        { key: "overdue", label: "Overdue jobs", value: overdueRes.count || 0, to: "/jobs?view=overdue", icon: AlertTriangle, tone: "urgent" },
        { key: "review", label: "Reports awaiting review", value: awaitingReviewRes.count || 0, to: "/jobs?view=awaiting-report", icon: ClipboardCheck, tone: "warn" },
        { key: "defects", label: "Defects awaiting quote", value: defectsRes.count || 0, to: "/defects", icon: ShieldAlert, tone: "warn" },
        { key: "high-defects", label: "High-priority defects not quoted", value: highDefectsRes.count || 0, to: "/defects", icon: ShieldAlert, tone: "urgent" },
        { key: "quotes", label: "Quotes expiring", value: quotesRes.count || 0, to: "/quotes", icon: Clock, tone: "warn" },
        { key: "stale-quotes", label: "Quotes sent, no reply in 14 days", value: staleQuotesRes.count || 0, to: "/quotes", icon: Clock, tone: "warn" },
        { key: "agreements", label: "Agreements expiring in 30 days", value: expiringAgreementsRes.count || 0, to: "/agreements", icon: FileSignature, tone: "warn" },
        { key: "invoice", label: "Completed, not invoiced", value: notInvoiced, to: "/jobs?view=ready-to-invoice", icon: PoundSterling, tone: "normal" },
        { key: "today", label: "Jobs scheduled today", value: scheduledToday, to: "/planner", icon: CalendarDays, tone: "normal" },
      ]);

      setWeek({
        completed: weekCompletedRes.count || 0,
        defects: weekDefectsRes.count || 0,
        outstanding: outstandingRes.count || 0,
      });
      setLoading(false);
    };

    load();
    return () => { mounted = false; };
  }, []);

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Needs attention today</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(loading ? Array.from({ length: 9 }) : tiles).map((t: any, i: number) => {
            if (loading) {
              return <div key={i} className="h-[74px] animate-pulse rounded-lg bg-muted" />;
            }
            const tile = t as Tile;
            const active = tile.value > 0;
            return (
              <Link
                key={tile.key}
                to={tile.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 transition-colors min-h-[74px]",
                  active && tile.tone === "urgent" && "border-destructive/40 bg-destructive/5 hover:bg-destructive/10",
                  active && tile.tone === "warn" && "border-warning/40 bg-warning/5 hover:bg-warning/10",
                  active && tile.tone === "normal" && "hover:bg-muted/60",
                  !active && "opacity-60 hover:bg-muted/40"
                )}
              >
                <tile.icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    active && tile.tone === "urgent" ? "text-destructive" :
                    active && tile.tone === "warn" ? "text-warning" : "text-muted-foreground"
                  )}
                />
                <div className="min-w-0">
                  <p className="text-2xl font-bold leading-none">{tile.value}</p>
                  <p className="mt-1 text-sm text-muted-foreground truncate">{tile.label}</p>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 border-t pt-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">This week</span>
          <span>{week.completed} job{week.completed === 1 ? "" : "s"} completed</span>
          <span>{week.defects} defect{week.defects === 1 ? "" : "s"} raised</span>
          <span>{week.outstanding} invoice{week.outstanding === 1 ? "" : "s"} outstanding</span>
        </div>
      </CardContent>
    </Card>
  );
}
