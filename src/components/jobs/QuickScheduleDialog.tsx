import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays } from "lucide-react";

interface QuickScheduleDialogProps {
  job: { id: string; name: string; reference_number: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduled?: () => void;
}

export default function QuickScheduleDialog({ job, open, onOpenChange, onScheduled }: QuickScheduleDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [engineers, setEngineers] = useState<{ user_id: string; full_name: string }[]>([]);
  const [engineerId, setEngineerId] = useState("");
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("profiles")
      .select("user_id, full_name")
      .then(({ data: profiles }) => {
        if (!profiles) return;
        // Filter to engineers only
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

    // Assign engineer to job if not already
    const { data: existing } = await supabase
      .from("job_assignments")
      .select("id")
      .eq("job_id", job.id)
      .eq("engineer_id", engineerId)
      .maybeSingle();

    if (!existing) {
      await supabase.from("job_assignments").insert({ job_id: job.id, engineer_id: engineerId });
    }

    // Add to job_schedule (planner)
    const { error } = await supabase.from("job_schedule").insert({
      job_id: job.id,
      engineer_id: engineerId,
      schedule_date: scheduleDate,
      created_by: user.id,
    } as any);

    // Update job status to scheduled
    await supabase.from("jobs").update({ status: "scheduled" } as any).eq("id", job.id);

    setLoading(false);
    if (error) {
      toast({ title: "Error", description: "Failed to schedule job.", variant: "destructive" });
    } else {
      toast({ title: "Job scheduled", description: `${job.reference_number} added to planner.` });
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
          <Button type="submit" className="w-full" disabled={loading || !engineerId}>
            {loading ? "Scheduling..." : "Add to Planner"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
