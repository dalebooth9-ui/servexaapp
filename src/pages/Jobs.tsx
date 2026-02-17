import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, FolderOpen, GripVertical, FolderPlus } from "lucide-react";
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
  client: z.string().trim().max(200, "Client name must be under 200 characters").optional().or(z.literal("")),
  address: z.string().trim().max(500, "Address must be under 500 characters").optional().or(z.literal("")),
});

function DraggableJobRow({ job, statusColor, isAdmin }: { job: any; statusColor: (s: string) => string; isAdmin: boolean }) {
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
        <Badge variant="secondary" className={statusColor(job.status)}>
          {job.status}
        </Badge>
      </TableCell>
      <TableCell className="text-right">{job.submissions?.length || 0}</TableCell>
    </TableRow>
  );
}

function DroppableCustomerFolder({
  customerName,
  jobs,
  statusColor,
  isAdmin,
  isOver,
}: {
  customerName: string;
  jobs: any[];
  statusColor: (s: string) => string;
  isAdmin: boolean;
  isOver: boolean;
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
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-primary" />
          <span className="font-semibold">{customerName}</span>
          <Badge variant="secondary" className="ml-1 text-xs">{jobs.length}</Badge>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && <TableHead className="w-8 px-2" />}
              <TableHead>Reference</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Submissions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-muted-foreground py-4">
                  No jobs in this folder
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job: any) => (
                <DraggableJobRow key={job.id} job={job} statusColor={statusColor} isAdmin={isAdmin} />
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
  const [form, setForm] = useState({ name: "", reference_number: "", client: "", address: "" });
  const [loading, setLoading] = useState(false);
  const [activeJob, setActiveJob] = useState<any>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  const [newCustomerDialogOpen, setNewCustomerDialogOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [pendingNewCustomerJob, setPendingNewCustomerJob] = useState<any>(null);
  const [knownCustomers, setKnownCustomers] = useState<Set<string>>(new Set());

  const isAdmin = userRole === "admin";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchJobs = async () => {
    const { data } = await supabase.from("jobs").select("*, submissions(id)").order("created_at", { ascending: false });
    setJobs(data || []);
  };

  useEffect(() => { fetchJobs(); }, [user]);


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
      client: parsed.data.client || null,
      address: parsed.data.address || null,
      created_by: user?.id,
    });
    if (error) {
      if (import.meta.env.DEV) console.error("Job creation error:", error);
      const message = error.code === "23505"
        ? "A job with this reference number already exists."
        : "Failed to create job. Please try again.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } else {
      toast({ title: "Job created" });
      setForm({ name: "", reference_number: "", client: "", address: "" });
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

    const currentClient = draggedJob.client?.trim() || "Unassigned";
    if (currentClient === targetFolder) return;

    await reassignJob(draggedJob, targetFolder);
  };

  const reassignJob = async (draggedJob: any, targetFolder: string) => {
    const newClient = targetFolder === "Unassigned" ? null : targetFolder;

    setJobs((prev) =>
      prev.map((j) => (j.id === draggedJob.id ? { ...j, client: newClient } : j))
    );

    const { error } = await supabase
      .from("jobs")
      .update({ client: newClient })
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

  const filtered = jobs.filter(
    (j) =>
      j.name.toLowerCase().includes(search.toLowerCase()) ||
      j.reference_number.toLowerCase().includes(search.toLowerCase()) ||
      (j.client || "").toLowerCase().includes(search.toLowerCase())
  );

  const statusColor = (s: string) =>
    s === "active" ? "bg-accent/10 text-accent" : s === "completed" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground";

  const grouped = filtered.reduce<Record<string, any[]>>((acc, job) => {
    const key = job.client?.trim() || "Unassigned";
    if (!acc[key]) acc[key] = [];
    acc[key].push(job);
    return acc;
  }, {});

  // Keep the source folder visible during drag even if it becomes empty
  if (activeJob) {
    const sourceFolder = activeJob.client?.trim() || "Unassigned";
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
        const name = job.client?.trim();
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
                  <Input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} placeholder="Customer name" />
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creating..." : "Create Job"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search jobs..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
    </div>
  );
}
