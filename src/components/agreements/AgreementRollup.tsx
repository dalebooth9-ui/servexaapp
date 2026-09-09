import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dateFormat";
import type { AgreementDetails } from "@/lib/contractTemplates";

/**
 * Operational rollup for an agreement: what the paperwork promises vs what has
 * actually been delivered. Every figure is a live, RLS-scoped read — the only
 * derived number is "visits included", worked out from the agreement's own
 * service lines and term length.
 */

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Visits per year implied by a frequency phrase written on the agreement. */
export function visitsPerYear(frequency?: string | null): number | null {
  const f = (frequency || "").toLowerCase();
  if (!f) return null;
  if (f.includes("week")) return 52;
  if (f.includes("month") && f.includes("6")) return 2;
  if (f.includes("six-month") || f.includes("six month") || f.includes("bi-annual") || f.includes("biannual") || f.includes("half")) return 2;
  if (f.includes("quarter")) return 4;
  if (f.includes("month")) return 12;
  if (f.includes("annual") || f.includes("year")) return 1;
  return null;
}

type Roll = {
  included: number | null;
  completed: number;
  nextVisit: string | null;
  renewalDays: number | null;
  openDefects: number;
  remedialValue: number;
  quotes: any[];
  invoices: any[];
};

export default function AgreementRollup({
  agreementId,
  customerId,
  startDate,
  endDate,
  termMonths,
  details,
}: {
  agreementId: string;
  customerId: string | null;
  startDate: string | null;
  endDate: string | null;
  termMonths: number | null;
  details: AgreementDetails;
}) {
  const [roll, setRoll] = useState<Roll | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRoll(null);
      const siteIds = (details.sites || []).map((s) => s.id).filter(Boolean) as string[];
      const services = details.services || [];

      // Visits promised across the term (null when no frequency is stated).
      const months = termMonths || 12;
      let included: number | null = null;
      for (const s of services) {
        const per = visitsPerYear(s.frequency);
        if (per === null) continue;
        included = (included || 0) + Math.round((per * months) / 12) * Math.max(1, siteIds.length || 1);
      }

      // Jobs at the covered sites (fall back to the customer when no sites listed)
      let jobQuery = supabase.from("jobs").select("id, status, completed_at, site_id, customer_id");
      jobQuery = siteIds.length ? jobQuery.in("site_id", siteIds) : jobQuery.eq("customer_id", customerId || "");
      const { data: jobRows } = await jobQuery;
      const jobs = jobRows || [];
      const jobIds = jobs.map((j: any) => j.id);

      const inTerm = (d?: string | null) => {
        if (!d) return false;
        const day = String(d).slice(0, 10);
        if (startDate && day < startDate) return false;
        if (endDate && day > endDate) return false;
        return true;
      };
      const completed = jobs.filter((j: any) => ["completed", "archived"].includes(j.status) && inTerm(j.completed_at)).length;

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

      // Open defects across the covered sites / jobs
      let openDefects = 0;
      let defectQuoteIds: string[] = [];
      if (siteIds.length || jobIds.length) {
        const filters: string[] = [];
        if (siteIds.length) filters.push(`site_id.in.(${siteIds.join(",")})`);
        if (jobIds.length) filters.push(`job_id.in.(${jobIds.join(",")})`);
        const { data: defects } = await supabase
          .from("defects")
          .select("id, quote_id")
          .is("resolved_at", null)
          .or(filters.join(","));
        openDefects = (defects || []).length;
        defectQuoteIds = [...new Set((defects || []).map((d: any) => d.quote_id).filter(Boolean))];
      }

      let remedialValue = 0;
      if (defectQuoteIds.length) {
        const { data: quoted } = await supabase.from("invoices").select("id, total").in("id", defectQuoteIds);
        remedialValue = (quoted || []).reduce((s: number, q: any) => s + Number(q.total || 0), 0);
      }

      let quotes: any[] = [];
      let invoices: any[] = [];
      if (jobIds.length) {
        const { data: docs } = await supabase
          .from("invoices")
          .select("id, invoice_number, document_type, status, total, created_at")
          .in("job_id", jobIds)
          .order("created_at", { ascending: false })
          .limit(20);
        quotes = (docs || []).filter((d: any) => d.document_type === "quote");
        invoices = (docs || []).filter((d: any) => d.document_type === "invoice");
      }

      if (cancelled) return;
      setRoll({
        included,
        completed,
        nextVisit,
        renewalDays: endDate ? Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000) : null,
        openDefects,
        remedialValue,
        quotes,
        invoices,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [agreementId, customerId, startDate, endDate, termMonths, details]);

  if (!roll) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Delivery against this agreement</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-20 w-full" /></CardContent>
      </Card>
    );
  }

  const remaining = roll.included === null ? null : Math.max(0, roll.included - roll.completed);
  const renewalSoon = roll.renewalDays !== null && roll.renewalDays <= 60;

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Delivery against this agreement</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border p-3">
            <p className="text-lg font-bold">{roll.included === null ? "—" : roll.included}</p>
            <p className="text-xs text-muted-foreground">Visits included this term</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-lg font-bold">{roll.completed}</p>
            <p className="text-xs text-muted-foreground">Visits completed</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-lg font-bold">{remaining === null ? "—" : remaining}</p>
            <p className="text-xs text-muted-foreground">Visits remaining</p>
          </div>
          <div className={cn("rounded-lg border p-3", renewalSoon && "border-amber-500/40 bg-amber-500/5")}>
            <p className={cn("text-lg font-bold", renewalSoon && "text-amber-700")}>
              {roll.renewalDays === null ? "—" : `${roll.renewalDays}d`}
            </p>
            <p className="text-xs text-muted-foreground">Until renewal</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="text-sm font-semibold">{roll.nextVisit ? formatDate(roll.nextVisit) : "None planned"}</p>
            <p className="text-xs text-muted-foreground">Next planned visit</p>
          </div>
          <Link
            to={customerId ? `/defects?customer=${customerId}` : "/defects"}
            className={cn(
              "rounded-lg border p-3 transition-colors hover:border-primary/60",
              roll.openDefects > 0 && "border-destructive/40 bg-destructive/5",
            )}
          >
            <p className={cn("text-sm font-semibold", roll.openDefects > 0 && "text-destructive")}>
              {roll.openDefects} open
              {roll.remedialValue > 0 && ` · £${roll.remedialValue.toLocaleString("en-GB", { maximumFractionDigits: 0 })} quoted`}
            </p>
            <p className="text-xs text-muted-foreground">Defects at covered sites</p>
          </Link>
        </div>

        <div className="border-t pt-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Linked quotes &amp; invoices</p>
          {roll.quotes.length === 0 && roll.invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">None raised against the covered sites yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {roll.quotes.map((q: any) => (
                <Link key={q.id} to="/quotes" className="rounded border px-2 py-1 text-xs hover:border-primary/60">
                  Quote {q.invoice_number} · {q.status} · £{Number(q.total || 0).toLocaleString("en-GB")}
                </Link>
              ))}
              {roll.invoices.map((v: any) => (
                <Link key={v.id} to="/invoices" className="rounded border px-2 py-1 text-xs hover:border-primary/60">
                  Invoice {v.invoice_number} · {v.status} · £{Number(v.total || 0).toLocaleString("en-GB")}
                </Link>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
