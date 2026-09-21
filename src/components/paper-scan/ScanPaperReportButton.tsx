import { lazy, Suspense, useState } from "react";
import { FileScan, Loader2 } from "lucide-react";
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
  const [loading, setLoading] = useState(false);

  const handleOpen = () => {
    // The dialog is code-split: on a slow site connection the chunk can take a
    // few seconds, and without this the tap looked like nothing happened.
    setLoading(true);
    setOpen(true);
  };

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
        onClick={handleOpen}
        disabled={!user || loading}
      >
        {loading ? (
          <Loader2
            className={`animate-spin ${prominent ? "h-5 w-5" : "h-3.5 w-3.5"}`}
          />
        ) : (
          <FileScan className={prominent ? "h-5 w-5" : "h-3.5 w-3.5"} />
        )}
        {loading ? "Opening scanner…" : "Scan Paper Report"}
      </Button>
      {open && user && (
        <Suspense fallback={null}>
          <JobScanReportDialog
            jobId={jobId}
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) setLoading(false);
            }}
            onReady={() => setLoading(false)}
            onSaved={onSaved}
          />
        </Suspense>
      )}
    </>
  );
}
