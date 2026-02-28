import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye, Gauge } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { addMonths, format } from "date-fns";

interface ScheduleFollowUpJobsProps {
  sourceJob: any;
  mode?: "inline";
  onCreated?: () => void;
}

type FollowUpType = "visual" | "pressure_test";

export default function ScheduleFollowUpJobs({ sourceJob, onCreated }: ScheduleFollowUpJobsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [followUpType, setFollowUpType] = useState<FollowUpType>("visual");
  const [loading, setLoading] = useState(false);
  const [baseDate, setBaseDate] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");

  const resolveBaseDate = async (): Promise<string> => {
    const { data: visits } = await supabase
      .from("job_visits")
      .select("scheduled_date, completed_at")
      .eq("job_id", sourceJob.id)
      .order("scheduled_date", { ascending: false })
      .limit(1);
    if (visits && visits.length > 0) {
      const v = visits[0];
      return v.completed_at ? v.completed_at.split("T")[0] : v.scheduled_date;
    }
    return format(new Date(), "yyyy-MM-dd");
  };

  const handleOpen = async (type: FollowUpType) => {
    setFollowUpType(type);
    const resolved = await resolveBaseDate();
    setBaseDate(resolved);
    const months = type === "visual" ? 6 : 12;
    setScheduledDate(format(addMonths(new Date(resolved), months), "yyyy-MM-dd"));
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!scheduledDate) return;
    setLoading(true);

    const isVisual = followUpType === "visual";
    const jobName = `${isVisual ? "6m Visual" : "12m Pressure Test"} – ${sourceJob.name}`;

    const { data: newJob, error } = await supabase
      .from("jobs")
      .insert({
        name: jobName,
        customer_id: sourceJob.customer_id || null,
        customer: sourceJob.customers?.name || sourceJob.customer || null,
        address: sourceJob.address || null,
        site_id: sourceJob.site_id || null,
        priority: sourceJob.priority || "medium",
        category: sourceJob.category || "general",
        fault_code_id: sourceJob.fault_code_id || null,
        created_by: user?.id,
        visual_qty: isVisual ? (sourceJob.visual_qty || 1) : 0,
        pressure_test_qty: isVisual ? 0 : (sourceJob.pressure_test_qty || 1),
      } as any)
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to create follow-up job.", variant: "destructive" });
      setLoading(false);
      return;
    }

    if (newJob) {
      const { data: assignments } = await supabase
        .from("job_assignments")
        .select("engineer_id")
        .eq("job_id", sourceJob.id);
      if (assignments && assignments.length > 0) {
        await supabase.from("job_assignments").insert(
          assignments.map((a) => ({ job_id: newJob.id, engineer_id: a.engineer_id })) as any
        );
      }

      await supabase.from("job_visits").insert({
        job_id: newJob.id,
        scheduled_date: scheduledDate,
        status: "upcoming",
      } as any);
    }

    toast({
      title: "Follow-up job created",
      description: `${isVisual ? "Visual (6m)" : "Pressure Test (12m)"} scheduled for ${scheduledDate}`,
    });
    setDialogOpen(false);
    setLoading(false);
    onCreated?.();
    if (newJob) navigate(`/jobs/${newJob.id}`);
  };

  const monthsLabel = followUpType === "visual" ? "6 months" : "12 months";
  const typeLabel = followUpType === "visual" ? "Visual Inspection" : "Pressure Test";

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => handleOpen("visual")}>
          <Eye className="mr-1.5 h-3.5 w-3.5" /> Schedule Visual (6m)
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleOpen("pressure_test")}>
          <Gauge className="mr-1.5 h-3.5 w-3.5" /> Schedule PT (12m)
        </Button>
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule {typeLabel}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            Creates a new <strong>{typeLabel.toLowerCase()}</strong> job from{" "}
            <strong>{sourceJob.reference_number}</strong>, scheduled {monthsLabel} from the last service date.
          </p>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Service Completion Date</Label>
              <Input type="date" value={baseDate} onChange={(e) => {
                setBaseDate(e.target.value);
                const months = followUpType === "visual" ? 6 : 12;
                if (e.target.value) {
                  setScheduledDate(format(addMonths(new Date(e.target.value), months), "yyyy-MM-dd"));
                }
              }} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Scheduled Date ({monthsLabel} later)</Label>
              <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="mt-1" />
            </div>
          </div>
          <Button className="w-full mt-2" disabled={loading || !scheduledDate} onClick={handleCreate}>
            {loading ? "Creating..." : `Create ${typeLabel} Job`}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
