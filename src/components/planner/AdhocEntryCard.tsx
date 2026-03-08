import { cn } from "@/lib/utils";
import { Briefcase, X } from "lucide-react";
import type { AdhocEntry } from "@/pages/WeeklyPlanner";

export default function AdhocEntryCard({
  entry,
  isAdmin,
  onRemove,
}: {
  entry: AdhocEntry;
  isAdmin: boolean;
  onRemove?: (id: string) => void;
}) {
  return (
    <div className="group relative rounded-md border-l-4 border-l-[hsl(var(--chart-3))] bg-[hsl(var(--chart-3)/0.07)] p-1.5 text-[11px] shadow-sm">
      <div className="flex items-start gap-1">
        <Briefcase className="h-3 w-3 mt-0.5 shrink-0 text-[hsl(var(--chart-3))]" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[10px] uppercase tracking-wide text-[hsl(var(--chart-3))] leading-none mb-0.5 flex items-center gap-1">
            Labour
            {entry.allocated_days > 1 && (
              <span className="font-mono bg-[hsl(var(--chart-3)/0.15)] rounded px-1">{entry.allocated_days}d</span>
            )}
          </div>
          <div className="truncate text-foreground font-medium">{entry.company_name}</div>
          {entry.description && (
            <div className="truncate text-muted-foreground text-[10px]">{entry.description}</div>
          )}
        </div>
        {isAdmin && onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }}
            className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
