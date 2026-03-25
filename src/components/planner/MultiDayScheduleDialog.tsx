import { useState, useMemo } from "react";
import { format, addDays, isSameDay, eachDayOfInterval, parseISO } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, CalendarDays, Calendar } from "lucide-react";

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
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"picker" | "range">("picker");

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

  // Compute dates from range inputs
  const rangeDates = useMemo(() => {
    if (!rangeStart || !rangeEnd) return [];
    try {
      const start = parseISO(rangeStart);
      const end = parseISO(rangeEnd);
      if (end < start) return [];
      return eachDayOfInterval({ start, end }).map(d => format(d, "yyyy-MM-dd"));
    } catch {
      return [];
    }
  }, [rangeStart, rangeEnd]);

  const effectiveDates = mode === "range" ? rangeDates : Array.from(selectedDates);

  const handleConfirm = async () => {
    if (!job || !engineerId || effectiveDates.length === 0) return;
    setSaving(true);
    try {
      await onConfirm(job.id, engineerId, effectiveDates);
      setSelectedDates(new Set());
      setEngineerId("");
      setRangeStart("");
      setRangeEnd("");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setSelectedDates(new Set());
    setEngineerId("");
    setRangeStart("");
    setRangeEnd("");
    onOpenChange(false);
  };

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
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

          {/* Mode tabs */}
          <Tabs value={mode} onValueChange={(v) => setMode(v as "picker" | "range")}>
            <TabsList className="w-full">
              <TabsTrigger value="picker" className="flex-1 gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> Day Picker
              </TabsTrigger>
              <TabsTrigger value="range" className="flex-1 gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Date Range
              </TabsTrigger>
            </TabsList>

            {/* Individual day picker */}
            <TabsContent value="picker" className="space-y-3 mt-3">
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
            </TabsContent>

            {/* Date range */}
            <TabsContent value="range" className="space-y-3 mt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Start Date</Label>
                  <Input
                    type="date"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">End Date</Label>
                  <Input
                    type="date"
                    value={rangeEnd}
                    min={rangeStart}
                    onChange={(e) => setRangeEnd(e.target.value)}
                  />
                </div>
              </div>
              {rangeDates.length > 0 && (
                <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-primary font-medium">
                  📅 {rangeDates.length} day{rangeDates.length !== 1 ? "s" : ""} selected
                  {rangeDates.length <= 14 && (
                    <span className="text-muted-foreground font-normal ml-1">
                      ({format(parseISO(rangeDates[0]), "dd MMM")} – {format(parseISO(rangeDates[rangeDates.length - 1]), "dd MMM")})
                    </span>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <Button
            onClick={handleConfirm}
            className="w-full"
            disabled={!engineerId || effectiveDates.length === 0 || saving}
          >
            {saving ? "Scheduling..." : `Schedule ${effectiveDates.length} Day${effectiveDates.length !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
