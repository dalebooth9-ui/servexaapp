import { cn } from "@/lib/utils";

const STATUSES = [
  { value: "pending_review", label: "Pending Review", color: "bg-yellow-500" },
  { value: "active", label: "Active", color: "bg-blue-500" },
  { value: "in_progress", label: "In Progress", color: "bg-indigo-500" },
  { value: "awaiting_parts", label: "Awaiting Parts", color: "bg-amber-500" },
  { value: "on_hold", label: "On Hold", color: "bg-orange-500" },
  { value: "requires_revisit", label: "Requires Revisit", color: "bg-purple-500" },
  { value: "scheduled", label: "Scheduled", color: "bg-cyan-500" },
  { value: "completed", label: "Completed", color: "bg-green-500" },
  { value: "archived", label: "Archived", color: "bg-muted-foreground" },
];

export function getStatusColor(status: string) {
  const s = STATUSES.find((st) => st.value === status);
  return s?.color || "bg-muted-foreground";
}

export function getStatusLabel(status: string) {
  const s = STATUSES.find((st) => st.value === status);
  return s?.label || status;
}

export const ALL_JOB_STATUSES = STATUSES;

export default function JobStatusPipeline({ currentStatus, onChange }: { currentStatus: string; onChange?: (status: string) => void }) {
  const currentIndex = STATUSES.findIndex((s) => s.value === currentStatus);

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {STATUSES.map((status, i) => {
        const isActive = status.value === currentStatus;
        const isPast = i < currentIndex;
        return (
          <button
            key={status.value}
            onClick={() => onChange?.(status.value)}
            disabled={!onChange}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all whitespace-nowrap",
              isActive
                ? `${status.color} text-white shadow-sm`
                : isPast
                  ? "bg-muted text-muted-foreground"
                  : "bg-muted/50 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", isActive ? "bg-white" : isPast ? "bg-muted-foreground/50" : "bg-muted-foreground/30")} />
            {status.label}
          </button>
        );
      })}
    </div>
  );
}
