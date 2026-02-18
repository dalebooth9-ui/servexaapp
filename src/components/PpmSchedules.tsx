import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CalendarClock,
  Plus,
  Pencil,
  Trash2,
  Pause,
  Play,
  Zap,
} from "lucide-react";
import { format } from "date-fns";

type PpmSchedule = {
  id: string;
  asset_id: string;
  title: string;
  description: string | null;
  frequency_interval: number;
  frequency_unit: string;
  priority: string;
  category: string;
  next_due_date: string;
  last_generated_at: string | null;
  status: string;
  created_at: string;
};

const emptyForm = {
  title: "",
  description: "",
  frequency_interval: 1,
  frequency_unit: "months",
  priority: "medium",
  category: "general",
  next_due_date: "",
  status: "active",
};

const CATEGORIES = ["general", "hvac", "electrical", "plumbing", "fire_safety", "elevator", "security", "it_network"];

interface PpmSchedulesProps {
  assetId: string;
}

export default function PpmSchedules({ assetId }: PpmSchedulesProps) {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [schedules, setSchedules] = useState<PpmSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PpmSchedule | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [generating, setGenerating] = useState(false);

  const fetchSchedules = async () => {
    const { data, error } = await supabase
      .from("ppm_schedules")
      .select("*")
      .eq("asset_id", assetId)
      .order("next_due_date");
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    setSchedules((data as PpmSchedule[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchSchedules();
  }, [assetId]);

  const openCreate = () => {
    setEditing(null);
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    setForm({ ...emptyForm, next_due_date: nextMonth.toISOString().split("T")[0] });
    setDialogOpen(true);
  };

  const openEdit = (s: PpmSchedule) => {
    setEditing(s);
    setForm({
      title: s.title,
      description: s.description || "",
      frequency_interval: s.frequency_interval,
      frequency_unit: s.frequency_unit,
      priority: s.priority,
      category: s.category,
      next_due_date: s.next_due_date,
      status: s.status,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.next_due_date) {
      toast({ title: "Title and next due date required", variant: "destructive" });
      return;
    }
    const payload = {
      asset_id: assetId,
      title: form.title.trim(),
      description: form.description || null,
      frequency_interval: form.frequency_interval,
      frequency_unit: form.frequency_unit,
      priority: form.priority,
      category: form.category,
      next_due_date: form.next_due_date,
      status: form.status,
    };

    if (editing) {
      const { error } = await supabase.from("ppm_schedules").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Schedule updated" });
    } else {
      const { error } = await supabase.from("ppm_schedules").insert(payload as any);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "PPM schedule created" });
    }
    setDialogOpen(false);
    fetchSchedules();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("ppm_schedules").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Schedule deleted" });
    fetchSchedules();
  };

  const toggleStatus = async (s: PpmSchedule) => {
    const newStatus = s.status === "active" ? "paused" : "active";
    const { error } = await supabase.from("ppm_schedules").update({ status: newStatus }).eq("id", s.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Schedule ${newStatus}` });
    fetchSchedules();
  };

  const handleGenerateNow = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-ppm-jobs");
      if (error) throw error;
      toast({
        title: "PPM jobs generated",
        description: `${data?.generated || 0} job(s) created from ${data?.checked || 0} due schedule(s).`,
      });
      fetchSchedules();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  const isDue = (date: string) => new Date(date) <= new Date();
  const isDueSoon = (date: string) => {
    const diff = new Date(date).getTime() - Date.now();
    return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> PPM Schedules ({schedules.length})
          </CardTitle>
          <div className="flex gap-2">
            {userRole === "admin" && schedules.some((s) => s.status === "active" && isDue(s.next_due_date)) && (
              <Button size="sm" variant="outline" onClick={handleGenerateNow} disabled={generating}>
                <Zap className="mr-1.5 h-3.5 w-3.5" /> {generating ? "Generating..." : "Generate Now"}
              </Button>
            )}
            {userRole === "admin" && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Schedule
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>
        ) : schedules.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No PPM schedules. Add one to auto-generate recurring maintenance jobs.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Next Due</TableHead>
                <TableHead>Status</TableHead>
                {userRole === "admin" && <TableHead className="w-28" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((s) => {
                const due = isDue(s.next_due_date);
                const soon = isDueSoon(s.next_due_date);
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{s.title}</p>
                        {s.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{s.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      Every {s.frequency_interval} {s.frequency_unit}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={s.priority === "high" ? "destructive" : s.priority === "low" ? "outline" : "secondary"}
                        className="text-[10px] capitalize"
                      >
                        {s.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium ${
                        s.status === "paused" ? "text-muted-foreground" :
                        due ? "text-destructive" : soon ? "text-amber-600" : "text-foreground"
                      }`}>
                        {due && s.status === "active" ? "⚠ " : soon && s.status === "active" ? "⏳ " : ""}
                        {format(new Date(s.next_due_date), "dd MMM yyyy")}
                      </span>
                      {s.last_generated_at && (
                        <p className="text-[10px] text-muted-foreground">
                          Last: {format(new Date(s.last_generated_at), "dd MMM yy")}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.status === "active" ? "default" : "outline"} className="text-[10px] capitalize">
                        {s.status}
                      </Badge>
                    </TableCell>
                    {userRole === "admin" && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleStatus(s)} title={s.status === "active" ? "Pause" : "Resume"}>
                            {s.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(s.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} PPM Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title *</label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Quarterly boiler service"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="What should the engineer do?"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Every</label>
                <Input
                  type="number"
                  min={1}
                  value={form.frequency_interval}
                  onChange={(e) => setForm((f) => ({ ...f, frequency_interval: parseInt(e.target.value) || 1 }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Unit</label>
                <Select value={form.frequency_unit} onValueChange={(v) => setForm((f) => ({ ...f, frequency_unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="days">Days</SelectItem>
                    <SelectItem value="weeks">Weeks</SelectItem>
                    <SelectItem value="months">Months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Next Due *</label>
                <Input
                  type="date"
                  value={form.next_due_date}
                  onChange={(e) => setForm((f) => ({ ...f, next_due_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Priority</label>
                <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Category</label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>{editing ? "Update" : "Create"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
