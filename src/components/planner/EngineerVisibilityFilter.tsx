import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

interface Engineer {
  user_id: string;
  full_name: string;
}

interface Props {
  engineers: Engineer[];
  /** Set of engineer user_ids currently HIDDEN from the planner view. */
  hidden: Set<string>;
  onChange: (next: Set<string>) => void;
}

/**
 * Per-user planner view filter. Distinct from the global `show_on_planner`
 * profile flag: this only hides rows in the current user's planner UI, it
 * does not change assignability or affect anyone else.
 */
export default function EngineerVisibilityFilter({ engineers, hidden, onChange }: Props) {
  const total = engineers.length;
  const visibleCount = useMemo(
    () => engineers.filter((e) => !hidden.has(e.user_id)).length,
    [engineers, hidden],
  );
  const filterActive = hidden.size > 0 && visibleCount < total;

  const toggle = (id: string) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  const selectAll = () => onChange(new Set());
  const clearAll = () => onChange(new Set(engineers.map((e) => e.user_id)));

  return (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "gap-1.5",
              filterActive && "border-primary/50 bg-primary/5 text-primary",
            )}
          >
            {filterActive ? <Filter className="h-4 w-4" /> : <Users className="h-4 w-4" />}
            Engineers
            <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold">
              {visibleCount}/{total}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-xs font-semibold text-muted-foreground">Show on planner</p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={selectAll}
                className="text-[10px] font-medium text-primary hover:underline"
              >
                Select all
              </button>
              <span className="text-[10px] text-muted-foreground">·</span>
              <button
                type="button"
                onClick={clearAll}
                className="text-[10px] font-medium text-muted-foreground hover:text-destructive"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto space-y-0.5">
            {engineers.length === 0 && (
              <p className="text-xs text-muted-foreground p-2">No engineers.</p>
            )}
            {engineers.map((e) => {
              const shown = !hidden.has(e.user_id);
              return (
                <label
                  key={e.user_id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox checked={shown} onCheckedChange={() => toggle(e.user_id)} />
                  <span className="truncate">{e.full_name}</span>
                </label>
              );
            })}
          </div>
          <p className="mt-2 border-t pt-2 px-1 text-[10px] text-muted-foreground leading-tight">
            View filter only — hidden engineers stay assignable and their jobs are unaffected.
          </p>
        </PopoverContent>
      </Popover>

      {filterActive && (
        <button
          type="button"
          onClick={selectAll}
          className="text-[11px] text-muted-foreground hover:text-foreground underline decoration-dotted"
        >
          Showing {visibleCount} of {total} engineers — clear
        </button>
      )}
    </div>
  );
}
