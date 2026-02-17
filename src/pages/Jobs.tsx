import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, FolderOpen, GripVertical, FolderPlus, Trash2, Pencil, MessageSquare, Send } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";

const jobSchema = z.object({
  name: z.string().trim().min(1, "Job name is required").max(200, "Job name must be under 200 characters"),
  reference_number: z.string().trim().min(1, "Reference number is required").max(50, "Reference number must be under 50 characters").regex(/^[A-Za-z0-9\-_]+$/, "Reference number can only contain letters, numbers, hyphens and underscores"),
  customer: z.string().trim().max(200, "Customer name must be under 200 characters").optional().or(z.literal("")),
  address: z.string().trim().max(500, "Address must be under 500 characters").optional().or(z.literal("")),
});

function WhatsAppQuickSend({ jobId, jobRef }: { jobId: string; jobRef: string }) {
  const [open, setOpen] = useState(false);
  const [engineers, setEngineers] = useState<{ id: string; name: string }[]>([]);
  const [selectedEngineer, setSelectedEngineer] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingEngineers, setLoadingEngineers] = useState(false);
  const { toast } = useToast();

  const loadEngineers = async () => {
    setLoadingEngineers(true);
    const { data } = await supabase
      .from("job_assignments")
      .select("engineer_id")
      .eq("job_id", jobId);
    if (data && data.length > 0) {
      const ids = data.map((d) => d.engineer_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      setEngineers((profiles || []).map((p) => ({ id: p.user_id, name: p.full_name || p.user_id })));
    } else {
      setEngineers([]);
    }
    setLoadingEngineers(false);
  };

  const handleOpen = () => {
    setOpen(true);
    setSelectedEngineer("");
    setMessage("");
    loadEngineers();
  };

  const handleSend = async () => {
    if (!selectedEngineer || !message.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: { engineerId: selectedEngineer, message: message.trim(), jobId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Sent", description: `WhatsApp message sent for ${jobRef}.` });
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to send message.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); handleOpen(); }} className="text-muted-foreground hover:text-accent transition-colors" title="Send WhatsApp">
        <MessageSquare className="h-4 w-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4 text-accent" />
              WhatsApp — {jobRef}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {loadingEngineers ? (
              <p className="text-sm text-muted-foreground">Loading engineers...</p>
            ) : engineers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No engineers assigned to this job.</p>
            ) : (
              <>
                <Select value={selectedEngineer} onValueChange={setSelectedEngineer}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select engineer" />
                  </SelectTrigger>
                  <SelectContent>
                    {engineers.map((eng) => (
                      <SelectItem key={eng.id} value={eng.id}>{eng.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="Type your message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  maxLength={1600}
                />
                <Button onClick={handleSend} disabled={!selectedEngineer || !message.trim() || sending} className="w-full">
                  <Send className="mr-2 h-4 w-4" />
                  {sending ? "Sending..." : "Send WhatsApp Message"}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DraggableJobRow({ job, statusColor, isAdmin, onDelete }: { job: any; statusColor: (s: string) => string; isAdmin: boolean; onDelete?: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: job.id,
    data: { job },
    disabled: !isAdmin,
  });

  return (
    <TableRow
      ref={setNodeRef}
      className={isDragging ? "opacity-30" : ""}
    >
      {isAdmin && (
        <TableCell className="w-8 px-2">
          <button {...listeners} {...attributes} className="cursor-grab touch-none text-muted-foreground hover:text-foreground">
            <GripVertical className="h-4 w-4" />
          </button>
        </TableCell>
      )}
      <TableCell>
        <Link to={`/jobs/${job.id}`} className="font-mono text-sm font-medium text-primary hover:underline">
          {job.reference_number}
        </Link>
      </TableCell>
      <TableCell className="font-medium">{job.name}</TableCell>
      <TableCell>
        <Badge variant={job.priority === "high" ? "destructive" : "secondary"} className="text-[10px] uppercase">
          {job.priority || "medium"}
        </Badge>
      </TableCell>
      <TableCell>
        <span className="text-xs capitalize text-muted-foreground">{job.category || "general"}</span>
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className={statusColor(job.status)}>
          {job.status}
        </Badge>
      </TableCell>
      <TableCell className="text-right">{job.submissions?.length || 0}</TableCell>
      {isAdmin && (
        <TableCell className="w-20 px-2">
          <div className="flex items-center gap-2">
            <WhatsAppQuickSend jobId={job.id} jobRef={job.reference_number} />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="text-muted-foreground hover:text-destructive transition-colors" title="Delete job">
                  <Trash2 className="h-4 w-4" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete job?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete <strong>{job.reference_number} – {job.name}</strong> and all associated data. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => onDelete?.(job.id)}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

function DroppableCustomerFolder({
  customerName,
  jobs,
  statusColor,
  isAdmin,
  isOver,
  onDelete,
  onRename,
  onDeleteJob,
}: {
  customerName: string;
  jobs: any[];
  statusColor: (s: string) => string;
  isAdmin: boolean;
  isOver: boolean;
  onDelete?: () => void;
  onRename?: () => void;
  onDeleteJob?: (id: string) => void;
}) {
  const { setNodeRef } = useDroppable({
    id: `folder-${customerName}`,
    data: { customerName },
  });

  return (
    <AccordionItem
      ref={setNodeRef}
      value={customerName}
      className={`rounded-lg border bg-card transition-colors ${isOver ? "ring-2 ring-primary/50 bg-primary/5" : ""}`}
    >
      <AccordionTrigger className="px-4 hover:no-underline">
        <div className="flex items-center gap-2 flex-1">
          <FolderOpen className="h-4 w-4 text-primary" />
          <span className="font-semibold">{customerName}</span>
          <Badge variant="secondary" className="ml-1 text-xs">{jobs.length}</Badge>
          {isAdmin && customerName !== "Unassigned" && (
            <div className="ml-auto mr-2 flex items-center gap-1">
              {onRename && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRename(); }}
                  className="text-muted-foreground hover:text-primary transition-colors"
                  title="Rename folder"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {jobs.length === 0 && onDelete && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete empty folder"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && <TableHead className="w-8 px-2" />}
              <TableHead>Reference</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Submissions</TableHead>
              {isAdmin && <TableHead className="w-10 px-2" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 8 : 6} className="text-center text-muted-foreground py-4">
                  No jobs in this folder
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job: any) => (
                <DraggableJobRow key={job.id} job={job} statusColor={statusColor} isAdmin={isAdmin} onDelete={onDeleteJob} />
              ))
            )}
          </TableBody>
        </Table>
      </AccordionContent>
    </AccordionItem>
  );
}

function NewCustomerDropZone({ isOver, isDragging }: { isOver: boolean; isDragging: boolean }) {
  const { setNodeRef } = useDroppable({
    id: "folder-__new_customer__",
    data: { customerName: "__new_customer__" },
  });

  return (
    <div
      ref={setNodeRef}
      className={`mt-3 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-all ${
        !isDragging
          ? "hidden"
          : isOver
            ? "border-primary bg-primary/10 text-primary"
            : "border-muted-foreground/30 text-muted-foreground"
      }`}
    >
      <FolderPlus className="mx-auto mb-2 h-6 w-6" />
      <p className="text-sm font-medium">Drop here to create a new customer folder</p>
    </div>
  );
}

export default function Jobs() {
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", reference_number: "", customer: "", address: "", priority: "medium", category: "general" });
  const [loading, setLoading] = useState(false);
  const [activeJob, setActiveJob] = useState<any>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  const [newCustomerDialogOpen, setNewCustomerDialogOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [pendingNewCustomerJob, setPendingNewCustomerJob] = useState<any>(null);
  const [knownCustomers, setKnownCustomers] = useState<Set<string>>(new Set());
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState("");
  const [renameValue, setRenameValue] = useState("");

  const isAdmin = userRole === "admin";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchJobs = async () => {
    const { data } = await supabase.from("jobs").select("*, submissions(id)").order("created_at", { ascending: false });
    setJobs(data || []);
  };

  useEffect(() => { fetchJobs(); }, [user]);

  const handleDeleteJob = async (jobId: string) => {
    const { error } = await supabase.from("jobs").delete().eq("id", jobId);
    if (error) {
      toast({ title: "Error", description: "Failed to delete job.", variant: "destructive" });
    } else {
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      toast({ title: "Job deleted", description: "The job has been removed." });
    }
  };


  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const parsed = jobSchema.safeParse(form);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message || "Invalid input";
      toast({ title: "Validation error", description: firstError, variant: "destructive" });
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("jobs").insert({
      name: parsed.data.name,
      reference_number: parsed.data.reference_number,
      customer: parsed.data.customer || null,
      address: parsed.data.address || null,
      priority: form.priority,
      category: form.category,
      created_by: user?.id,
    } as any);
    if (error) {
      if (import.meta.env.DEV) console.error("Job creation error:", error);
      const message = error.code === "23505"
        ? "A job with this reference number already exists."
        : "Failed to create job. Please try again.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } else {
      toast({ title: "Job created" });
      setForm({ name: "", reference_number: "", customer: "", address: "", priority: "medium", category: "general" });
      setDialogOpen(false);
      fetchJobs();
    }
    setLoading(false);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveJob(event.active.data.current?.job || null);
  };

  const handleDragOver = (event: any) => {
    const overId = event.over?.id as string | null;
    setOverId(overId || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveJob(null);
    setOverId(null);

    const { active, over } = event;
    if (!over) return;

    const draggedJob = active.data.current?.job;
    const targetFolder = over.data.current?.customerName;
    if (!draggedJob || !targetFolder) return;

    if (targetFolder === "__new_customer__") {
      setPendingNewCustomerJob(draggedJob);
      setNewCustomerName("");
      setNewCustomerDialogOpen(true);
      return;
    }

    const currentClient = draggedJob.customer?.trim() || "Unassigned";
    if (currentClient === targetFolder) return;

    await reassignJob(draggedJob, targetFolder);
  };

  const reassignJob = async (draggedJob: any, targetFolder: string) => {
    const newCustomer = targetFolder === "Unassigned" ? null : targetFolder;

    setJobs((prev) =>
      prev.map((j) => (j.id === draggedJob.id ? { ...j, customer: newCustomer } : j))
    );

    const { error } = await supabase
      .from("jobs")
      .update({ customer: newCustomer })
      .eq("id", draggedJob.id);

    if (error) {
      toast({ title: "Error", description: "Failed to reassign job.", variant: "destructive" });
      fetchJobs();
    } else {
      toast({ title: "Job reassigned", description: `Moved to ${targetFolder}` });
    }
  };

  const handleNewCustomerConfirm = async () => {
    const trimmed = newCustomerName.trim();
    if (!trimmed || !pendingNewCustomerJob) return;
    setNewCustomerDialogOpen(false);
    await reassignJob(pendingNewCustomerJob, trimmed);
    setPendingNewCustomerJob(null);
    setNewCustomerName("");
  };

  const deleteCustomerFolder = (customerName: string) => {
    setKnownCustomers((prev) => {
      const updated = new Set(prev);
      updated.delete(customerName);
      return updated;
    });
    setOpenFolders((prev) => prev.filter((f) => f !== customerName));
    toast({ title: "Folder deleted", description: `Removed "${customerName}" folder` });
  };

  const startRenameFolder = (customerName: string) => {
    setRenamingFolder(customerName);
    setRenameValue(customerName);
    setRenameDialogOpen(true);
  };

  const handleRenameConfirm = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === renamingFolder) {
      setRenameDialogOpen(false);
      return;
    }

    // Update all jobs with this customer name in the DB
    const jobsInFolder = jobs.filter((j) => (j.customer?.trim() || "Unassigned") === renamingFolder);
    
    setJobs((prev) =>
      prev.map((j) => (j.customer?.trim() || "Unassigned") === renamingFolder ? { ...j, customer: trimmed } : j)
    );
    setKnownCustomers((prev) => {
      const updated = new Set(prev);
      updated.delete(renamingFolder);
      updated.add(trimmed);
      return updated;
    });
    setOpenFolders((prev) => prev.map((f) => f === renamingFolder ? trimmed : f));

    const ids = jobsInFolder.map((j) => j.id);
    if (ids.length > 0) {
      const { error } = await supabase
        .from("jobs")
        .update({ customer: trimmed })
        .in("id", ids);

      if (error) {
        toast({ title: "Error", description: "Failed to rename folder.", variant: "destructive" });
        fetchJobs();
      } else {
        toast({ title: "Folder renamed", description: `"${renamingFolder}" → "${trimmed}"` });
      }
    } else {
      toast({ title: "Folder renamed", description: `"${renamingFolder}" → "${trimmed}"` });
    }

    setRenameDialogOpen(false);
  };

  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filtered = jobs.filter((j) => {
    if (statusFilter !== "all" && j.status !== statusFilter) return false;
    if (priorityFilter !== "all" && (j.priority || "medium") !== priorityFilter) return false;
    if (categoryFilter !== "all" && (j.category || "general") !== categoryFilter) return false;
    return (
      j.name.toLowerCase().includes(search.toLowerCase()) ||
      j.reference_number.toLowerCase().includes(search.toLowerCase()) ||
      (j.customer || "").toLowerCase().includes(search.toLowerCase())
    );
  });

  const statusColor = (s: string) =>
    s === "active" ? "bg-accent/10 text-accent" : s === "completed" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground";

  const grouped = filtered.reduce<Record<string, any[]>>((acc, job) => {
    const key = job.customer?.trim() || "Unassigned";
    if (!acc[key]) acc[key] = [];
    acc[key].push(job);
    return acc;
  }, {});

  // Keep the source folder visible during drag even if it becomes empty
  if (activeJob) {
    const sourceFolder = activeJob.customer?.trim() || "Unassigned";
    if (!grouped[sourceFolder]) grouped[sourceFolder] = [];
  }

  // Keep known customer folders visible even if empty
  for (const name of knownCustomers) {
    if (!grouped[name]) grouped[name] = [];
  }

  const customerNames = Object.keys(grouped).sort((a, b) => {
    if (a === "Unassigned") return 1;
    if (b === "Unassigned") return -1;
    return a.localeCompare(b);
  });

  // Track known customers and keep all folders open by default
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setKnownCustomers((prev) => {
      const updated = new Set(prev);
      let changed = false;
      for (const job of jobs) {
        const name = job.customer?.trim();
        if (name && !updated.has(name)) {
          updated.add(name);
          changed = true;
        }
      }
      return changed ? updated : prev;
    });
    setOpenFolders((prev) => {
      const allNames = new Set(prev);
      let changed = false;
      for (const name of customerNames) {
        if (!allNames.has(name)) {
          allNames.add(name);
          changed = true;
        }
      }
      return changed ? Array.from(allNames) : prev;
    });
  }, [jobs]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Jobs</h1>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> New Job</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create New Job</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Job Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Reference Number</Label>
                  <Input value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} required placeholder="e.g. JOB-001" />
                </div>
                <div className="space-y-2">
                  <Label>Customer</Label>
                  <Input value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} placeholder="Customer name" />
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="installation">Installation</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                        <SelectItem value="inspection">Inspection</SelectItem>
                        <SelectItem value="survey">Survey</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creating..." : "Create Job"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search jobs..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="general">General</SelectItem>
            <SelectItem value="installation">Installation</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="inspection">Inspection</SelectItem>
            <SelectItem value="survey">Survey</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No jobs found.
          </CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <Accordion type="multiple" value={openFolders} onValueChange={setOpenFolders} className="space-y-3">
            {customerNames.map((customerName) => (
              <DroppableCustomerFolder
                key={customerName}
                customerName={customerName}
                jobs={grouped[customerName] || []}
                statusColor={statusColor}
                isAdmin={isAdmin}
                isOver={overId === `folder-${customerName}`}
                onDelete={() => deleteCustomerFolder(customerName)}
                onRename={() => startRenameFolder(customerName)}
                onDeleteJob={handleDeleteJob}
              />
            ))}
          </Accordion>
          {isAdmin && (
            <NewCustomerDropZone isDragging={!!activeJob} isOver={overId === "folder-__new_customer__"} />
          )}
          <DragOverlay>
            {activeJob ? (
              <div className="rounded-md border bg-card px-4 py-2 shadow-lg">
                <span className="font-mono text-sm font-medium text-primary">{activeJob.reference_number}</span>
                <span className="ml-2 text-sm">{activeJob.name}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <Dialog open={newCustomerDialogOpen} onOpenChange={(open) => {
        setNewCustomerDialogOpen(open);
        if (!open) setPendingNewCustomerJob(null);
      }}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Customer Folder</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleNewCustomerConfirm(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Customer Name</Label>
              <Input
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="Enter new customer name"
                autoFocus
                required
              />
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">{pendingNewCustomerJob?.reference_number}</span> — {pendingNewCustomerJob?.name} will be moved to this folder.
            </p>
            <Button type="submit" className="w-full" disabled={!newCustomerName.trim()}>
              Create & Move
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename Customer Folder</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleRenameConfirm(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>New Name</Label>
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={!renameValue.trim() || renameValue.trim() === renamingFolder}>
              Rename
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
