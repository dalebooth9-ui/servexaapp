import { AlertTriangle, ShieldAlert, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import type { JobRamsStatus } from "@/hooks/useJobRamsStatus";

interface Props {
  jobId: string;
  status: JobRamsStatus;
}

/**
 * Amber warning banner shown on the job page when the category demands a
 * RAMS document but none is attached, or when attached RAMS documents are
 * unsigned. Mirrors the JobTemplateMismatchBanner visual family.
 */
export default function RamsRequiredBanner({ jobId, status }: Props) {
  if (status.loading) return null;

  const noneAttached = status.required && status.ramsCount === 0;
  const attachedUnsigned = status.ramsCount > 0 && status.totalSignoffs === 0 && status.required;

  if (!noneAttached && !attachedUnsigned) return null;

  const title = noneAttached ? "RAMS required — none attached" : "RAMS attached but unsigned";
  const detail = noneAttached
    ? `Jobs in the "${status.categoryName || "this"}" category must have a Risk Assessment & Method Statement before work begins.`
    : `An engineer must read and sign the RAMS on their mobile job screen before starting work.`;

  return (
    <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-4 space-y-3">
      <div className="flex items-start gap-2">
        {noneAttached ? (
          <ShieldAlert className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-sm text-muted-foreground mt-1">{detail}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-7">
        {noneAttached && (
          <>
            <Button asChild variant="secondary" size="sm">
              <Link to={`/jobs/${jobId}/rams`}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Create RAMS
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={`/rams/start?jobId=${jobId}`}>
                Start from library
              </Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
