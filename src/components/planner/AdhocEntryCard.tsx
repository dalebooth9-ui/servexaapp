import { cn } from "@/lib/utils";
import { Briefcase, X } from "lucide-react";

interface AdhocEntry {
  id: string;
  engineer_id: string;
  schedule_date: string;
  company_name: string;
  description: string | null;
}

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
    <div
      className={cn(
        "group relative rounded-md border-l-4 border-l-violet-500 bg-violet-500/5 p-1.5 text-[11px] shadow-sm"
      )}
    >
      <div className="flex items-start gap-1">
        <Briefcase className="h-3 w-3 mt-0.5 shrink-0 text-violet-500" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-violet-700 dark:text-violet-400 truncate">
            Labour Only
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
