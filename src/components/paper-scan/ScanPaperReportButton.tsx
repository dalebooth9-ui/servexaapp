import { lazy, Suspense, useState } from "react";
import { FileScan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const JobScanReportDialog = lazy(
  () => import("@/components/paper-scan/JobScanReportDialog"),
);

type Props = {
  jobId: string;
  onSaved?: () => void;
  /** Big full-width call to action — used on the engineer (mobile) job view. */
  prominent?: boolean;
  className?: string;
};

/**
 * Opens the job-scoped paper report scanner. Available to engineers as well as
 * office staff — the whole point is capturing the sheet while still on site.
 */
export default function ScanPaperReportButton({
  jobId,
  onSaved,
  prominent = false,
  className,
}: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={prominent ? "default" : "outline"}
        size={prominent ? "lg" : "sm"}
        className={
          prominent
            ? `w-full h-14 gap-2 text-base font-semibold ${className || ""}`
            : `gap-1.5 text-xs ${className || ""}`
        }
        onClick={() => setOpen(true)}
        disabled={!user}
      >
        <FileScan className={prominent ? "h-5 w-5" : "h-3.5 w-3.5"} />
        Scan Paper Report
      </Button>
      {open && user && (
        <Suspense fallback={null}>
          <JobScanReportDialog
            jobId={jobId}
            open={open}
            onOpenChange={setOpen}
            onSaved={onSaved}
          />
        </Suspense>
      )}
    </>
  );
}
