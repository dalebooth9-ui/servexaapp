import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

export default function CloneJobDialog({ sourceJob }: { sourceJob: any }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", reference_number: "" });
  const [loading, setLoading] = useState(false);

  const handleOpen = () => {
    setForm({
      name: sourceJob.name + " (copy)",
      reference_number: "",
    });
    setOpen(true);
  };

  const handleClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setLoading(true);

    const { data: newJob, error } = await supabase.from("jobs").insert({
      name: form.name.trim(),
      ...(form.reference_number.trim() ? { reference_number: form.reference_number.trim() } : {}),
      customer_id: sourceJob.customer_id || null,
      customer: sourceJob.customers?.name || sourceJob.customer || null,
      address: sourceJob.address || null,
      priority: sourceJob.priority || "medium",
      category: sourceJob.category || "general",
      fault_code_id: sourceJob.fault_code_id || null,
      created_by: user?.id,
    } as any).select().single();

    if (error) {
      const msg = error.code === "23505" ? "A job with this reference number already exists." : "Failed to clone job.";
      toast({ title: "Error", description: msg, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Clone assignments
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

      // Clone visits if recurring
      if (sourceJob.job_type === "recurring") {
        const { data: visits } = await supabase
          .from("job_visits")
          .select("scheduled_date, scheduled_time, engineer_id, notes, status")
          .eq("job_id", sourceJob.id);
        if (visits && visits.length > 0) {
          await supabase.from("job_visits").insert(
            visits.map((v: any) => ({ ...v, job_id: newJob.id })) as any
          );
        }
      }
    }

    toast({ title: "Job cloned", description: `Created ${form.name}` });
    setOpen(false);
    setLoading(false);
    if (newJob) navigate(`/jobs/${newJob.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" onClick={handleOpen}>
          <Copy className="mr-1.5 h-3.5 w-3.5" /> Clone Job
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Clone from Previous Job</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground mb-2">
          Creates a new job with the same customer, address, priority, category, fault code, and engineer assignments as <strong>{sourceJob.reference_number}</strong>.
        </p>
        <form onSubmit={handleClone} className="space-y-4">
          <div className="space-y-2">
            <Label>New Job Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label>New Reference Number <span className="text-muted-foreground text-xs font-normal">(auto-generated if left blank)</span></Label>
            <Input value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} placeholder="Auto: VFP-00001" />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Cloning..." : "Clone Job"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
