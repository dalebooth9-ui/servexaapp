import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, AlertTriangle, Palmtree } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";

interface BankHoliday {
  date: string;
  name: string;
}

interface QuickScheduleDialogProps {
  job: { id: string; name: string; reference_number: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduled?: () => void;
}

const NOTE_COLORS = [
  { value: null,      label: "Default",  swatch: "bg-foreground/10 border border-border" },
  { value: "#ef4444", label: "Red",      swatch: "bg-red-500" },
  { value: "#f97316", label: "Orange",   swatch: "bg-orange-500" },
  { value: "#eab308", label: "Yellow",   swatch: "bg-yellow-400" },
  { value: "#22c55e", label: "Green",    swatch: "bg-green-500" },
  { value: "#3b82f6", label: "Blue",     swatch: "bg-blue-500" },
  { value: "#a855f7", label: "Purple",   swatch: "bg-purple-500" },
];

interface LeaveEntry {
  id: string;
  engineer_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
}

export default function QuickScheduleDialog({ job, open, onOpenChange, onScheduled }: QuickScheduleDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [engineers, setEngineers] = useState<{ user_id: string; full_name: string }[]>([]);
  const [engineerId, setEngineerId] = useState("");
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [notesColor, setNotesColor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [leaveEntries, setLeaveEntries] = useState<LeaveEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("profiles")
      .select("user_id, full_name")
      .then(({ data: profiles }) => {
        if (!profiles) return;
        supabase.from("user_roles").select("user_id").eq("role", "engineer").then(({ data: roles }) => {
          const engIds = new Set((roles || []).map((r) => r.user_id));
          setEngineers(profiles.filter((p) => engIds.has(p.user_id)));
        });
      });
    // Fetch approved leave around the selected date ±30 days
    supabase
      .from("engineer_leave" as any)
      .select("id, engineer_id, leave_type, start_date, end_date, status")
      .eq("status", "approved")
      .then(({ data }) => setLeaveEntries((data as any[] || []) as LeaveEntry[]));
  }, [open]);

  // Check if selected engineer is on leave on the selected date
  const leaveConflict = engineerId && scheduleDate
    ? leaveEntries.find((l) => {
        if (l.engineer_id !== engineerId) return false;
        try {
          const day = startOfDay(parseISO(scheduleDate));
          return isWithinInterval(day, {
            start: startOfDay(parseISO(l.start_date)),
            end: endOfDay(parseISO(l.end_date)),
          });
        } catch { return false; }
      })
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job || !engineerId || !scheduleDate || !user) return;
    setLoading(true);

    const { data: existing } = await supabase
      .from("job_assignments")
      .select("id")
      .eq("job_id", job.id)
      .eq("engineer_id", engineerId)
      .maybeSingle();

    if (!existing) {
      await supabase.from("job_assignments").insert({ job_id: job.id, engineer_id: engineerId });
    }

    const { error } = await supabase.from("job_schedule").insert({
      job_id: job.id,
      engineer_id: engineerId,
      schedule_date: scheduleDate,
      notes: notes.trim() || null,
      notes_color: notesColor,
      created_by: user.id,
    } as any);

    await supabase.from("jobs").update({ status: "scheduled" } as any).eq("id", job.id);

    setLoading(false);
    if (error) {
      toast({ title: "Error", description: "Failed to schedule job.", variant: "destructive" });
    } else {
      toast({ title: "Job scheduled", description: `${job.reference_number} added to planner.` });
      setNotes("");
      setNotesColor(null);
      onOpenChange(false);
      onScheduled?.();
    }
  };

  const LEAVE_LABELS: Record<string, string> = {
    holiday: "Holiday",
    sick: "Sick Leave",
    bank_holiday: "Bank Holiday",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            Schedule Job
          </DialogTitle>
        </DialogHeader>
        {job && (
          <p className="text-sm text-muted-foreground mb-1">
            <span className="font-mono font-medium text-foreground">{job.reference_number}</span> — {job.name}
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Engineer</Label>
            <Select value={engineerId} onValueChange={setEngineerId} required>
              <SelectTrigger>
                <SelectValue placeholder="Select engineer" />
              </SelectTrigger>
              <SelectContent>
                {engineers.map((e) => {
                  const onLeave = scheduleDate
                    ? leaveEntries.some((l) => {
                        if (l.engineer_id !== e.user_id) return false;
                        try {
                          return isWithinInterval(startOfDay(parseISO(scheduleDate)), {
                            start: startOfDay(parseISO(l.start_date)),
                            end: endOfDay(parseISO(l.end_date)),
                          });
                        } catch { return false; }
                      })
                    : false;
                  return (
                    <SelectItem key={e.user_id} value={e.user_id}>
                      <span className="flex items-center gap-1.5">
                        {onLeave && <Palmtree className="h-3 w-3 text-amber-500 shrink-0" />}
                        {e.full_name}
                        {onLeave && <span className="text-amber-600 text-xs">(on leave)</span>}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} required />
          </div>

          {/* Leave conflict warning */}
          {leaveConflict && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                This engineer has <strong>{LEAVE_LABELS[leaveConflict.leave_type] || leaveConflict.leave_type}</strong> booked on this date. You can still schedule but they may be unavailable.
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              placeholder="e.g. Ring John before arriving"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="resize-none"
              style={notesColor ? { color: notesColor } : undefined}
            />
            {notes && (
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-xs text-muted-foreground mr-1">Highlight:</span>
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    title={c.label}
                    onClick={() => setNotesColor(c.value)}
                    className={cn(
                      "h-5 w-5 rounded-full transition-transform",
                      c.swatch,
                      notesColor === c.value && "ring-2 ring-offset-1 ring-foreground scale-110"
                    )}
                  />
                ))}
              </div>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={loading || !engineerId}>
            {loading ? "Scheduling..." : "Add to Planner"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
