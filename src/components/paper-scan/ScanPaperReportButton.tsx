import { lazy, Suspense, useRef, useState } from "react";
import { FileScan, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

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
 *
 * Mobile (prominent) flow: the camera input lives HERE, on the job page,
 * outside any dialog. The native camera app can background, evict or reload
 * the browser — with no dialog mounted there is no state to lose. The dialog
 * only opens AFTER the photo is back, with the files passed in pre-loaded.
 */
export default function ScanPaperReportButton({
  jobId,
  onSaved,
  prominent = false,
  className,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Files captured BEFORE the dialog opens — passed as initialFiles prop.
  const [capturedFiles, setCapturedFiles] = useState<File[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleOpen = () => {
    if (prominent) {
      // Engineer (mobile) flow: open the camera directly, THEN open the dialog.
      // This avoids the Radix Dialog vs native camera backgrounding issue.
      cameraRef.current?.click();
    } else {
      // Office/desktop flow: open the dialog with its full upload UI.
      setLoading(true);
      setCapturedFiles([]);
      setOpen(true);
    }
  };

  const handleCameraReturn = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (picked.length === 0) {
      toast({
        title: "No photo received",
        description: "The camera didn't return a picture. Please try again.",
        variant: "destructive",
      });
      return;
    }
    // NOW open the dialog with the captured files — the camera is already
    // closed, so the browser is fully in the foreground and state is stable.
    setLoading(true);
    setCapturedFiles(picked);
    setOpen(true);
  };

  return (
    <>
      {/* Hidden camera input — lives OUTSIDE the dialog so it survives the
          camera app backgrounding the browser. */}
      {prominent && (
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={handleCameraReturn}
        />
      )}
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
              if (!next) {
                setLoading(false);
                setCapturedFiles([]);
              }
            }}
            onReady={() => setLoading(false)}
            onSaved={onSaved}
            initialFiles={capturedFiles}
          />
        </Suspense>
      )}
    </>
  );
}
