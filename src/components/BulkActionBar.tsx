import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Sticky bar shown at the bottom of a list view whenever the user has
 * selected one or more rows. Actions are rendered in the order they are
 * passed. Callers own the confirmation dialogs — this component is
 * purely presentational.
 */
export default function BulkActionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="sticky bottom-2 z-30 flex items-center gap-2 rounded-md border bg-background/95 shadow-lg backdrop-blur p-2 flex-wrap">
      <span className="text-sm font-medium px-2">
        {count} selected
      </span>
      <Button
        size="sm"
        variant="ghost"
        onClick={onClear}
        className="h-8 px-2"
      >
        <X className="h-3.5 w-3.5 mr-1" /> Clear
      </Button>
      <div className="ml-auto flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );
}
