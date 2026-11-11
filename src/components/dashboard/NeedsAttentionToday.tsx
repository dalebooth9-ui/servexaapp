import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertTriangle,
  ClipboardCheck,
  ShieldAlert,
  Clock,
  PoundSterling,
  CalendarDays,
  FileSignature,
  History,
} from "lucide-react";

/**
 * "Needs attention today" — the prime dashboard block.
 * Every number is a real, org-scoped query (RLS does the org scoping).
 * Nothing here is estimated or invented. A failed query shows "—", never 0.
 */

type Tile = {
  key: string;
  label: string;
  value: number | null;
  sub?: string;
  help: string;
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

const show = (v: number | null) => (v == null ? "—" : v);

export default function NeedsAttentionToday() {
  const [loading, setLoading] = useState(true);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [week, setWeek] = useState<{ completed: number | null; defects: number | null; openDefects: number | null; unpaid: number | null; unpaidValue: number | null }>({ completed: null, defects: null, openDefects: null, unpaid: null, unpaidValue: null });

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
        openDefectsTotalRes,
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
        supabase.from("invoices").select("id, total", { count: "exact" })
          .eq("document_type", "invoice").not("status", "in", "(paid,cancelled)").is("paid_at", null).limit(1000),
        supabase.from("defects").select("id", { count: "exact", head: true })
          .eq("status", "open").is("quote_id", null).in("severity", ["high", "critical", "urgent"]),
        supabase.from("invoices").select("id", { count: "exact", head: true })
          .eq("document_type", "quote").eq("status", "sent").lt("sent_at", days14Ago),
        supabase.from("contract_agreements").select("id", { count: "exact", head: true })
          .eq("status", "signed").gte("end_date", today).lte("end_date", in30),
        supabase.from("defects").select("id", { count: "exact", head: true }).eq("status", "open"),
      ]);
      const n = (r: { count: number | null; error: any }) => (r.error || r.count == null ? null : r.count);

      // Jobs due today or earlier that still carry unresolved remedials from a previous visit.
      const { data: carriedRows } = await supabase
        .from("defects")
        .select("job_id")
        .eq("source_kind", "carried_forward")
        .in("status", ["open", "in_progress", "quoted", "approved", "job_created"])
        .not("job_id", "is", null)
        .limit(1000);
      const carriedJobIds = Array.from(new Set((carriedRows || []).map((d: any) => d.job_id)));
      let overdueRemedialJobs = 0;
      if (carriedJobIds.length) {
        const [{ data: dueJobs }, { data: schedRows }] = await Promise.all([
          supabase.from("jobs").select("id, due_date").in("id", carriedJobIds)
            .not("status", "in", OPEN_JOB_STATUSES).lte("due_date", today),
          supabase.from("job_schedule").select("job_id").in("job_id", carriedJobIds).lte("schedule_date", today),
        ]);
        overdueRemedialJobs = new Set([
          ...(dueJobs || []).map((j: any) => j.id),
          ...(schedRows || []).map((s: any) => s.job_id),
        ]).size;
      }

      // Finished but not invoiced — completed jobs with no invoice linked.
      // Value = the accepted quote total for each such job (no quote = no agreed price).
      const completedIds = (completedJobsRes.data || []).map((j: any) => j.id);
      let notInvoiced: number | null = completedJobsRes.error ? null : 0;
      let toInvoiceValue = 0;
      let unpriced = 0;
      if (!completedJobsRes.error && completedIds.length > 0) {
        const [{ data: invoiced, error: invErr }, { data: acceptedQuotes, error: qErr }] = await Promise.all([
          supabase.from("invoices").select("job_id").eq("document_type", "invoice").in("job_id", completedIds),
          supabase.from("invoices").select("job_id, total, created_at").eq("document_type", "quote")
            .eq("status", "accepted").in("job_id", completedIds).order("created_at", { ascending: false }),
        ]);
        if (invErr) notInvoiced = null;
        else {
          const invoicedSet = new Set((invoiced || []).map((i: any) => i.job_id));
          const waiting = completedIds.filter((id) => !invoicedSet.has(id));
          notInvoiced = waiting.length;
          const quoteByJob = new Map<string, number>();
          for (const q of acceptedQuotes || []) if (!quoteByJob.has(q.job_id)) quoteByJob.set(q.job_id, Number(q.total) || 0);
          for (const id of waiting) {
            if (quoteByJob.has(id)) toInvoiceValue += quoteByJob.get(id)!;
            else unpriced += 1;
          }
          if (qErr) unpriced = -1;
        }
      }
      const gbp = (v: number) => v.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
      const invoiceSub = notInvoiced == null || notInvoiced === 0 ? undefined
        : unpriced === -1 ? "Value not available"
        : `${gbp(toInvoiceValue)} to invoice${unpriced ? ` · ${unpriced} with no agreed price` : ""}`;
      const unpaidValue = outstandingRes.error ? null
        : (outstandingRes.data || []).reduce((sum: number, i: any) => sum + (Number(i.total) || 0), 0);

      const scheduledToday = scheduledTodayRes.error ? null : new Set((scheduledTodayRes.data || []).map((s: any) => s.job_id)).size;

      if (!mounted) return;
      const toCheckRes = await supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "submitted_for_review");
      if (!mounted) return;
      const toCheckCount = n(toCheckRes);
      setTiles([
        { key: "to-check", label: "Reports to check", value: toCheckCount, help: "Reports engineers have sent in that the office still needs to check.", to: "/reports-to-check", icon: ClipboardCheck, tone: "warn" },
        { key: "overdue", label: "Overdue jobs", value: n(overdueRes), help: "Open jobs whose due date has passed.", to: "/jobs?view=overdue", icon: AlertTriangle, tone: "urgent" },
        { key: "review", label: "Reports awaiting review", value: n(awaitingReviewRes), help: "Jobs marked as waiting for an office review of their report.", to: "/jobs?view=awaiting-report", icon: ClipboardCheck, tone: "warn" },
        { key: "defects", label: "Defects awaiting quote", value: n(defectsRes), help: "Open defects that have no quote yet.", to: "/defects?status=open&filter=unquoted", icon: ShieldAlert, tone: "warn" },
        { key: "high-defects", label: "High-priority defects not quoted", value: n(highDefectsRes), help: "Open high, critical or urgent defects that have no quote yet.", to: "/defects?status=open&filter=unquoted&severity=high", icon: ShieldAlert, tone: "urgent" },
        { key: "overdue-remedials", label: "Jobs with overdue remedials", value: overdueRemedialJobs, help: "Jobs due today or earlier that still carry unfinished remedials from a previous visit.", to: "/defects?filter=unquoted&source=carried_forward", icon: History, tone: "urgent" },
        { key: "quotes", label: "Quotes expiring", value: n(quotesRes), help: "Open quotes that expire within the next 7 days.", to: "/quotes", icon: Clock, tone: "warn" },
        { key: "stale-quotes", label: "Quotes sent, no reply in 14 days", value: n(staleQuotesRes), help: "Quotes sent more than 14 days ago that are still waiting for an answer.", to: "/quotes", icon: Clock, tone: "warn" },
        { key: "agreements", label: "Agreements expiring in 30 days", value: n(expiringAgreementsRes), help: "Signed agreements that end within the next 30 days.", to: "/agreements", icon: FileSignature, tone: "warn" },
        { key: "invoice", label: `job${notInvoiced === 1 ? "" : "s"} finished, not yet invoiced`, value: notInvoiced, sub: invoiceSub, help: "Completed jobs that don't have an invoice yet; the value comes from each job's accepted quote.", to: "/jobs?view=ready-to-invoice", icon: PoundSterling, tone: "normal" },
        { key: "today", label: "Jobs scheduled today", value: scheduledToday, help: "Jobs with a visit booked on the planner for today.", to: "/planner", icon: CalendarDays, tone: "normal" },
      ]);

      setWeek({
        completed: n(weekCompletedRes),
        defects: n(weekDefectsRes),
        openDefects: n(openDefectsTotalRes),
        unpaid: n(outstandingRes),
        unpaidValue,
      });
      setLoading(false);
    };

    load();
    return () => { mounted = false; };
  }, []);

  return (
    <TooltipProvider delayDuration={150}>
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
            const active = (tile.value ?? 0) > 0;
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
                <div className="min-w-0 flex-1">
                  <p className="text-2xl font-bold leading-none">{show(tile.value)}</p>
                  <p className="mt-1 text-sm text-muted-foreground truncate">{tile.label}</p>
                  {tile.sub && <p className="text-xs text-muted-foreground truncate">{tile.sub}</p>}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`What does "${tile.label}" count?`}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      className="self-start flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold text-muted-foreground"
                    >?</span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[240px]">{tile.help}</TooltipContent>
                </Tooltip>
              </Link>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 border-t pt-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">This week</span>
          <Link to="/jobs?view=completed-this-week" className="hover:text-foreground hover:underline">
            Jobs completed this week: {show(week.completed)}
          </Link>
          <Link to="/defects?created=this-week" className="hover:text-foreground hover:underline">
            New defects found this week: {show(week.defects)} ({show(week.openDefects)} open in total)
          </Link>
          <Link to="/invoices?status=unpaid" className="hover:text-foreground hover:underline">
            Unpaid invoices: {show(week.unpaid)} ({week.unpaidValue == null ? "—" : week.unpaidValue.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 })})
          </Link>
        </div>
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}
