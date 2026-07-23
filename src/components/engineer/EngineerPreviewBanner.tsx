import { Eye, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

/**
 * Persistent banner shown while an admin is previewing the Engineer view.
 * One-tap exit — no way to get stuck.
 */
export default function EngineerPreviewBanner() {
  const { isPreviewingAsEngineer, previewEngineerName, exitEngineerPreview } = useAuth();
  if (!isPreviewingAsEngineer) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-[hsl(25,95%,53%)] text-white px-3 py-2 shadow-md text-sm md:text-base"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="truncate font-semibold">
          Viewing as Engineer{previewEngineerName ? ` — ${previewEngineerName}` : ""}
        </span>
        <span className="hidden sm:inline text-white/80 text-xs">
          (admin actions still recorded under your account)
        </span>
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={exitEngineerPreview}
        className="h-8 min-h-[44px] sm:min-h-0 shrink-0 bg-white text-[hsl(25,95%,30%)] hover:bg-white/90 font-semibold"
      >
        <X className="h-4 w-4 mr-1" /> Exit preview
      </Button>
    </div>
  );
}
