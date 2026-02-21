import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, FolderOpen, GripVertical, FolderPlus, Trash2, Pencil, MessageSquare, Send, Upload, ArrowLeft, Loader2, FileText, Image, X } from "lucide-react";
import BulkImportDialog from "@/components/BulkImportDialog";
import FolderImportDialog, { type FolderImportDialogHandle } from "@/components/FolderImportDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useJobCategories } from "@/hooks/useJobCategories";
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
  reference_number: z.string().trim().max(50, "Reference number must be under 50 characters").regex(/^[A-Za-z0-9\-_]*$/, "Reference number can only contain letters, numbers, hyphens and underscores").optional().or(z.literal("")),
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

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".webp", ".gif"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

function getFileExt(name: string) {
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}

function DraggableJobRow({ job, statusColor, isAdmin, onDelete, selected, onSelect, onFileDrop }: { job: any; statusColor: (s: string) => string; isAdmin: boolean; onDelete?: (id: string) => void; selected?: boolean; onSelect?: (id: string, checked: boolean) => void; onFileDrop?: (jobId: string, files: File[]) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: job.id,
    data: { job },
    disabled: !isAdmin,
  });
  const [fileOver, setFileOver] = useState(false);
  const fileCounter = useRef(0);

  const handleNativeDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault(); e.stopPropagation();
    fileCounter.current++;
    setFileOver(true);
  };
  const handleNativeDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    fileCounter.current--;
    if (fileCounter.current === 0) setFileOver(false);
  };
  const handleNativeDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault(); e.stopPropagation();
  };
  const handleNativeDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault(); e.stopPropagation();
    fileCounter.current = 0;
    setFileOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => {
      const ext = getFileExt(f.name);
      return ALLOWED_EXTENSIONS.includes(ext) && f.size <= 20 * 1024 * 1024;
    });
    if (files.length > 0 && onFileDrop) onFileDrop(job.id, files);
  };

  return (
    <TableRow
      ref={setNodeRef}
      className={`${isDragging ? "opacity-30" : ""} ${fileOver ? "ring-2 ring-primary bg-primary/5" : ""}`}
      onDragEnter={handleNativeDragEnter}
      onDragLeave={handleNativeDragLeave}
      onDragOver={handleNativeDragOver}
      onDrop={handleNativeDrop}
    >
      {isAdmin && (
        <TableCell className="w-8 px-2">
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => onSelect?.(job.id, !!checked)}
          />
        </TableCell>
      )}
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
          {job.status.replace(/_/g, " ")}
        </Badge>
      </TableCell>
      <TableCell>
        {job.result === "pass" ? (
          <Badge className="bg-green-600 text-white text-[10px] uppercase">Pass</Badge>
        ) : job.result === "fail" ? (
          <Badge variant="destructive" className="text-[10px] uppercase">Fail</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
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
  selectedIds,
  onSelect,
  onSelectAll,
  onJobFileDrop,
  onFolderFileDrop,
}: {
  customerName: string;
  jobs: any[];
  statusColor: (s: string) => string;
  isAdmin: boolean;
  isOver: boolean;
  onDelete?: () => void;
  onRename?: () => void;
  onDeleteJob?: (id: string) => void;
  selectedIds?: Set<string>;
  onSelect?: (id: string, checked: boolean) => void;
  onSelectAll?: (jobIds: string[], checked: boolean) => void;
  onJobFileDrop?: (jobId: string, files: File[]) => void;
  onFolderFileDrop?: (customerName: string, files: File[]) => void;
}) {
  const { setNodeRef } = useDroppable({
    id: `folder-${customerName}`,
    data: { customerName },
  });
  const [fileOver, setFileOver] = useState(false);
  const fileCounter = useRef(0);

  const handleFolderFileDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault(); e.stopPropagation();
    fileCounter.current++;
    setFileOver(true);
  };
  const handleFolderFileDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    fileCounter.current--;
    if (fileCounter.current === 0) setFileOver(false);
  };
  const handleFolderFileDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault(); e.stopPropagation();
  };
  const handleFolderFileDrop = (e: React.DragEvent) => {
    // Only handle if not already handled by a job row
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault(); e.stopPropagation();
    fileCounter.current = 0;
    setFileOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => {
      const ext = getFileExt(f.name);
      return ALLOWED_EXTENSIONS.includes(ext) && f.size <= 20 * 1024 * 1024;
    });
    if (files.length > 0 && onFolderFileDrop) onFolderFileDrop(customerName, files);
  };

  const folderJobIds = jobs.map((j) => j.id);
  const allSelected = jobs.length > 0 && folderJobIds.every((id) => selectedIds?.has(id));
  const someSelected = folderJobIds.some((id) => selectedIds?.has(id));

  return (
    <AccordionItem
      ref={setNodeRef}
      value={customerName}
      className={`rounded-lg border bg-card transition-colors ${isOver ? "ring-2 ring-primary/50 bg-primary/5" : ""} ${fileOver ? "ring-2 ring-accent/50 bg-accent/5" : ""}`}
      onDragEnter={handleFolderFileDragEnter}
      onDragLeave={handleFolderFileDragLeave}
      onDragOver={handleFolderFileDragOver}
      onDrop={handleFolderFileDrop}
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
              {isAdmin && (
                <TableHead className="w-8 px-2">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(checked) => onSelectAll?.(folderJobIds, !!checked)}
                  />
                </TableHead>
              )}
              {isAdmin && <TableHead className="w-8 px-2" />}
              <TableHead>Reference</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Result</TableHead>
              <TableHead className="text-right">Submissions</TableHead>
              {isAdmin && <TableHead className="w-10 px-2" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 10 : 7} className="text-center text-muted-foreground py-4">
                  No jobs in this folder
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job: any) => (
                <DraggableJobRow key={job.id} job={job} statusColor={statusColor} isAdmin={isAdmin} onDelete={onDeleteJob} selected={selectedIds?.has(job.id)} onSelect={onSelect} onFileDrop={onJobFileDrop} />
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
  const navigate = useNavigate();
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const { categories } = useJobCategories();
  const [jobs, setJobs] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", reference_number: "", customer: "", address: "", priority: "medium", category: "general" });
  const [loading, setLoading] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [folderImportOpen, setFolderImportOpen] = useState(false);
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
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [fileDragging, setFileDragging] = useState(false);
  const [fileDropUploading, setFileDropUploading] = useState(false);
  const [fileDropDialogOpen, setFileDropDialogOpen] = useState(false);
  const [fileDropChoiceOpen, setFileDropChoiceOpen] = useState(false);
  const [fileDropTargetJob, setFileDropTargetJob] = useState<any>(null);
  const [fileDropCustomer, setFileDropCustomer] = useState("");
  const [fileDropPendingFiles, setFileDropPendingFiles] = useState<File[]>([]);
  const [fileDropNewJobForm, setFileDropNewJobForm] = useState({ name: "", reference_number: "", priority: "medium", category: "general" });
  const fileDragCounter = useRef(0);
  const folderImportRef = useRef<FolderImportDialogHandle | null>(null);

  useEffect(() => {
    const fetchCustomers = async () => {
      const { data } = await supabase.from("customers").select("id, name").order("name");
      setCustomers(data || []);
    };
    fetchCustomers();
  }, []);

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

  const handleSelectJob = (id: string, checked: boolean) => {
    setSelectedJobIds((prev) => {
      const updated = new Set(prev);
      if (checked) updated.add(id);
      else updated.delete(id);
      return updated;
    });
  };

  const handleSelectAll = (jobIds: string[], checked: boolean) => {
    setSelectedJobIds((prev) => {
      const updated = new Set(prev);
      for (const id of jobIds) {
        if (checked) updated.add(id);
        else updated.delete(id);
      }
      return updated;
    });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedJobIds);
    const { error } = await supabase.from("jobs").delete().in("id", ids);
    if (error) {
      toast({ title: "Error", description: "Failed to delete jobs.", variant: "destructive" });
    } else {
      setJobs((prev) => prev.filter((j) => !selectedJobIds.has(j.id)));
      toast({ title: "Deleted", description: `${ids.length} job(s) deleted.` });
      setSelectedJobIds(new Set());
    }
    setBulkDeleteOpen(false);
  };

  // Handle files dropped directly onto a job row — show choice dialog
  const handleJobFileDrop = (jobId: string, files: File[]) => {
    const targetJob = jobs.find((j) => j.id === jobId);
    setFileDropTargetJob(targetJob || null);
    setFileDropPendingFiles(files);
    setFileDropChoiceOpen(true);
  };

  const handleAddToExistingJob = async () => {
    if (!user || !fileDropTargetJob || fileDropPendingFiles.length === 0) return;
    setFileDropChoiceOpen(false);
    setFileDropUploading(true);
    let uploaded = 0;
    for (const file of fileDropPendingFiles) {
      const ext = getFileExt(file.name);
      const isImage = IMAGE_EXTENSIONS.includes(ext);
      const path = `${fileDropTargetJob.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("submissions").upload(path, file);
      if (uploadError) { console.error("Upload error:", uploadError); continue; }
      const { data: urlData } = supabase.storage.from("submissions").getPublicUrl(path);
      await supabase.from("submissions").insert({
        job_id: fileDropTargetJob.id,
        engineer_id: user.id,
        type: isImage ? "photo" : "document",
        file_url: urlData.publicUrl,
        file_name: file.name,
      } as any);
      uploaded++;
    }
    setFileDropUploading(false);
    setFileDropPendingFiles([]);
    setFileDropTargetJob(null);
    if (uploaded > 0) {
      toast({ title: "Files uploaded", description: `${uploaded} file(s) added to ${fileDropTargetJob.reference_number}.` });
      fetchJobs();
    }
  };

  const handleCreateSiblingJob = () => {
    setFileDropChoiceOpen(false);
    setFileDropCustomer(fileDropTargetJob?.customer || "");
    setFileDropNewJobForm({ name: fileDropPendingFiles[0]?.name.replace(/\.[^.]+$/, "") || "", reference_number: "", priority: fileDropTargetJob?.priority || "medium", category: fileDropTargetJob?.category || "general" });
    setFileDropDialogOpen(true);
  };

  // Handle files dropped onto a customer folder — open dialog to create new job with files
  const handleFolderFileDrop = (customerName: string, files: File[]) => {
    setFileDropCustomer(customerName === "Unassigned" ? "" : customerName);
    setFileDropPendingFiles(files);
    setFileDropNewJobForm({ name: files[0]?.name.replace(/\.[^.]+$/, "") || "", reference_number: "", priority: "medium", category: "general" });
    setFileDropDialogOpen(true);
  };

  const handleFileDropCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || fileDropPendingFiles.length === 0) return;

    const parsed = jobSchema.safeParse({ ...fileDropNewJobForm, customer: fileDropCustomer });
    if (!parsed.success) {
      toast({ title: "Validation error", description: parsed.error.errors[0]?.message || "Invalid input", variant: "destructive" });
      return;
    }

    setFileDropUploading(true);
    // Create the job
    const { data: newJob, error: jobError } = await supabase.from("jobs").insert({
      name: parsed.data.name,
      ...(parsed.data.reference_number ? { reference_number: parsed.data.reference_number } : {}),
      customer: fileDropCustomer || null,
      priority: fileDropNewJobForm.priority,
      category: fileDropNewJobForm.category,
      created_by: user.id,
    } as any).select().single();

    if (jobError || !newJob) {
      const message = jobError?.code === "23505" ? "A job with this reference number already exists." : "Failed to create job.";
      toast({ title: "Error", description: message, variant: "destructive" });
      setFileDropUploading(false);
      return;
    }

    // Upload files as submissions
    for (const file of fileDropPendingFiles) {
      const ext = getFileExt(file.name);
      const isImage = IMAGE_EXTENSIONS.includes(ext);
      const path = `${newJob.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("submissions").upload(path, file);
      if (uploadError) { console.error("Upload error:", uploadError); continue; }
      const { data: urlData } = supabase.storage.from("submissions").getPublicUrl(path);
      await supabase.from("submissions").insert({
        job_id: newJob.id,
        engineer_id: user.id,
        type: isImage ? "photo" : "document",
        file_url: urlData.publicUrl,
        file_name: file.name,
      } as any);
    }

    // Auto-attach matching job sheet template with pre-filled data
    const { data: matchingTpls } = await supabase
      .from("job_sheet_templates")
      .select("id, fields")
      .eq("category", fileDropNewJobForm.category);
    if (matchingTpls && matchingTpls.length > 0) {
      for (const tpl of matchingTpls) {
        const fields = (typeof tpl.fields === "string" ? JSON.parse(tpl.fields) : tpl.fields) as any[];
        const prefilled: Record<string, any> = {};
        const category = fileDropNewJobForm.category || "";
        fields.forEach((f: any) => {
          const label = (f.label || "").toLowerCase();
          if (label.includes("customer") && (label.includes("detail") || label.includes("name") || label.includes("site"))) {
            prefilled[f.id] = fileDropCustomer;
          } else if ((label.includes("site") && label.includes("detail")) || label === "site address" || label === "address") {
            prefilled[f.id] = "";
          } else if (label.includes("po number") || label.includes("reference")) {
            prefilled[f.id] = parsed.data.reference_number || "";
          } else if (label.includes("scope") || label.includes("type of work") || label.includes("work type") || label.includes("job type") || label.includes("category")) {
            const catLabel = categories.find(c => c.slug === category)?.name || category;
            prefilled[f.id] = catLabel;
          } else if (label === "date" || label === "date:" || label === "inspection date") {
            prefilled[f.id] = new Date().toISOString().split("T")[0];
          }
        });
        await supabase.from("job_sheet_responses").insert({
          job_id: newJob.id,
          template_id: tpl.id,
          submitted_by: user.id,
          status: "draft",
          responses: prefilled,
        } as any);
      }
    }

    setFileDropUploading(false);
    setFileDropDialogOpen(false);
    setFileDropPendingFiles([]);
    toast({ title: "Job created", description: `${parsed.data.name} created with ${fileDropPendingFiles.length} file(s).` });
    fetchJobs();
  };

  const handleCreate = async (e: React.FormEvent, statusOverride?: string) => {
    e.preventDefault();
    setLoading(true);

    const parsed = jobSchema.safeParse(form);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message || "Invalid input";
      toast({ title: "Validation error", description: firstError, variant: "destructive" });
      setLoading(false);
      return;
    }

    const { data: createdJob, error } = await supabase.from("jobs").insert({
      name: parsed.data.name,
      ...(parsed.data.reference_number ? { reference_number: parsed.data.reference_number } : {}),
      customer: parsed.data.customer || null,
      address: parsed.data.address || null,
      priority: form.priority,
      category: form.category,
      status: statusOverride || "active",
      created_by: user?.id,
    } as any).select("id").single();
    if (error) {
      if (import.meta.env.DEV) console.error("Job creation error:", error);
      const message = error.code === "23505"
        ? "A job with this reference number already exists."
        : "Failed to create job. Please try again.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } else {
      toast({ title: statusOverride === "scheduled" ? "Job created & submitted to planner" : "Job created" });
      setForm({ name: "", reference_number: "", customer: "", address: "", priority: "medium", category: "general" });
      setDialogOpen(false);
      fetchJobs();

      if (createdJob) {
        // Auto-attach matching job sheet template with pre-filled data
        const { data: matchingTemplates } = await supabase
          .from("job_sheet_templates")
          .select("id, fields")
          .eq("category", form.category);
        if (matchingTemplates && matchingTemplates.length > 0) {
          for (const tpl of matchingTemplates) {
            const fields = (typeof tpl.fields === "string" ? JSON.parse(tpl.fields) : tpl.fields) as any[];
            const prefilled: Record<string, any> = {};
            const customerName = parsed.data.customer || "";
            const address = parsed.data.address || "";
            const category = form.category || "";
            fields.forEach((f: any) => {
              const label = (f.label || "").toLowerCase();
              if (label.includes("customer") && (label.includes("detail") || label.includes("name") || label.includes("site"))) {
                prefilled[f.id] = customerName;
              } else if ((label.includes("site") && label.includes("detail")) || label === "site address" || label === "address") {
                prefilled[f.id] = address;
              } else if (label.includes("po number") || label.includes("reference")) {
                // Will be filled after trigger assigns reference; use form value or empty
                prefilled[f.id] = parsed.data.reference_number || "";
              } else if (label.includes("scope") || label.includes("type of work") || label.includes("work type") || label.includes("job type") || label.includes("category")) {
                const catLabel = categories.find(c => c.slug === category)?.name || category;
                prefilled[f.id] = catLabel;
              } else if (label === "date" || label === "date:" || label === "inspection date") {
                prefilled[f.id] = new Date().toISOString().split("T")[0];
              }
            });
            await supabase.from("job_sheet_responses").insert({
              job_id: createdJob.id,
              template_id: tpl.id,
              submitted_by: user.id,
              status: "draft",
              responses: prefilled,
            } as any);
          }
        }

        // Send job_booked notification to customer if they have an email
        if (parsed.data.customer) {
          supabase.functions.invoke("notify-customer", {
            body: { job_id: createdJob.id, notification_type: "job_booked" },
          });
        }
      }
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

  const statusColor = (s: string) => {
    const colors: Record<string, string> = {
      active: "bg-accent/10 text-accent",
      in_progress: "bg-indigo-500/10 text-indigo-600",
      awaiting_parts: "bg-amber-500/10 text-amber-600",
      on_hold: "bg-orange-500/10 text-orange-600",
      requires_revisit: "bg-purple-500/10 text-purple-600",
      scheduled: "bg-cyan-500/10 text-cyan-600",
      completed: "bg-primary/10 text-primary",
      archived: "bg-muted text-muted-foreground",
    };
    return colors[s] || "bg-muted text-muted-foreground";
  };

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

  const handleFileDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    fileDragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setFileDragging(true);
  };
  const handleFileDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    fileDragCounter.current--;
    if (fileDragCounter.current === 0) setFileDragging(false);
  };
  const handleFileDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setFileDragging(false);
    fileDragCounter.current = 0;
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setFolderImportOpen(true);
      setTimeout(() => folderImportRef.current?.processFiles(files), 100);
    }
  };

  return (
    <div
      onDragEnter={isAdmin ? handleFileDragEnter : undefined}
      onDragLeave={isAdmin ? handleFileDragLeave : undefined}
      onDragOver={isAdmin ? handleFileDragOver : undefined}
      onDrop={isAdmin ? handleFileDrop : undefined}
      className="relative"
    >
      {fileDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-primary">
            <FolderOpen className="h-10 w-10" />
            <p className="font-medium">Drop folder to import jobs</p>
          </div>
        </div>
      )}
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Jobs</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setFolderImportOpen(true)}>
              <FolderOpen className="mr-2 h-4 w-4" /> Import Folder
            </Button>
            <Button variant="outline" onClick={() => setBulkImportOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> Import CSV
            </Button>
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
                  <Label>Reference Number <span className="text-muted-foreground text-xs font-normal">(auto-generated if left blank)</span></Label>
                  <Input value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} placeholder="Auto: VFP-00001" />
                </div>
                <div className="space-y-2">
                  <Label>Customer</Label>
                  <Select value={form.customer || "__none__"} onValueChange={(v) => setForm({ ...form, customer: v === "__none__" ? "" : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No customer</SelectItem>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                        {categories.map((c) => (
                          <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1" disabled={loading}>
                    {loading ? "Creating..." : "Create Job"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    disabled={loading}
                    onClick={(e) => handleCreate(e as any, "scheduled")}
                  >
                    {loading ? "Creating..." : "Save & Submit to Planner"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          <BulkImportDialog open={bulkImportOpen} onOpenChange={setBulkImportOpen} onImported={fetchJobs} />
          <FolderImportDialog ref={folderImportRef} open={folderImportOpen} onOpenChange={setFolderImportOpen} onImported={fetchJobs} />
          </div>
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
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="awaiting_parts">Awaiting Parts</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
            <SelectItem value="requires_revisit">Requires Revisit</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
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
            {categories.map((c) => (
              <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isAdmin && selectedJobIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <span className="text-sm font-medium">{selectedJobIds.size} job(s) selected</span>
          <Button variant="ghost" size="sm" onClick={() => setSelectedJobIds(new Set())}>
            Clear
          </Button>
          <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="mr-2 h-4 w-4" /> Delete Selected
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {selectedJobIds.size} job(s)?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the selected jobs and all associated data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleBulkDelete}
                >
                  Delete {selectedJobIds.size} Job(s)
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

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
                selectedIds={selectedJobIds}
                onSelect={handleSelectJob}
                onSelectAll={handleSelectAll}
                onJobFileDrop={handleJobFileDrop}
                onFolderFileDrop={handleFolderFileDrop}
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

      <Dialog open={fileDropChoiceOpen} onOpenChange={(open) => { setFileDropChoiceOpen(open); if (!open) { setFileDropPendingFiles([]); setFileDropTargetJob(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Files to Job</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            You dropped <strong>{fileDropPendingFiles.length} file(s)</strong> onto <strong>{fileDropTargetJob?.reference_number} – {fileDropTargetJob?.name}</strong>. What would you like to do?
          </p>
          <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2">
            {fileDropPendingFiles.map((file, i) => (
              <div key={`${file.name}-${i}`} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-muted">
                <div className="flex items-center gap-2 truncate">
                  {IMAGE_EXTENSIONS.includes(getFileExt(file.name))
                    ? <Image className="h-3.5 w-3.5 shrink-0 text-accent" />
                    : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    ({(file.size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setFileDropPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="grid gap-3 pt-2">
            <Button onClick={handleAddToExistingJob} className="w-full justify-start gap-3" variant="outline">
              <Upload className="h-4 w-4 shrink-0" />
              <div className="text-left">
                <p className="font-medium">Add to this job</p>
                <p className="text-xs text-muted-foreground">Upload as submissions to {fileDropTargetJob?.reference_number}</p>
              </div>
            </Button>
            <Button onClick={handleCreateSiblingJob} className="w-full justify-start gap-3" variant="outline">
              <Plus className="h-4 w-4 shrink-0" />
              <div className="text-left">
                <p className="font-medium">Create new job</p>
                <p className="text-xs text-muted-foreground">Create a sibling job{fileDropTargetJob?.customer ? ` under ${fileDropTargetJob.customer}` : ""} with these files</p>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={fileDropDialogOpen} onOpenChange={(open) => { setFileDropDialogOpen(open); if (!open) setFileDropPendingFiles([]); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Job from Dropped Files</DialogTitle></DialogHeader>
          <form onSubmit={handleFileDropCreateJob} className="space-y-4">
            <div className="space-y-2">
              <Label>Files to upload</Label>
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2">
                {fileDropPendingFiles.map((file, i) => (
                  <div key={`${file.name}-${i}`} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-muted">
                    <div className="flex items-center gap-2 truncate">
                      {IMAGE_EXTENSIONS.includes(getFileExt(file.name))
                        ? <Image className="h-3.5 w-3.5 shrink-0 text-accent" />
                        : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      <span className="truncate">{file.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        ({(file.size / 1024 / 1024).toFixed(1)} MB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFileDropPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Job Name</Label>
              <Input value={fileDropNewJobForm.name} onChange={(e) => setFileDropNewJobForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Reference Number <span className="text-muted-foreground text-xs font-normal">(auto-generated if left blank)</span></Label>
              <Input value={fileDropNewJobForm.reference_number} onChange={(e) => setFileDropNewJobForm((f) => ({ ...f, reference_number: e.target.value }))} placeholder="Auto: VFP-00001" />
            </div>
            {fileDropCustomer && (
              <div className="space-y-2">
                <Label>Customer</Label>
                <Input value={fileDropCustomer} disabled />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={fileDropNewJobForm.priority} onValueChange={(v) => setFileDropNewJobForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={fileDropNewJobForm.category} onValueChange={(v) => setFileDropNewJobForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={fileDropUploading}>
              {fileDropUploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</> : `Create Job & Upload ${fileDropPendingFiles.length} File(s)`}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {fileDropUploading && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border bg-card px-4 py-3 shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm font-medium">Uploading files...</span>
        </div>
      )}
    </div>
  );
}
