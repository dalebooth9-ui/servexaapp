import { useState, useMemo } from "react";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

interface Engineer {
  user_id: string;
  full_name: string;
}

interface Job {
  id: string;
  name: string;
  reference_number: string;
}

interface MultiDayScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  engineers: Engineer[];
  initialWeekStart: Date;
  onConfirm: (jobId: string, engineerId: string, dates: string[]) => Promise<void>;
}

export default function MultiDayScheduleDialog({
  open,
  onOpenChange,
  job,
  engineers,
  initialWeekStart,
  onConfirm,
}: MultiDayScheduleDialogProps) {
  const [engineerId, setEngineerId] = useState("");
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const toggleDate = (dateStr: string) => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!job || !engineerId || selectedDates.size === 0) return;
    setSaving(true);
    try {
      await onConfirm(job.id, engineerId, Array.from(selectedDates));
      setSelectedDates(new Set());
      setEngineerId("");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setSelectedDates(new Set());
    setEngineerId("");
    onOpenChange(false);
  };

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            Schedule Multiple Days
          </DialogTitle>
        </DialogHeader>

        {/* Job info */}
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-mono text-primary text-xs mr-1.5">{job.reference_number}</span>
          <span className="font-medium">{job.name}</span>
        </div>

        <div className="space-y-4">
          {/* Engineer */}
          <div className="space-y-2">
            <Label>Engineer</Label>
            <Select value={engineerId} onValueChange={setEngineerId}>
              <SelectTrigger><SelectValue placeholder="Select engineer..." /></SelectTrigger>
              <SelectContent>
                {engineers.map((e) => (
                  <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Week day picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Select Days ({selectedDates.size} selected)</Label>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setWeekStart((d) => addDays(d, -7))}
                  className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs text-muted-foreground min-w-[90px] text-center">
                  {format(weekStart, "dd MMM")} – {format(addDays(weekStart, 6), "dd MMM")}
                </span>
                <button
                  onClick={() => setWeekStart((d) => addDays(d, 7))}
                  className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const isSelected = selectedDates.has(dateStr);
                const isToday = isSameDay(day, new Date());
                return (
                  <button
                    key={dateStr}
                    onClick={() => toggleDate(dateStr)}
                    className={cn(
                      "flex flex-col items-center rounded-md py-2 px-1 text-xs transition-colors border",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary"
                        : isToday
                          ? "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
                          : "border-border bg-card text-foreground hover:bg-muted"
                    )}
                  >
                    <span className="text-[10px] font-medium opacity-70">{format(day, "EEE")}</span>
                    <span className="font-semibold">{format(day, "d")}</span>
                  </button>
                );
              })}
            </div>

            {/* Quick select buttons */}
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => {
                  const weekdayDates = weekDays
                    .filter((d) => d.getDay() !== 0 && d.getDay() !== 6)
                    .map((d) => format(d, "yyyy-MM-dd"));
                  setSelectedDates((prev) => {
                    const next = new Set(prev);
                    weekdayDates.forEach((d) => next.add(d));
                    return next;
                  });
                }}
                className="text-[10px] px-2 py-0.5 rounded border border-border bg-card hover:bg-muted text-muted-foreground transition-colors"
              >
                + Mon–Fri
              </button>
              <button
                onClick={() => setSelectedDates(new Set())}
                className="text-[10px] px-2 py-0.5 rounded border border-border bg-card hover:bg-muted text-muted-foreground transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          <Button
            onClick={handleConfirm}
            className="w-full"
            disabled={!engineerId || selectedDates.size === 0 || saving}
          >
            {saving ? "Scheduling..." : `Schedule ${selectedDates.size} Day${selectedDates.size !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
