import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { GripVertical, X } from "lucide-react";

interface CompactVisitRowProps {
  refNumber: string;
  jobId: string;
  title: string;
  postcode?: string | null;
  siteName?: string | null;
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
 * Single-line visit row used in compact day cells and mobile day lists.
 * Shows: [priority stripe] [status dot] [time?] ref · site/name · postcode
 */
export default function CompactVisitRow({
  refNumber,
  jobId,
  title,
  postcode,
  siteName,
  priority = "low",
  status,
  time,
  dragHandleProps,
  onRemove,
  onClick,
  className,
}: CompactVisitRowProps) {
  const label = siteName || title;
  return (
    <div
      className={cn(
        "group relative flex items-center gap-1.5 rounded-sm bg-card border border-border/60 pl-2 pr-1 py-1 text-[11px] leading-tight hover:bg-muted/50 transition-colors",
        "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:rounded-l-sm",
        PRIORITY_BAR[priority] || "before:bg-muted",
        className
      )}
      onClick={onClick}
    >
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
      <span className="truncate text-foreground min-w-0 flex-1">{label}</span>
      {postcode && <span className="font-mono text-[10px] text-muted-foreground shrink-0">{postcode}</span>}
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
  );
}
