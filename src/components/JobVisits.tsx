import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarPlus, Check, Clock, AlertTriangle, Ban, Plus, Repeat, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, addWeeks, addMonths } from "date-fns";

type Visit = {
  id: string;
  job_id: string;
  engineer_id: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
};

type Engineer = { user_id: string; full_name: string };

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  upcoming: { icon: <Clock className="h-3 w-3" />, color: "bg-primary/10 text-primary" },
  unscheduled: { icon: <AlertTriangle className="h-3 w-3" />, color: "bg-warning/10 text-warning" },
  overdue: { icon: <AlertTriangle className="h-3 w-3" />, color: "bg-destructive/10 text-destructive" },
  completed: { icon: <Check className="h-3 w-3" />, color: "bg-accent/10 text-accent" },
  cancelled: { icon: <Ban className="h-3 w-3" />, color: "bg-muted text-muted-foreground" },
};

export default function JobVisits({ jobId, jobData }: { jobId: string; jobData?: any }) {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [editVisit, setEditVisit] = useState<Visit | null>(null);
  const [editForm, setEditForm] = useState({ scheduled_date: "", scheduled_time: "", engineer_id: "", notes: "", status: "" });
  const [form, setForm] = useState({ scheduled_date: "", scheduled_time: "", engineer_id: "", notes: "" });
  const [recForm, setRecForm] = useState({ interval: "1", unit: "weeks", start_date: "", end_date: "", engineer_id: "" });
  const [loading, setLoading] = useState(false);

  const isAdmin = userRole === "admin";

  const fetchVisits = async () => {
    const { data } = await supabase
      .from("job_visits")
      .select("*")
      .eq("job_id", jobId)
      .order("scheduled_date", { ascending: true });
    setVisits((data as Visit[]) || []);
  };

  const fetchEngineers = async () => {
    const { data: assignments } = await supabase
      .from("job_assignments")
      .select("engineer_id")
      .eq("job_id", jobId);
    if (!assignments || assignments.length === 0) return;
    const ids = assignments.map((a) => a.engineer_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", ids);
    setEngineers((profiles as Engineer[]) || []);
  };

  useEffect(() => {
    fetchVisits();
    fetchEngineers();
  }, [jobId]);

  const getScopeNotes = () => {
    if (!jobData) return "";
    const parts: string[] = [];
    if (jobData.pressure_test_qty > 0) parts.push(`Pressure Test ×${jobData.pressure_test_qty}`);
    if (jobData.visual_qty > 0) parts.push(`Visual Inspection ×${jobData.visual_qty}`);
    if (jobData.other_qty > 0 && jobData.other_service_type) parts.push(`${jobData.other_service_type} ×${jobData.other_qty}`);
    return parts.join(", ");
  };

  const openEdit = (v: Visit) => {
    setEditVisit(v);
    setEditForm({
      scheduled_date: v.scheduled_date,
      scheduled_time: v.scheduled_time || "",
      engineer_id: v.engineer_id || "",
      notes: v.notes || getScopeNotes(),
      status: v.status,
    });
  };

  const handleEditVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editVisit) return;
    setLoading(true);
    const update: any = {
      scheduled_date: editForm.scheduled_date,
      scheduled_time: editForm.scheduled_time || null,
      engineer_id: editForm.engineer_id || null,
      notes: editForm.notes || null,
      status: editForm.status,
    };
    if (editForm.status === "completed" && editVisit.status !== "completed") {
      update.completed_at = new Date().toISOString();
    } else if (editForm.status !== "completed") {
      update.completed_at = null;
    }
    const { error } = await supabase.from("job_visits").update(update).eq("id", editVisit.id);
    if (error) {
      toast({ title: "Error", description: "Failed to update visit.", variant: "destructive" });
    } else {
      toast({ title: "Visit updated" });
      setEditVisit(null);
      fetchVisits();
    }
    setLoading(false);
  };

  const handleAddVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.scheduled_date) return;
    setLoading(true);
    const { error } = await supabase.from("job_visits").insert({
      job_id: jobId,
      scheduled_date: form.scheduled_date,
      scheduled_time: form.scheduled_time || null,
      engineer_id: form.engineer_id || null,
      notes: form.notes || null,
    } as any);
    if (error) {
      toast({ title: "Error", description: "Failed to add visit.", variant: "destructive" });
    } else {
      toast({ title: "Visit added" });
      setForm({ scheduled_date: "", scheduled_time: "", engineer_id: "", notes: "" });
      setAddOpen(false);
      fetchVisits();
    }
    setLoading(false);
  };

  const handleGenerateRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recForm.start_date || !recForm.end_date) return;
    setLoading(true);

    const interval = parseInt(recForm.interval) || 1;
    const dates: string[] = [];
    let current = new Date(recForm.start_date);
    const end = new Date(recForm.end_date);

    while (current <= end) {
      dates.push(format(current, "yyyy-MM-dd"));
      if (recForm.unit === "days") current = addDays(current, interval);
      else if (recForm.unit === "weeks") current = addWeeks(current, interval);
      else current = addMonths(current, interval);
    }

    if (dates.length === 0) {
      toast({ title: "No dates", description: "No visit dates fall within the range.", variant: "destructive" });
      setLoading(false);
      return;
    }

    await supabase.from("jobs").update({
      job_type: "recurring",
      recurrence_interval: interval,
      recurrence_unit: recForm.unit,
      recurrence_start_date: recForm.start_date,
      recurrence_end_date: recForm.end_date,
    } as any).eq("id", jobId);

    const rows = dates.map((d) => ({
      job_id: jobId,
      scheduled_date: d,
      engineer_id: recForm.engineer_id || null,
      status: "upcoming",
    }));

    const { error } = await supabase.from("job_visits").insert(rows as any);
    if (error) {
      toast({ title: "Error", description: "Failed to generate visits.", variant: "destructive" });
    } else {
      toast({ title: "Visits generated", description: `${dates.length} visits created.` });
      setRecurrenceOpen(false);
      fetchVisits();
    }
    setLoading(false);
  };

  const handleStatusChange = async (visitId: string, newStatus: string) => {
    const update: any = { status: newStatus };
    if (newStatus === "completed") update.completed_at = new Date().toISOString();
    else update.completed_at = null;

    const { error } = await supabase.from("job_visits").update(update).eq("id", visitId);
    if (error) {
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
    } else {
      fetchVisits();
    }
  };

  const engineerName = (id: string | null) => {
    if (!id) return "Unassigned";
    return engineers.find((e) => e.user_id === id)?.full_name || "Unknown";
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarPlus className="h-4 w-4" /> Scheduled Visits
            <Badge variant="secondary" className="ml-1">{visits.length}</Badge>
          </CardTitle>
          {isAdmin && (
            <div className="flex gap-2">
              <Dialog open={recurrenceOpen} onOpenChange={setRecurrenceOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Repeat className="mr-1.5 h-3.5 w-3.5" /> Recurring
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Generate Recurring Visits</DialogTitle></DialogHeader>
                  <form onSubmit={handleGenerateRecurring} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Every</Label>
                        <Input type="number" min="1" value={recForm.interval} onChange={(e) => setRecForm({ ...recForm, interval: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Unit</Label>
                        <Select value={recForm.unit} onValueChange={(v) => setRecForm({ ...recForm, unit: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="days">Days</SelectItem>
                            <SelectItem value="weeks">Weeks</SelectItem>
                            <SelectItem value="months">Months</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Start Date</Label>
                        <Input type="date" value={recForm.start_date} onChange={(e) => setRecForm({ ...recForm, start_date: e.target.value })} required />
                      </div>
                      <div className="space-y-2">
                        <Label>End Date</Label>
                        <Input type="date" value={recForm.end_date} onChange={(e) => setRecForm({ ...recForm, end_date: e.target.value })} required />
                      </div>
                    </div>
                    {engineers.length > 0 && (
                      <div className="space-y-2">
                        <Label>Assign Engineer (optional)</Label>
                        <Select value={recForm.engineer_id || "__none__"} onValueChange={(v) => setRecForm({ ...recForm, engineer_id: v === "__none__" ? "" : v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Unassigned</SelectItem>
                            {engineers.map((e) => (
                              <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Generating..." : "Generate Visits"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
              <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (o) setForm((f) => ({ ...f, notes: f.notes || getScopeNotes() })); }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" /> Add Visit</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Visit</DialogTitle></DialogHeader>
                  <form onSubmit={handleAddVisit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Date</Label>
                        <Input type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Time (optional)</Label>
                        <Input type="time" value={form.scheduled_time} onChange={(e) => setForm({ ...form, scheduled_time: e.target.value })} />
                      </div>
                    </div>
                    {engineers.length > 0 && (
                      <div className="space-y-2">
                        <Label>Engineer</Label>
                        <Select value={form.engineer_id || "__none__"} onValueChange={(v) => setForm({ ...form, engineer_id: v === "__none__" ? "" : v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Unassigned</SelectItem>
                            {engineers.map((e) => (
                              <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Adding..." : "Add Visit"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Edit Visit Dialog */}
        <Dialog open={!!editVisit} onOpenChange={(o) => { if (!o) setEditVisit(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Visit</DialogTitle></DialogHeader>
            <form onSubmit={handleEditVisit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={editForm.scheduled_date} onChange={(e) => setEditForm({ ...editForm, scheduled_date: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Time (optional)</Label>
                  <Input type="time" value={editForm.scheduled_time} onChange={(e) => setEditForm({ ...editForm, scheduled_time: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unscheduled">Unscheduled</SelectItem>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {engineers.length > 0 && (
                <div className="space-y-2">
                  <Label>Engineer</Label>
                  <Select value={editForm.engineer_id || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, engineer_id: v === "__none__" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {engineers.map((e) => (
                        <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2} />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setEditVisit(null)}>Cancel</Button>
                <Button type="submit" className="flex-1" disabled={loading}>{loading ? "Saving..." : "Save Changes"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {visits.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No visits scheduled yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Engineer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                {isAdmin && <TableHead className="w-[80px]">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visits.map((v) => {
                const cfg = STATUS_CONFIG[v.status] || STATUS_CONFIG.upcoming;
                return (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium whitespace-nowrap">{format(new Date(v.scheduled_date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-muted-foreground">{v.scheduled_time || "—"}</TableCell>
                    <TableCell className="text-sm">{engineerName(v.engineer_id)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`gap-1 ${cfg.color}`}>
                        {cfg.icon} {v.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{v.notes || "—"}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(v)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
