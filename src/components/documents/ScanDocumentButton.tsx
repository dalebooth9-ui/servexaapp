import { lazy, Suspense, useState } from "react";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const DocumentScanner = lazy(() => import("@/components/documents/DocumentScanner"));

type Props = {
  jobId: string;
  onSaved?: () => void;
  size?: "sm" | "default";
  variant?: "outline" | "secondary" | "default";
  className?: string;
};

/** Opens the on-site document scanner for a job. */
export default function ScanDocumentButton({ jobId, onSaved, size = "sm", variant = "outline", className }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={`gap-1.5 text-xs ${className || ""}`}
        onClick={() => setOpen(true)}
        disabled={!user}
      >
        <ScanLine className="h-3.5 w-3.5" /> Scan Document
      </Button>
      {open && user && (
        <Suspense fallback={null}>
          <DocumentScanner
            jobId={jobId}
            userId={user.id}
            open={open}
            onClose={() => setOpen(false)}
            onSaved={onSaved}
          />
        </Suspense>
      )}
    </>
  );
}
