import { lazy, Suspense, useState } from "react";
import { FileScan, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

const JobScanReportDialog = lazy(() => import("@/components/paper-scan/JobScanReportDialog"));
const InlineCamera = lazy(() => import("@/components/paper-scan/InlineCamera"));

type Props = {
  jobId: string;
  onSaved?: () => void;
  /** Big full-width call to action — used on the engineer (mobile) job view. */
  prominent?: boolean;
  className?: string;
};

/**
 * Mobile (prominent) flow uses an in-browser camera (getUserMedia) so the OS
 * never backgrounds/kills the tab. The scan UI opens once pages are captured.
 */
export default function ScanPaperReportButton({ jobId, onSaved, prominent = false, className }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [capturedFiles, setCapturedFiles] = useState<File[]>([]);
  const [showCamera, setShowCamera] = useState(false);

  const handleOpen = () => {
    if (prominent) {
      setShowCamera(true);
    } else {
      setLoading(true);
      setCapturedFiles([]);
      setOpen(true);
    }
  };

  const handleCameraCapture = (files: File[]) => {
    setShowCamera(false);
    if (files.length === 0) {
      toast({
        title: "No photo taken",
        description: "Tap the shutter button to capture the sheet, then tap the tick.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    setCapturedFiles(files);
    setOpen(true);
  };

  return (
    <>
      {showCamera && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[60] bg-foreground flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-background" />
            </div>
          }
        >
          <InlineCamera onCapture={handleCameraCapture} onCancel={() => setShowCamera(false)} />
        </Suspense>
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
          <Loader2 className={`animate-spin ${prominent ? "h-5 w-5" : "h-3.5 w-3.5"}`} />
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
