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
import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import EngineerJobHero from "@/components/engineer/EngineerJobHero";

const JobDocuments = lazy(() => import("@/components/JobDocuments"));
const JobDefects = lazy(() => import("@/components/jobs/JobDefects"));
const JobPhotos = lazy(() => import("@/components/jobs/JobPhotos"));
const JobSheet = lazy(() => import("@/components/JobSheet"));
const QuickPartsList = lazy(() => import("@/components/jobs/QuickPartsList"));


const Fallback = () => (
  <div className="h-8 w-full animate-pulse rounded bg-muted/40" aria-hidden />
);

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
        <h2 className="text-base font-semibold mb-3">Site documents</h2>
        <Suspense fallback={<Fallback />}>
          <JobDocuments jobId={jobId} job={job} engineers={engineers} />
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
