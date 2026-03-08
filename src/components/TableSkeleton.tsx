import { Skeleton } from "@/components/ui/skeleton";

interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  showHeader?: boolean;
}

export default function TableSkeleton({ rows = 6, cols = 5, showHeader = true }: TableSkeletonProps) {
  return (
    <div className="w-full space-y-3">
      {showHeader && (
        <div className="flex items-center gap-3 pb-1">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-4" style={{ width: `${[20, 30, 25, 15, 10][i % 5]}%` }} />
          ))}
        </div>
      )}
      <div className="rounded-lg border overflow-hidden">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div
            key={rowIdx}
            className="flex items-center gap-3 border-b last:border-b-0 px-4 py-3"
          >
            {Array.from({ length: cols }).map((_, colIdx) => (
              <Skeleton
                key={colIdx}
                className="h-4 shrink-0"
                style={{ width: `${[25, 35, 20, 12, 8][colIdx % 5]}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A card-grid skeleton for dashboard-style views */
export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-5 flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
