import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDateShort } from "@/lib/dateFormat";
import {
  Briefcase,
  AlertTriangle,
  ClipboardCheck,
  FileText,
  FileSignature,
  Repeat,
  Archive,
  CalendarClock,
  History,
} from "lucide-react";

/**
 * Compact "at a glance" strip of live, org-scoped chips.
 * Every figure comes from a real query under RLS — no derived guesses.
 * Zero-value chips stay visible but muted so the shape is consistent.
 */

type Chip = {
  key: string;
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string | null;
  to: string;
  tone?: "default" | "danger" | "warning";
  zero: boolean;
};

const ACTIVE_JOB_STATUSES = ["active", "scheduled", "in_progress", "on_hold", "awaiting_parts", "pending_review"];

function ChipCard({ chip }: { chip: Chip }) {
  const Icon = chip.icon;
  return (
    <Link
      to={chip.to}
      className={cn(
        "flex min-w-[8.5rem] flex-1 items-center gap-2 rounded-lg border bg-card px-3 py-2 transition-colors hover:border-primary/60",
        chip.zero && "opacity-60",
        chip.tone === "danger" && !chip.zero && "border-destructive/40 bg-destructive/5",
        chip.tone === "warning" && !chip.zero && "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 text-muted-foreground",
          chip.tone === "danger" && !chip.zero && "text-destructive",
          chip.tone === "warning" && !chip.zero && "text-amber-600",
        )}
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight">{chip.value}</span>
        <span className="block truncate text-[11px] leading-tight text-muted-foreground">
          {chip.sub || chip.label}
        </span>
      </span>
    </Link>
  );
}

function StripShell({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function LoadingStrip({ count }: { count: number }) {
  return (
    <StripShell>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-[52px] min-w-[8.5rem] flex-1 rounded-lg" />
      ))}
    </StripShell>
  );
}

const days = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
const todayISO = () => new Date().toISOString().slice(0, 10);
const isoIn = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

export function CustomerAtAGlance({ customerId, customerName }: { customerId: string; customerName?: string | null }) {
  const [chips, setChips] = useState<Chip[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setChips(null);
      const q = `customer=${customerId}`;

      const [{ data: jobRows }, { data: siteLinks }] = await Promise.all([
        supabase.from("jobs").select("id, status").eq("customer_id", customerId),
        supabase.from("customer_sites").select("site_id").eq("customer_id", customerId),
      ]);
      const jobs = jobRows || [];
      const jobIds = jobs.map((j) => j.id);
      const siteIds = (siteLinks || []).map((s: any) => s.site_id).filter(Boolean);

      // Open defects: raised on this customer's jobs or sites
      let defectCount = 0;
      if (jobIds.length || siteIds.length) {
        const filters: string[] = [];
        if (jobIds.length) filters.push(`job_id.in.(${jobIds.join(",")})`);
        if (siteIds.length) filters.push(`site_id.in.(${siteIds.join(",")})`);
        const { count } = await supabase
          .from("defects")
          .select("id", { count: "exact", head: true })
          .is("resolved_at", null)
          .or(filters.join(","));
        defectCount = count || 0;
      }

      // Quotes outstanding (draft or sent)
      const { data: quoteRows } = await supabase
        .from("invoices")
        .select("id, total, status, job_id, customer_name")
        .eq("document_type", "quote")
        .in("status", ["draft", "sent"]);
      const outstandingQuotes = (quoteRows || []).filter(
        (q: any) =>
          (q.job_id && jobIds.includes(q.job_id)) ||
          (customerName && (q.customer_name || "").trim().toLowerCase() === customerName.trim().toLowerCase()),
      );
      const quoteValue = outstandingQuotes.reduce((s: number, q: any) => s + Number(q.total || 0), 0);

      // Agreements
      const { data: agreements } = await supabase
        .from("contract_agreements")
        .select("id, status, end_date")
        .eq("customer_id", customerId)
        .eq("status", "signed");
      const activeAgreements = (agreements || []).filter((a: any) => !a.end_date || a.end_date >= todayISO());
      const soonest = activeAgreements
        .map((a: any) => a.end_date)
        .filter(Boolean)
        .sort()[0] as string | undefined;
      const soonestDays = soonest ? days(soonest) : null;

      // Renewals due in next 90 days
      const { count: renewalCount } = await supabase
        .from("service_contracts")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customerId)
        .neq("status", "cancelled")
        .gte("renewal_date", todayISO())
        .lte("renewal_date", isoIn(90));

      // Archived documents
      const { count: archiveCount } = await supabase
        .from("archived_documents")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customerId);

      // Compliance evidence: completed jobs with report + both signatures + sent
      const completedIds = jobs.filter((j) => ["completed", "archived"].includes(j.status || "")).map((j) => j.id);
      let evidenced = 0;
      if (completedIds.length) {
        const [{ data: sheets }, { data: sigs }, { data: outEmails }] = await Promise.all([
          supabase.from("job_sheet_responses").select("job_id, status, submitted_at").in("job_id", completedIds),
          supabase.from("job_signatures").select("job_id, signer_role").in("job_id", completedIds),
          supabase.from("job_emails").select("job_id").in("job_id", completedIds).eq("direction", "outbound"),
        ]);
        const reported = new Set(
          (sheets || [])
            .filter((r: any) => !!r.submitted_at || r.status === "submitted" || r.status === "approved")
            .map((r: any) => r.job_id),
        );
        const engSig = new Set(
          (sigs || []).filter((s: any) => (s.signer_role || "").toLowerCase().includes("engineer")).map((s: any) => s.job_id),
        );
        const custSig = new Set(
          (sigs || []).filter((s: any) => (s.signer_role || "").toLowerCase().includes("customer")).map((s: any) => s.job_id),
        );
        const sent = new Set((outEmails || []).map((e: any) => e.job_id));
        evidenced = completedIds.filter(
          (id) => reported.has(id) && engSig.has(id) && custSig.has(id) && sent.has(id),
        ).length;
      }


      if (cancelled) return;

      const activeJobs = jobs.filter((j) => ACTIVE_JOB_STATUSES.includes(j.status || "")).length;
      const awaitingReview = jobs.filter((j) => j.status === "pending_review").length;

      setChips([
        {
          key: "jobs",
          icon: Briefcase,
          label: "Jobs",
          value: `${jobs.length}`,
          sub: `${jobs.length} jobs · ${activeJobs} active`,
          to: `/jobs?${q}`,
          zero: jobs.length === 0,
        },
        {
          key: "defects",
          icon: AlertTriangle,
          label: "Open defects",
          value: `${defectCount}`,
          sub: "Open defects",
          to: `/defects?${q}`,
          tone: defectCount > 0 ? "danger" : "default",
          zero: defectCount === 0,
        },
        {
          key: "review",
          icon: ClipboardCheck,
          label: "Awaiting review",
          value: `${awaitingReview}`,
          sub: "Reports awaiting review",
          to: `/jobs?view=awaiting-report&${q}`,
          zero: awaitingReview === 0,
        },
        {
          key: "quotes",
          icon: FileText,
          label: "Quotes outstanding",
          value: `${outstandingQuotes.length}`,
          sub: outstandingQuotes.length
            ? `Quotes out · £${quoteValue.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`
            : "Quotes outstanding",
          to: `/quotes?${q}`,
          zero: outstandingQuotes.length === 0,
        },
        {
          key: "agreements",
          icon: FileSignature,
          label: "Agreements",
          value: `${activeAgreements.length}`,
          sub:
            soonestDays !== null
              ? `Agreements · renews in ${soonestDays}d`
              : "Active agreements",
          to: `/agreements?${q}`,
          tone: soonestDays !== null && soonestDays <= 60 ? "warning" : "default",
          zero: activeAgreements.length === 0,
        },
        {
          key: "renewals",
          icon: Repeat,
          label: "Renewals (90d)",
          value: `${renewalCount || 0}`,
          sub: "Renewals next 90 days",
          to: `/renewals?${q}`,
          zero: !renewalCount,
        },
        {
          key: "archive",
          icon: Archive,
          label: "Archived documents",
          value: `${archiveCount || 0}`,
          sub: "Archived documents",
          to: `/archive?${q}`,
          zero: !archiveCount,
        },
      ]);
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, customerName]);

  if (!chips) return <LoadingStrip count={7} />;
  return (
    <StripShell>
      {chips.map((c) => (
        <ChipCard key={c.key} chip={c} />
      ))}
    </StripShell>
  );
}

export function SiteAtAGlance({ siteId }: { siteId: string }) {
  const [chips, setChips] = useState<Chip[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setChips(null);
      const { data: jobRows } = await supabase
        .from("jobs")
        .select("id, status, completed_at")
        .eq("site_id", siteId);
      const jobs = jobRows || [];
      const jobIds = jobs.map((j) => j.id);

      const [{ count: defectCount }, { count: archiveCount }] = await Promise.all([
        supabase
          .from("defects")
          .select("id", { count: "exact", head: true })
          .is("resolved_at", null)
          .eq("site_id", siteId),
        supabase.from("archived_documents").select("id", { count: "exact", head: true }).eq("site_id", siteId),
      ]);

      let nextVisit: string | null = null;
      if (jobIds.length) {
        const { data: sched } = await supabase
          .from("job_schedule")
          .select("schedule_date")
          .in("job_id", jobIds)
          .gte("schedule_date", todayISO())
          .order("schedule_date", { ascending: true })
          .limit(1);
        nextVisit = sched?.[0]?.schedule_date || null;
      }

      if (cancelled) return;

      const activeJobs = jobs.filter((j) => ACTIVE_JOB_STATUSES.includes(j.status || "")).length;
      const lastVisit = jobs
        .map((j: any) => j.completed_at)
        .filter(Boolean)
        .sort()
        .reverse()[0] as string | undefined;

      setChips([
        {
          key: "jobs",
          icon: Briefcase,
          label: "Jobs",
          value: `${jobs.length}`,
          sub: `${jobs.length} jobs · ${activeJobs} active`,
          to: `/jobs?site=${siteId}`,
          zero: jobs.length === 0,
        },
        {
          key: "defects",
          icon: AlertTriangle,
          label: "Open defects",
          value: `${defectCount || 0}`,
          sub: "Open defects",
          to: `/defects?site=${siteId}`,
          tone: (defectCount || 0) > 0 ? "danger" : "default",
          zero: !defectCount,
        },
        {
          key: "last",
          icon: History,
          label: "Last visit",
          value: lastVisit ? formatDateShort(lastVisit) : "—",
          sub: "Last visit",
          to: `/jobs?site=${siteId}`,
          zero: !lastVisit,
        },
        {
          key: "next",
          icon: CalendarClock,
          label: "Next planned visit",
          value: nextVisit ? formatDateShort(nextVisit) : "—",
          sub: "Next planned visit",
          to: `/planner`,
          zero: !nextVisit,
        },
        {
          key: "archive",
          icon: Archive,
          label: "Archived documents",
          value: `${archiveCount || 0}`,
          sub: "Archived documents",
          to: `/archive?site=${siteId}`,
          zero: !archiveCount,
        },
      ]);
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  if (!chips) return <LoadingStrip count={5} />;
  return (
    <StripShell>
      {chips.map((c) => (
        <ChipCard key={c.key} chip={c} />
      ))}
    </StripShell>
  );
}
