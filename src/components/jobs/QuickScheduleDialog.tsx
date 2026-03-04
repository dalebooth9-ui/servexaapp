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
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

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

export default function QuickScheduleDialog({ job, open, onOpenChange, onScheduled }: QuickScheduleDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [engineers, setEngineers] = useState<{ user_id: string; full_name: string }[]>([]);
  const [engineerId, setEngineerId] = useState("");
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [notesColor, setNotesColor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
  }, [open]);

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
                {engineers.map((e) => (
                  <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} required />
          </div>
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
