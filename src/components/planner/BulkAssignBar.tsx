import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { X } from "lucide-react";
import { UKDateInput } from "@/components/ui/uk-date-input";

interface Engineer { user_id: string; full_name: string }

export default function BulkAssignBar({
  count,
  engineers,
  defaultDate,
  onAssign,
  onClear,
}: {
  count: number;
  engineers: Engineer[];
  defaultDate?: string;
  onAssign: (engineerId: string, date: string) => Promise<void>;
  onClear: () => void;
}) {
  const [engineerId, setEngineerId] = useState<string>("");
  const [date, setDate] = useState<string>(defaultDate || format(new Date(), "yyyy-MM-dd"));
  const [busy, setBusy] = useState(false);

  return (
    <div className="sticky bottom-0 z-30 mt-2 rounded-md border border-primary/40 bg-background/95 backdrop-blur p-2 shadow-lg">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold text-primary">{count} selected</span>
        <button
          onClick={onClear}
          className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          title="Clear selection"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-1.5">
        <Select value={engineerId} onValueChange={setEngineerId}>
          <SelectTrigger className="h-7 text-[11px]">
            <SelectValue placeholder="Engineer…" />
          </SelectTrigger>
          <SelectContent>
            {engineers.map((e) => (
              <SelectItem key={e.user_id} value={e.user_id} className="text-xs">{e.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <UKDateInput
          
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-7 text-[11px]"
        />
        <Button
          size="sm"
          className="w-full h-7 text-[11px]"
          disabled={!engineerId || !date || busy || count === 0}
          onClick={async () => {
            if (count === 0) return;
            setBusy(true);
            try { await onAssign(engineerId, date); } finally { setBusy(false); }
          }}
        >
          {busy ? "Assigning…" : count === 0 ? "Assign to engineer" : `Assign ${count} to engineer`}
        </Button>
        {count === 0 && (
          <p className="text-[10px] text-muted-foreground text-center leading-tight">
            Tick jobs above to assign
          </p>
        )}
      </div>
    </div>
  );
}
