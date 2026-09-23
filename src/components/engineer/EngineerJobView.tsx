/**
 * EngineerJobView — simplified, mobile/tablet-first job detail view for
 * engineers (and admins previewing as engineer). Replaces the full admin
 * tabbed layout with the field-work essentials only:
 *
 *   1) Job header (site, address, what the job is)
 *   2) Your report(s)  — EngineerJobHero (primary action)
 *   3) Site documents  — reference docs (RAMS, access notes, prior reports)
 *   4) Defects         — job/site-scoped defects
 *   5) Photos          — add/view job photos
 *
 * No Emails, Parts, Activity, Survey & Snags, or admin tab bar.
 *
 * The report "Fill in / Continue" flow relies on JobSheetTemplates being
 * mounted (it listens for the `job-sheet:fill-online` window event). We
 * mount JobSheet — which renders JobSheetTemplates — hidden alongside the
 * hero so the event has a listener without exposing the admin sheet list.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, CheckCircle2, Eye } from "lucide-react";
import EngineerJobHero from "@/components/engineer/EngineerJobHero";

const JobDocuments = lazy(() => import("@/components/JobDocuments"));
const ScanDocumentButton = lazy(() => import("@/components/documents/ScanDocumentButton"));
const ScanPaperReportButton = lazy(() => import("@/components/paper-scan/ScanPaperReportButton"));

const JobDefects = lazy(() => import("@/components/jobs/JobDefects"));
const JobPhotos = lazy(() => import("@/components/jobs/JobPhotos"));
const JobSheet = lazy(() => import("@/components/JobSheet"));
const QuickPartsList = lazy(() => import("@/components/jobs/QuickPartsList"));
const JobRamsPanel = lazy(() => import("@/components/rams/JobRamsPanel"));


const Fallback = () => (
  <div className="h-8 w-full animate-pulse rounded bg-muted/40" aria-hidden />
);

/**
 * ScanReportCards — "Digital report saved" cards shown in the Site documents
 * section. After a paper scan saves, the scanned page photos land in the
 * documents list, but the converted digital report only appears in the hero
 * at the top of the page. These cards surface the digital report right next
 * to the photos the engineer is looking at.
 *
 * Only scan-originated responses are shown (responses->_scan_source =
 * 'paper_scan_job_page'), with a realtime subscription so a card appears the
 * moment the scan dialog saves.
 */
function ScanReportCards({ jobId }: { jobId: string }) {
  const [reports, setReports] = useState<Array<{ id: string; templateId: string; templateName: string }>>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("job_sheet_responses")
        .select("id, template_id, responses, submitted_at")
        .eq("job_id", jobId)
        .eq("status", "submitted");

      if (cancelled) return;
      const rows = (data as any[]) || [];
      const scanRows = rows.filter((r) => r.responses?._scan_source === "paper_scan_job_page");
      if (!scanRows.length) {
        setReports([]);
        return;
      }
      // Newest first
      scanRows.sort((a, b) => String(b.submitted_at || "").localeCompare(String(a.submitted_at || "")));
      const tplIds = Array.from(new Set(scanRows.map((r) => r.template_id).filter(Boolean)));
      let names = new Map<string, string>();
      if (tplIds.length) {
        const { data: tpls } = await supabase
          .from("job_sheet_templates")
          .select("id, name")
          .in("id", tplIds as string[]);
        names = new Map(((tpls as any[]) || []).map((t) => [t.id, t.name as string]));
      }
      if (cancelled) return;
      setReports(
        scanRows.map((r) => ({
          id: r.id,
          templateId: r.template_id,
          templateName: names.get(r.template_id) || "Report",
        })),
      );
    };

    load();
    const channel = supabase
      .channel(`scan-reports-${jobId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_sheet_responses", filter: `job_id=eq.${jobId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  if (reports.length === 0) return null;

  const openReport = (r: { id: string; templateId: string }) => {
    // Same re-dispatch pattern as EngineerJobHero: the JobSheet chunk is lazy
    // and may not have mounted its listener yet on slow mobile. The nonce
    // makes the listener act only once.
    const nonce = `view-${r.id}-${Date.now()}-${Math.random()}`;
    let attempts = 0;
    const tryDispatch = () => {
      attempts++;
      const detail: Record<string, unknown> = {
        jobId,
        templateId: r.templateId,
        responseId: r.id,
        mode: "view",
        nonce,
      };
      window.dispatchEvent(new CustomEvent("job-sheet:fill-online", { detail }));
      if (!detail.handled && attempts < 16) setTimeout(tryDispatch, 250);
    };
    setTimeout(tryDispatch, 50);
  };

  return (
    <div className="space-y-2 mb-3">
      {reports.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-3"
        >
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Digital report saved</p>
            <p className="text-xs text-muted-foreground truncate">{r.templateName}</p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => openReport(r)}>
            <Eye className="h-4 w-4" />
            View report
          </Button>
        </div>
      ))}
    </div>
  );
}

type Props = {
  jobId: string;
  job: any;
  engineers: any[];
  currentUserId?: string;
  isAssignedEngineer: boolean;
};

function getCustomerName(job: any): string | null {
  return job?.customers?.name || job?.customer || null;
}

export default function EngineerJobView({ jobId, job, engineers, currentUserId, isAssignedEngineer }: Props) {
  const custName = getCustomerName(job);
  const siteName = job?.sites?.name as string | undefined;
  const address = (job?.address as string | undefined) || undefined;
  const poRef = (job as any)?.customer_po
    ? `PO ${(job as any).customer_po}`
    : job?.reference_number;
  // Bumped after a paper scan saves so the documents list picks it up.
  const [docsKey, setDocsKey] = useState(0);

  return (
    <div className="space-y-5">
      {/* Header — what the job is, where */}
      <header className="rounded-2xl border bg-card p-4 md:p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold break-words">{job?.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              <span className="font-mono">{poRef}</span>
              {custName && <> · <span className="font-medium text-foreground">{custName}</span></>}
            </p>
            {(siteName || address) && (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="break-words">
                  {siteName && <span className="font-medium">{siteName}</span>}
                  {siteName && address && <span className="text-muted-foreground"> — </span>}
                  {address && <span>{address}</span>}
                </span>
              </p>
            )}
            {(job?.sites as any)?.what3words && (
              <p className="mt-1 ml-6 text-xs">
                <a
                  href={`https://what3words.com/${String((job.sites as any).what3words).replace(/^\/\/\//, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-[hsl(var(--primary))] hover:underline"
                  style={{ color: "#E11F26" }}
                >
                  ///{String((job.sites as any).what3words).replace(/^\/\/\//, "")}
                </a>
                <span className="text-muted-foreground"> — precise site location</span>
              </p>
            )}
          </div>
          {job?.status && (
            <Badge variant="secondary" className="uppercase text-xs">
              {String(job.status).replace(/_/g, " ")}
            </Badge>
          )}
        </div>
      </header>

      {/* Primary: your report(s). Hero passes an onNavigateTab noop —
          JobSheet below is always mounted so the fill-online event has
          its listener (JobSheetTemplates) in the DOM. */}
      <EngineerJobHero
        jobId={jobId}
        jobOrgId={job?.org_id}
        isRemedial={!!job?.is_remedial}
        onNavigateTab={() => { /* no tabs in engineer view */ }}
      />

      {/* Hidden mount so the `job-sheet:fill-online` listener exists.
          JobSheetTemplates renders its dialog on document.body via Radix
          Portal, so keeping the list itself out of view is safe. */}
      <div className="sr-only" aria-hidden>
        <Suspense fallback={null}>
          <JobSheet jobId={jobId} job={job} />
        </Suspense>
      </div>

      {/* RAMS — a job can carry several (one per work type); read & sign each */}
      <Suspense fallback={<Fallback />}>
        <JobRamsPanel jobId={jobId} job={job} showSignActions />
      </Suspense>

      {/* Site documents — RAMS PDFs, access notes, previous reports */}
      <section className="rounded-2xl border bg-card p-4 md:p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Site documents</h2>
          <Suspense fallback={null}><ScanDocumentButton jobId={jobId} /></Suspense>
        </div>
        <div className="mb-4">
          <Suspense fallback={null}>
            <ScanPaperReportButton
              jobId={jobId}
              prominent
              onSaved={() => {
                setDocsKey((k) => k + 1);
                // Scroll to the hero so the engineer sees the newly saved
                // digital report card there.
                setTimeout(() => {
                  const hero = document.getElementById("engineer-job-hero");
                  if (hero) hero.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 300);
              }}
            />
          </Suspense>
          <p className="mt-1.5 text-xs text-muted-foreground text-center">
            Photograph a completed paper sheet — it's filed on this job and read into a digital report.
          </p>
        </div>
        <ScanReportCards jobId={jobId} />
        <Suspense fallback={<Fallback />}>
          <JobDocuments key={docsKey} jobId={jobId} job={job} engineers={engineers} />
        </Suspense>
      </section>


      {/* Materials used — free-typed name + qty, no costs needed */}
      <section className="rounded-2xl border bg-card p-4 md:p-5 shadow-sm">
        <h2 className="text-base font-semibold mb-1">Parts &amp; materials used</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Just type what you used and how many — no prices needed.
        </p>
        <Suspense fallback={<Fallback />}>
          <QuickPartsList jobId={jobId} canEdit={job?.status !== "cancelled" && isAssignedEngineer} />
        </Suspense>
      </section>

      {/* Defects — scoped to this job/site */}
      <section className="rounded-2xl border bg-card p-4 md:p-5 shadow-sm">
        <h2 className="text-base font-semibold mb-3">Defects on this job</h2>
        <Suspense fallback={<Fallback />}>
          <JobDefects jobId={jobId} siteId={job?.site_id || null} />
        </Suspense>
      </section>


      {/* Photos — add / view */}
      <section className="rounded-2xl border bg-card p-4 md:p-5 shadow-sm">
        <h2 className="text-base font-semibold mb-3">Photos</h2>
        <Suspense fallback={<Fallback />}>
          <JobPhotos
            jobId={jobId}
            jobRef={job?.reference_number || undefined}
            siteId={(job as any)?.site_id || null}

            engineers={engineers}
            isAdmin={false}
            simpleFilters
            canUpload={job?.status !== "cancelled" && isAssignedEngineer}
          />

        </Suspense>
      </section>
    </div>
  );
}
