import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { GripVertical, X } from "lucide-react";
import { JobCardSubtitle } from "@/lib/jobCardLabel";

interface CompactVisitRowProps {
  refNumber: string;
  jobId: string;
  title: string;
  postcode?: string | null;
  siteName?: string | null;
  address?: string | null;
  priority?: string;
  status?: string;
  time?: string | null;
  dragHandleProps?: any;
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
}

const PRIORITY_BAR: Record<string, string> = {
  high: "before:bg-destructive",
  medium: "before:bg-amber-500",
  low: "before:bg-accent",
};

const STATUS_DOT: Record<string, string> = {
  active: "bg-primary",
  in_progress: "bg-primary",
  completed: "bg-green-500",
  archived: "bg-muted-foreground",
  revisit: "bg-orange-500",
};

/**
 * Compact two-line visit row used in day cells and mobile day lists.
 * Line 1: [priority stripe] [status dot] [time?] job name
 * Line 2: reference number · site name/postcode
 */
export default function CompactVisitRow({
  refNumber,
  jobId,
  title,
  postcode,
  siteName,
  address,
  priority = "low",
  status,
  time,
  dragHandleProps,
  onRemove,
  onClick,
  className,
}: CompactVisitRowProps) {
  return (
    <div
      className={cn(
        "group relative flex flex-col gap-0.5 rounded-sm bg-card border border-border/60 pl-2 pr-1 py-1 text-[11px] leading-tight hover:bg-muted/50 transition-colors",
        "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:rounded-l-sm",
        PRIORITY_BAR[priority] || "before:bg-muted",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5">
        {dragHandleProps && (
          <span
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3 w-3" />
          </span>
        )}
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", STATUS_DOT[status ?? ""] || "bg-muted-foreground/40")} />
        {time && <span className="font-mono text-[10px] text-muted-foreground shrink-0">{time}</span>}
        <Link
          to={`/jobs/${jobId}`}
          onClick={(e) => e.stopPropagation()}
          className="font-mono font-medium text-primary hover:underline shrink-0"
        >
          {refNumber}
        </Link>
        <span className="truncate text-foreground min-w-0 flex-1">{title}</span>
        {onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Remove"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="pl-3.5">
        <JobCardSubtitle
          job={{
            id: jobId,
            reference_number: refNumber,
            site: { name: siteName ?? null, postcode: postcode ?? null },
            address: address ?? null,
          }}
          className="text-[10px] text-muted-foreground truncate"
        />
      </div>
    </div>
  );
}
