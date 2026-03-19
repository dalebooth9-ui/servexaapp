import { useEffect, useState, useCallback, useRef } from "react";
import PoImportDialog from "@/components/PoImportDialog";
import TodaysDashboard from "@/components/TodaysDashboard";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, FolderOpen, Trash2, Upload, ArrowLeft, Loader2, FileText, Image, X, BookTemplate, Save, ChevronDown, SlidersHorizontal, MoreHorizontal, Sparkles, Download, CheckSquare, Briefcase, FileSpreadsheet } from "lucide-react";
import BulkImportDialog from "@/components/BulkImportDialog";
import FolderImportDialog, { type FolderImportDialogHandle } from "@/components/FolderImportDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useJobCategories } from "@/hooks/useJobCategories";
import { useUndoAction } from "@/hooks/useUndoAction";
import { z } from "zod";
import { saveMapPinForJob } from "@/lib/saveMapPin";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { getStatusColor, getFileExtension, IMAGE_EXTENSIONS, isImageFile } from "@/lib/fileUtils";
import { generateAndSaveAiBrief } from "@/lib/aiJobBrief";
import { useFileUpload } from "@/hooks/useFileUpload";
import DroppableCustomerFolder from "@/components/jobs/DroppableCustomerFolder";
import NewCustomerDropZone from "@/components/jobs/NewCustomerDropZone";
import QuickScheduleDialog from "@/components/jobs/QuickScheduleDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const jobSchema = z.object({
  name: z.string().trim().min(1, "Job name is required").max(200, "Job name must be under 200 characters"),
  reference_number: z.string().trim().max(50, "Reference number must be under 50 characters").regex(/^[A-Za-z0-9\-_]*$/, "Reference number can only contain letters, numbers, hyphens and underscores").optional().or(z.literal("")),
  customer_id: z.string().optional().or(z.literal("")),
  address: z.string().trim().max(500, "Address must be under 500 characters").optional().or(z.literal("")),
});

// Helper to get customer name from job object
function getCustomerName(job: any): string | null {
  if (!job) return null;
  return job.customers?.name || job.customer || null;
}

export default function Jobs() {
  const navigate = useNavigate();
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const { categories } = useJobCategories();
  const { uploadFilesAsSubmissions } = useFileUpload();
  const { deleteWithUndo } = useUndoAction();
  const [jobs, setJobs] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", reference_number: "", customer_id: "", address: "", priority: "medium", category: "general", pressure_test_qty: 0, visual_qty: 0, other_qty: 0, other_service_type: "", due_date: "", allocated_days: "" });
  const [loading, setLoading] = useState(false);
  const [costingSheetFile, setCostingSheetFile] = useState<File | null>(null);
  const [costingSheetProcessing, setCostingSheetProcessing] = useState(false);
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
  const [bulkStatusValue, setBulkStatusValue] = useState("");
  const [bulkPriorityValue, setBulkPriorityValue] = useState("");
  const [bulkEngineerValue, setBulkEngineerValue] = useState("");
  const [engineers, setEngineers] = useState<{ user_id: string; full_name: string }[]>([]);
  const [jobTemplates, setJobTemplates] = useState<any[]>([]);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [quickScheduleJob, setQuickScheduleJob] = useState<any>(null);
  const [quickScheduleOpen, setQuickScheduleOpen] = useState(false);
  const [fileDragging, setFileDragging] = useState(false);
  const [dialogParsingFile, setDialogParsingFile] = useState(false);
  const [dialogParsedFile, setDialogParsedFile] = useState<File | null>(null);
  const [fileDropUploading, setFileDropUploading] = useState(false);
  const [fileDropDialogOpen, setFileDropDialogOpen] = useState(false);
  const [fileDropChoiceOpen, setFileDropChoiceOpen] = useState(false);
  const [fileDropTargetJob, setFileDropTargetJob] = useState<any>(null);
  const [fileDropCustomerId, setFileDropCustomerId] = useState("");
  const [fileDropCustomerName, setFileDropCustomerName] = useState("");
  const [fileDropPendingFiles, setFileDropPendingFiles] = useState<File[]>([]);
  const [poImportOpen, setPoImportOpen] = useState(false);
  const [poImportFile, setPoImportFile] = useState<File | null>(null);
  const poDropRef = useRef<HTMLDivElement | null>(null);
  const poDragCounter = useRef(0);
  const [fileDropNewJobForm, setFileDropNewJobForm] = useState({ name: "", reference_number: "", priority: "medium", category: "general" });
  const fileDragCounter = useRef(0);
  const folderImportRef = useRef<FolderImportDialogHandle | null>(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const fetchCustomers = async () => {
      const { data } = await supabase.from("customers").select("id, name").order("name");
      setCustomers(data || []);
    };
    fetchCustomers();

    // Fetch engineers for bulk assign
    supabase.from("profiles").select("user_id, full_name").then(({ data: profiles }) => {
      supabase.from("user_roles").select("user_id").eq("role", "engineer").then(({ data: roles }) => {
        const engIds = new Set((roles || []).map((r) => r.user_id));
        setEngineers((profiles || []).filter((p) => engIds.has(p.user_id)));
      });
    });

    // Fetch job templates
    const fetchTemplates = async () => {
      const { data } = await supabase.from("job_templates" as any).select("*").order("name");
      setJobTemplates(data || []);
    };
    fetchTemplates();
  }, []);

  const isAdmin = userRole === "admin";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchJobs = async () => {
    const { data } = await supabase.from("jobs").select("*, submissions(id, type), customers(id, name, email)").order("created_at", { ascending: false });
    setJobs(data || []);
  };

  useEffect(() => { fetchJobs(); }, [user]);

  // Keyboard shortcut: n j → open new job dialog
  useEffect(() => {
    const handler = () => setDialogOpen(true);
    window.addEventListener("shortcut:new-job" as any, handler);
    return () => window.removeEventListener("shortcut:new-job" as any, handler);
  }, []);

  const blockMellorRef = async (refNum: string) => {
    if (refNum?.startsWith("QH-")) {
      await supabase.from("mellor_deleted_references" as any).upsert({ reference_number: refNum });
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    const deletedJob = jobs.find((j) => j.id === jobId);
    if (!deletedJob) return;
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    deleteWithUndo({
      key: jobId,
      label: "Job deleted",
      onConfirm: async () => {
        await blockMellorRef(deletedJob.reference_number);
        const { error } = await supabase.from("jobs").delete().eq("id", jobId);
        if (error) {
          toast({ title: "Error", description: "Failed to delete job.", variant: "destructive" });
          setJobs((prev) => [...prev, deletedJob]);
        }
      },
      onUndo: async () => {
        // Re-insert the job so it comes back after undo
        const { id, customers, ...jobData } = deletedJob;
        await supabase.from("jobs").insert({ ...jobData, id } as any);
        setJobs((prev) => [...prev, deletedJob]);
      },
    });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedJobIds);
    const deletedJobs = jobs.filter((j) => ids.includes(j.id));
    setJobs((prev) => prev.filter((j) => !selectedJobIds.has(j.id)));
    setSelectedJobIds(new Set());
    setBulkDeleteOpen(false);
    deleteWithUndo({
      key: `bulk-${ids.join(",")}`,
      label: `${ids.length} job(s) deleted`,
      onConfirm: async () => {
        await Promise.all(deletedJobs.map((j) => blockMellorRef(j.reference_number)));
        const { error } = await supabase.from("jobs").delete().in("id", ids);
        if (error) {
          toast({ title: "Error", description: "Failed to delete jobs.", variant: "destructive" });
          setJobs((prev) => [...prev, ...deletedJobs]);
        }
      },
      onUndo: async () => {
        for (const job of deletedJobs) {
          const { id, customers, ...jobData } = job;
          await supabase.from("jobs").insert({ ...jobData, id } as any);
        }
        setJobs((prev) => [...prev, ...deletedJobs]);
      },
    });
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

  const handleBulkStatusChange = async (status: string) => {
    const ids = Array.from(selectedJobIds);
    const { error } = await supabase.from("jobs").update({ status } as any).in("id", ids);
    if (error) {
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
    } else {
      setJobs((prev) => prev.map((j) => ids.includes(j.id) ? { ...j, status } : j));
      toast({ title: `${ids.length} job(s) updated`, description: `Status set to "${status.replace(/_/g, " ")}"` });
      setSelectedJobIds(new Set());
    }
  };

  const handleBulkPriorityChange = async (priority: string) => {
    const ids = Array.from(selectedJobIds);
    const { error } = await supabase.from("jobs").update({ priority } as any).in("id", ids);
    if (error) {
      toast({ title: "Error", description: "Failed to update priority.", variant: "destructive" });
    } else {
      setJobs((prev) => prev.map((j) => ids.includes(j.id) ? { ...j, priority } : j));
      toast({ title: `${ids.length} job(s) updated`, description: `Priority set to "${priority}"` });
      setSelectedJobIds(new Set());
    }
  };

  const handleBulkAssignEngineer = async (engineerId: string) => {
    const ids = Array.from(selectedJobIds);
    for (const jobId of ids) {
      const { data: existing } = await supabase.from("job_assignments").select("id").eq("job_id", jobId).eq("engineer_id", engineerId).maybeSingle();
      if (!existing) {
        await supabase.from("job_assignments").insert({ job_id: jobId, engineer_id: engineerId });
      }
    }
    const eng = engineers.find((e) => e.user_id === engineerId);
    toast({ title: `${ids.length} job(s) assigned`, description: `Assigned to ${eng?.full_name}` });
    setSelectedJobIds(new Set());
  };

  const handleBulkExportCsv = () => {
    const ids = Array.from(selectedJobIds);
    const selectedJobs = jobs.filter((j) => ids.includes(j.id));
    const headers = ["Reference", "Name", "Customer", "Status", "Priority", "Category", "Due Date", "Address"];
    const rows = selectedJobs.map((j) => [
      j.reference_number, j.name, getCustomerName(j) || "",
      j.status, j.priority, j.category, j.due_date || "", j.address || "",
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v: string) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jobs-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `${ids.length} job(s) exported`, description: "CSV downloaded" });
  };

  // Escape key clears selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedJobIds.size > 0) setSelectedJobIds(new Set());
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedJobIds]);

  const handleSaveTemplate = async () => {

    if (!templateName.trim() || !user) return;
    const { error } = await supabase.from("job_templates" as any).insert({
      name: templateName.trim(),
      category: form.category,
      priority: form.priority,
      pressure_test_qty: form.pressure_test_qty,
      visual_qty: form.visual_qty,
      other_qty: form.other_qty,
      other_service_type: form.other_service_type || null,
      address: form.address || null,
      created_by: user.id,
    });
    if (error) {
      toast({ title: "Error", description: "Failed to save template.", variant: "destructive" });
    } else {
      toast({ title: "Template saved", description: `"${templateName.trim()}" saved for quick use.` });
      setSaveTemplateOpen(false);
      setTemplateName("");
      const { data } = await supabase.from("job_templates" as any).select("*").order("name");
      setJobTemplates(data || []);
    }
  };

  const handleLoadTemplate = (tpl: any) => {
    setForm((prev) => ({
      ...prev,
      category: tpl.category || "general",
      priority: tpl.priority || "medium",
      pressure_test_qty: tpl.pressure_test_qty || 0,
      visual_qty: tpl.visual_qty || 0,
      other_qty: (tpl as any).other_qty || 0,
      other_service_type: (tpl as any).other_service_type || "",
      address: tpl.address || prev.address,
    }));
    toast({ title: "Template loaded", description: `"${tpl.name}" applied to form.` });
  };

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
    const uploaded = await uploadFilesAsSubmissions(fileDropPendingFiles, fileDropTargetJob.id, user.id);
    setFileDropUploading(false);
    setFileDropPendingFiles([]);
    setFileDropTargetJob(null);
    if (uploaded > 0) fetchJobs();
  };

  const handleCreateSiblingJob = () => {
    setFileDropChoiceOpen(false);
    const custName = getCustomerName(fileDropTargetJob);
    setFileDropCustomerId(fileDropTargetJob?.customer_id || "");
    setFileDropCustomerName(custName || "");
    setFileDropNewJobForm({ name: fileDropPendingFiles[0]?.name.replace(/\.[^.]+$/, "") || "", reference_number: "", priority: fileDropTargetJob?.priority || "medium", category: fileDropTargetJob?.category || "general" });
    setFileDropDialogOpen(true);
  };

  const handleFolderFileDrop = (customerName: string, files: File[]) => {
    if (customerName === "Unassigned") {
      setFileDropCustomerId("");
      setFileDropCustomerName("");
    } else {
      // Find customer_id from name
      const cust = customers.find((c) => c.name === customerName);
      setFileDropCustomerId(cust?.id || "");
      setFileDropCustomerName(customerName);
    }
    setFileDropPendingFiles(files);
    setFileDropNewJobForm({ name: files[0]?.name.replace(/\.[^.]+$/, "") || "", reference_number: "", priority: "medium", category: "general" });
    setFileDropDialogOpen(true);
  };

  const handleFileDropCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || fileDropPendingFiles.length === 0) return;

    const parsed = jobSchema.safeParse({ ...fileDropNewJobForm, customer_id: fileDropCustomerId });
    if (!parsed.success) {
      toast({ title: "Validation error", description: parsed.error.errors[0]?.message || "Invalid input", variant: "destructive" });
      return;
    }

    setFileDropUploading(true);
    const { data: newJob, error: jobError } = await supabase.from("jobs").insert({
      name: parsed.data.name,
      ...(parsed.data.reference_number ? { reference_number: parsed.data.reference_number } : {}),
      customer_id: fileDropCustomerId || null,
      customer: fileDropCustomerName || null,
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

    await uploadFilesAsSubmissions(fileDropPendingFiles, newJob.id, user.id);

    // Auto-attach matching job sheet template
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
            prefilled[f.id] = fileDropCustomerName;
          } else if ((label.includes("site") && label.includes("detail")) || label === "site address" || label === "address") {
            prefilled[f.id] = "";
          } else if (label.includes("po number") || label.includes("reference")) {
            prefilled[f.id] = newJob.reference_number || parsed.data.reference_number || "";
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

  const handleDialogFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();

    // Try dataTransfer.items first (works better with email clients like Outlook/Gmail)
    let file: File | null = null;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === "file") {
          file = item.getAsFile();
          if (file) break;
        }
      }
    }
    // Fallback to files array
    if (!file && e.dataTransfer.files.length > 0) {
      file = e.dataTransfer.files[0];
    }

    if (!file) {
      toast({ title: "No file detected", description: "Could not read the dragged file. Try saving the attachment first, then dropping it here.", variant: "destructive" });
      return;
    }

    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".pdf", ".doc", ".docx"].includes(ext)) {
      toast({ title: "Unsupported file", description: "Drop a PDF or Word document to auto-fill.", variant: "destructive" });
      return;
    }
    const resolvedFile = file;
    setDialogParsedFile(resolvedFile);
    setDialogParsingFile(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(resolvedFile);
      });
      const { data, error } = await supabase.functions.invoke("parse-po-document", {
        body: { file_base64: base64, file_name: resolvedFile.name },
      });
      if (error || data?.error) throw new Error(error?.message || data?.error || "Parse failed");
      const ext2: any = data?.data || {};
      const matchedCustomer = customers.find(
        (c) => c.name.toLowerCase() === (ext2.customer_name || "").toLowerCase()
      );
      setForm((prev) => ({
        ...prev,
        name: ext2.job_description || ext2.po_number || resolvedFile.name.replace(/\.[^.]+$/, ""),
        reference_number: ext2.po_number || prev.reference_number,
        customer_id: matchedCustomer?.id || prev.customer_id,
        address: ext2.address || prev.address,
        priority: ["high", "medium", "low"].includes(ext2.priority || "") ? ext2.priority : prev.priority,
        due_date: ext2.due_date || prev.due_date,
      }));
      toast({ title: "Details extracted", description: "Form pre-filled from document. Review and adjust as needed." });
    } catch (err: any) {
      toast({ title: "Could not extract details", description: err.message || "Please fill in manually.", variant: "destructive" });
    } finally {
      setDialogParsingFile(false);
    }
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

    // Resolve customer name for backward compat
    const selectedCustomer = customers.find((c) => c.id === form.customer_id);
    const customerName = selectedCustomer?.name || null;

    const { data: createdJob, error } = await supabase.from("jobs").insert({
      name: parsed.data.name,
      ...(parsed.data.reference_number ? { reference_number: parsed.data.reference_number } : {}),
      customer_id: form.customer_id || null,
      customer: customerName,
      address: form.address || null,
      priority: form.priority,
      category: form.category,
      status: statusOverride || "active",
      created_by: user?.id,
      pressure_test_qty: form.pressure_test_qty || 0,
      visual_qty: form.visual_qty || 0,
      other_qty: form.other_qty || 0,
      other_service_type: form.other_service_type || null,
      due_date: form.due_date || null,
      allocated_days: form.allocated_days ? parseInt(form.allocated_days) : null,
    } as any).select("id, reference_number").single();
    if (error) {
      if (import.meta.env.DEV) console.error("Job creation error:", error);
      const message = error.code === "23505"
        ? "A job with this reference number already exists."
        : "Failed to create job. Please try again.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } else {
      toast({ title: statusOverride === "scheduled" ? "Job created & submitted to planner" : "Job created" });
      setForm({ name: "", reference_number: "", customer_id: "", address: "", priority: "medium", category: "general", pressure_test_qty: 0, visual_qty: 0, other_qty: 0, other_service_type: "", due_date: "", allocated_days: "" });
      setDialogOpen(false);
      setDialogParsedFile(null);
      const capturedCostingSheet = costingSheetFile;
      setCostingSheetFile(null);
      setLoading(false);
      fetchJobs();

      if (createdJob && capturedCostingSheet) {
        // Upload costing sheet and process it
        const processCosting = async () => {
          try {
            setCostingSheetProcessing(true);
            const filePath = `costing-sheets/${createdJob.id}/${capturedCostingSheet.name}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from("submissions")
              .upload(filePath, capturedCostingSheet, { upsert: true });
            if (uploadError) throw uploadError;
            const { data: signedData } = await supabase.storage
              .from("submissions")
              .createSignedUrl(filePath, 3600);
            const fileUrl = signedData?.signedUrl;
            if (!fileUrl) throw new Error("Could not get file URL");
            const { data: fnData, error: fnError } = await supabase.functions.invoke("parse-costing-sheet", {
              body: { file_url: fileUrl, job_id: createdJob.id, user_id: user?.id },
            });
            if (fnError) throw fnError;
            const count = fnData?.parts?.length ?? 0;
            const days = fnData?.allocated_days;
            toast({
              title: "Costing sheet processed",
              description: `${count} material(s) imported${days ? `, ${days} allocated day(s) set` : ""}.`,
            });
          } catch (err: any) {
            toast({ title: "Costing sheet processing failed", description: err.message || "Could not extract materials.", variant: "destructive" });
          } finally {
            setCostingSheetProcessing(false);
            fetchJobs();
          }
        };
        processCosting();
      }


      if (createdJob) {
        // Fetch templates for the job category, plus pressure_test/visual if quantities are set
        const categoriesToFetch = new Set<string>();
        categoriesToFetch.add(form.category);
        if (form.pressure_test_qty > 0) categoriesToFetch.add("pressure_test");
        if (form.visual_qty > 0) categoriesToFetch.add("visual");

        const { data: matchingTemplates } = await supabase
          .from("job_sheet_templates")
          .select("id, name, fields")
          .in("category", Array.from(categoriesToFetch));
        if (matchingTemplates && matchingTemplates.length > 0) {
          for (const tpl of matchingTemplates) {
            const tplName = (tpl.name || "").toLowerCase();
            // Determine how many copies based on service type quantities
            let copies = 1;
            if (tplName.includes("pressure") && form.pressure_test_qty > 0) {
              copies = form.pressure_test_qty;
            } else if (tplName.includes("visual") && form.visual_qty > 0) {
              copies = form.visual_qty;
            } else if (tplName.includes("pressure") && form.pressure_test_qty === 0) {
              continue; // Skip pressure test template if qty is 0
            } else if (tplName.includes("visual") && form.visual_qty === 0) {
              continue; // Skip visual template if qty is 0
            }

            const fields = (typeof tpl.fields === "string" ? JSON.parse(tpl.fields) : tpl.fields) as any[];
            const address = form.address || "";
            const category = form.category || "";

            for (let copyIndex = 0; copyIndex < copies; copyIndex++) {
              const riserLabel = copies > 1 ? `Riser ${copyIndex + 1}` : "";
              const prefilled: Record<string, any> = {};
              fields.forEach((f: any) => {
                const label = (f.label || "").toLowerCase();
                if (label.includes("riser") && label.includes("location")) {
                  prefilled[f.id] = riserLabel;
                } else if (label.includes("customer") && (label.includes("detail") || label.includes("name") || label.includes("site"))) {
                  prefilled[f.id] = customerName || "";
                } else if ((label.includes("site") && label.includes("detail")) || label === "site address" || label === "address") {
                  prefilled[f.id] = address;
                } else if (label.includes("po number") || label.includes("reference")) {
                  prefilled[f.id] = createdJob.reference_number || parsed.data.reference_number || "";
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
                submitted_by: user!.id,
                status: "draft",
                responses: prefilled,
              } as any);
            }
          }
        }


        if (form.customer_id) {
          supabase.functions.invoke("notify-customer", {
            body: { job_id: createdJob.id, notification_type: "job_booked" },
          });
        }

        // Auto-save map pin image if address is provided
        if (form.address?.trim() && user?.id) {
          saveMapPinForJob({
            jobId: createdJob.id,
            address: form.address.trim(),
            refNumber: createdJob.reference_number || "",
            customerName: customerName || "",
            userId: user.id,
          });
        }

        // Generate AI job brief in background and save to job record
        generateAndSaveAiBrief({
          id: createdJob.id,
          name: form.name,
          reference_number: createdJob.reference_number,
          category: form.category,
          priority: form.priority,
          customer: customerName || undefined,
          address: form.address || undefined,
          status: statusOverride || "active",
          due_date: form.due_date || undefined,
          visual_qty: form.visual_qty || undefined,
          pressure_test_qty: form.pressure_test_qty || undefined,
          other_service_type: form.other_service_type || undefined,
        });
      }
    }
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

    const currentClient = getCustomerName(draggedJob)?.trim() || "Unassigned";
    if (currentClient === targetFolder) return;

    await reassignJob(draggedJob, targetFolder);
  };

  const reassignJob = async (draggedJob: any, targetFolder: string) => {
    if (targetFolder === "Unassigned") {
      setJobs((prev) =>
        prev.map((j) => (j.id === draggedJob.id ? { ...j, customer: null, customer_id: null, customers: null } : j))
      );
      const { error } = await supabase.from("jobs").update({ customer: null, customer_id: null } as any).eq("id", draggedJob.id);
      if (error) {
        toast({ title: "Error", description: "Failed to reassign job.", variant: "destructive" });
        fetchJobs();
      } else {
        toast({ title: "Job reassigned", description: `Moved to ${targetFolder}` });
      }
    } else {
      // Find customer by name
      const cust = customers.find((c) => c.name === targetFolder);
      const newCustomerId = cust?.id || null;
      setJobs((prev) =>
        prev.map((j) => (j.id === draggedJob.id ? { ...j, customer: targetFolder, customer_id: newCustomerId, customers: cust ? { id: cust.id, name: cust.name } : null } : j))
      );
      const { error } = await supabase.from("jobs").update({ customer: targetFolder, customer_id: newCustomerId } as any).eq("id", draggedJob.id);
      if (error) {
        toast({ title: "Error", description: "Failed to reassign job.", variant: "destructive" });
        fetchJobs();
      } else {
        toast({ title: "Job reassigned", description: `Moved to ${targetFolder}` });
      }
    }
  };

  const handleNewCustomerConfirm = async () => {
    const trimmed = newCustomerName.trim();
    if (!trimmed || !pendingNewCustomerJob) return;
    setNewCustomerDialogOpen(false);

    // Create customer record if it doesn't exist
    let cust = customers.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (!cust) {
      const { data: newCust } = await supabase.from("customers").insert({ name: trimmed, created_by: user?.id } as any).select("id, name").single();
      if (newCust) {
        cust = newCust;
        setCustomers((prev) => [...prev, newCust].sort((a, b) => a.name.localeCompare(b.name)));
      }
    }

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
    // Update jobs' customer text AND the customer record name
    const cust = customers.find((c) => c.name === renamingFolder);
    if (cust) {
      await supabase.from("customers").update({ name: trimmed } as any).eq("id", cust.id);
    }
    const { error } = await supabase.from("jobs").update({ customer: trimmed } as any).eq("customer", renamingFolder);
    if (error) {
      toast({ title: "Error", description: "Failed to rename folder.", variant: "destructive" });
    } else {
      setJobs((prev) => prev.map((j) => getCustomerName(j) === renamingFolder ? { ...j, customer: trimmed, customers: j.customers ? { ...j.customers, name: trimmed } : null } : j));
      setKnownCustomers((prev) => {
        const updated = new Set(prev);
        updated.delete(renamingFolder);
        updated.add(trimmed);
        return updated;
      });
      setOpenFolders((prev) => prev.map((f) => f === renamingFolder ? trimmed : f));
      setCustomers((prev) => prev.map((c) => c.name === renamingFolder ? { ...c, name: trimmed } : c));
      toast({ title: "Folder renamed", description: `"${renamingFolder}" → "${trimmed}"` });
    }
    setRenameDialogOpen(false);
  };

  const filtered = jobs.filter((j) => {
    if (statusFilter !== "all" && j.status !== statusFilter) return false;
    if (priorityFilter !== "all" && j.priority !== priorityFilter) return false;
    if (categoryFilter !== "all" && j.category !== categoryFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    const custName = getCustomerName(j) || "";
    return (
      j.name.toLowerCase().includes(s) ||
      j.reference_number.toLowerCase().includes(s) ||
      custName.toLowerCase().includes(s)
    );
  });

  // Global select-all derived state (must come after filtered)
  const allFilteredIds = filtered.map((j) => j.id);
  const allFilteredSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedJobIds.has(id));
  const someFilteredSelected = !allFilteredSelected && allFilteredIds.some((id) => selectedJobIds.has(id));
  const handleSelectAllFiltered = (checked: boolean) => {
    setSelectedJobIds(checked ? new Set(allFilteredIds) : new Set());
  };

  const grouped = filtered.reduce<Record<string, any[]>>((acc, job) => {
    const key = getCustomerName(job)?.trim() || "Unassigned";
    if (!acc[key]) acc[key] = [];
    acc[key].push(job);
    return acc;
  }, {});

  if (activeJob) {
    const sourceFolder = getCustomerName(activeJob)?.trim() || "Unassigned";
    if (!grouped[sourceFolder]) grouped[sourceFolder] = [];
  }

  for (const name of knownCustomers) {
    if (!grouped[name]) grouped[name] = [];
  }

  const customerNames = Object.keys(grouped).sort((a, b) => {
    if (a === "Unassigned") return 1;
    if (b === "Unassigned") return -1;
    return a.localeCompare(b);
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setKnownCustomers((prev) => {
      const updated = new Set(prev);
      let changed = false;
      for (const job of jobs) {
        const name = getCustomerName(job)?.trim();
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
    if (files.length === 0) return;

    // If a single PDF/Word file is dropped, offer PO import
    if (files.length === 1) {
      const f = files[0];
      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
      if ([".pdf", ".doc", ".docx"].includes(ext)) {
        setPoImportFile(f);
        setPoImportOpen(true);
        return;
      }
    }

    // Otherwise fall back to folder/bulk import
    setFolderImportOpen(true);
    setTimeout(() => folderImportRef.current?.processFiles(files), 100);
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
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5 backdrop-blur-sm"
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); fileDragCounter.current--; if (fileDragCounter.current === 0) setFileDragging(false); }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={handleFileDrop}
        >
          <div className="flex flex-col items-center gap-2 text-primary">
            <FolderOpen className="h-10 w-10" />
            <p className="font-semibold">Drop a PDF / Word file to create a job from PO</p>
            <p className="text-sm opacity-75">Or drop multiple files to import a folder</p>
          </div>
        </div>
      )}
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>
      <TodaysDashboard />
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Jobs</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreHorizontal className="mr-1.5 h-4 w-4" /> More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setFolderImportOpen(true)}>
                  <FolderOpen className="mr-2 h-4 w-4" /> Import Folder
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setBulkImportOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" /> Import CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setForm({ name: "", reference_number: "", customer_id: "", address: "", priority: "medium", category: "general", pressure_test_qty: 0, visual_qty: 0, other_qty: 0, other_service_type: "", due_date: "", allocated_days: "" }); setDialogParsedFile(null); setDialogParsingFile(false); } }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-2 h-4 w-4" /> New Job</Button>
              </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle>Create New Job</DialogTitle>
                  {jobTemplates.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" type="button">
                          <BookTemplate className="mr-1 h-3.5 w-3.5" /> Templates <ChevronDown className="ml-1 h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {jobTemplates.map((tpl) => (
                          <DropdownMenuItem key={tpl.id} onClick={() => handleLoadTemplate(tpl)}>{tpl.name}</DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                {/* Drag-drop AI extraction zone */}
                <div
                  onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDialogFileDrop(e); }}
                  className="flex items-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/25 px-4 py-3 text-sm text-muted-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-default"
                >
                  {dialogParsingFile ? (
                    <>
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                      <span className="text-primary font-medium">Reading document…</span>
                    </>
                  ) : dialogParsedFile ? (
                    <>
                      <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate"><span className="font-medium text-foreground">{dialogParsedFile.name}</span> — form pre-filled. Drop another to replace.</span>
                      <button type="button" className="ml-auto shrink-0 text-muted-foreground hover:text-destructive" onClick={() => setDialogParsedFile(null)}><X className="h-3.5 w-3.5" /></button>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 shrink-0" />
                      <span>Drop a PDF or Word doc to auto-fill from a purchase order</span>
                    </>
                  )}
                </div>
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
                  <Select value={form.customer_id || "__none__"} onValueChange={(v) => setForm({ ...form, customer_id: v === "__none__" ? "" : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No customer</SelectItem>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
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
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Service Type & Quantity</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <Label className="whitespace-nowrap text-xs font-normal">Pressure Test</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.pressure_test_qty}
                        onChange={(e) => setForm({ ...form, pressure_test_qty: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="h-8 w-20"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="whitespace-nowrap text-xs font-normal">Visual</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.visual_qty}
                        onChange={(e) => setForm({ ...form, visual_qty: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="h-8 w-20"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Label className="whitespace-nowrap text-xs font-normal">Other</Label>
                    <Input
                      placeholder="Service type e.g. Wet Riser"
                      value={form.other_service_type}
                      onChange={(e) => setForm({ ...form, other_service_type: e.target.value })}
                      className="h-8 flex-1"
                    />
                    <Input
                      type="number"
                      min={0}
                      value={form.other_qty}
                      onChange={(e) => setForm({ ...form, other_qty: Math.max(0, parseInt(e.target.value) || 0) })}
                      className="h-8 w-20"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Due Date <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                    <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Allocated Days <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                    <Input type="number" min={1} placeholder="e.g. 5" value={form.allocated_days} onChange={(e) => setForm({ ...form, allocated_days: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1" disabled={loading}>
                    {loading ? "Creating..." : "Create Job"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={loading}
                    onClick={(e) => handleCreate(e as any, "scheduled")}
                  >
                    {loading ? "..." : "Submit to Planner"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Save as template"
                    onClick={() => setSaveTemplateOpen(true)}
                  >
                    <Save className="h-4 w-4" />
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

      {/* Search & filter bar — visually separated from the job list */}
      <div className="mb-6 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9 bg-background" placeholder="Search jobs..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button
            variant={showFilters || statusFilter !== "all" || priorityFilter !== "all" || categoryFilter !== "all" ? "secondary" : "outline"}
            size="icon"
            onClick={() => setShowFilters((v) => !v)}
            title="Toggle filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
          {(statusFilter !== "all" || priorityFilter !== "all" || categoryFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => { setStatusFilter("all"); setPriorityFilter("all"); setCategoryFilter("all"); }}
            >
              Clear
            </Button>
          )}
        </div>
        {showFilters && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] bg-background">
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
              <SelectTrigger className="w-[130px] bg-background">
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
              <SelectTrigger className="w-[150px] bg-background">
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
        )}
      </div>

      {isAdmin && selectedJobIds.size > 0 && (
        <div className="mb-4 rounded-lg border px-4 py-3 transition-colors bg-primary/5 border-primary/30">
          <div className="flex flex-wrap items-center gap-2">
            {/* Global select-all checkbox */}
            <div className="flex items-center gap-2 mr-1">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                checked={allFilteredSelected}
                ref={(el) => { if (el) el.indeterminate = someFilteredSelected; }}
                onChange={(e) => handleSelectAllFiltered(e.target.checked)}
                title="Select / deselect all visible jobs"
              />
              <span className="text-sm font-semibold text-primary">{selectedJobIds.size} selected</span>
            </div>

            {selectedJobIds.size > 0 && (
              <>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setSelectedJobIds(new Set())}>
                  <X className="mr-1 h-3 w-3" /> Clear <span className="ml-1 text-muted-foreground">(Esc)</span>
                </Button>
                <div className="h-4 w-px bg-border mx-1" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs">Status <ChevronDown className="ml-1 h-3 w-3" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {["active","in_progress","scheduled","awaiting_parts","on_hold","requires_revisit","completed","archived"].map((s) => (
                      <DropdownMenuItem key={s} onClick={() => handleBulkStatusChange(s)} className="capitalize">{s.replace(/_/g, " ")}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs">Priority <ChevronDown className="ml-1 h-3 w-3" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {["high","medium","low"].map((p) => (
                      <DropdownMenuItem key={p} onClick={() => handleBulkPriorityChange(p)} className="capitalize">{p}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {engineers.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs">Assign Engineer <ChevronDown className="ml-1 h-3 w-3" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {engineers.map((e) => (
                        <DropdownMenuItem key={e.user_id} onClick={() => handleBulkAssignEngineer(e.user_id)}>{e.full_name}</DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleBulkExportCsv}>
                  <Download className="mr-1.5 h-3 w-3" /> Export CSV
                </Button>
                <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="h-7 text-xs ml-auto">
                      <Trash2 className="mr-1.5 h-3 w-3" /> Delete {selectedJobIds.size}
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
                      <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleBulkDelete}>
                        Delete {selectedJobIds.size} Job(s)
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>
      )}



      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            {jobs.length === 0 ? (
              <>
                <Briefcase className="h-12 w-12 text-muted-foreground/40" />
                <div>
                  <p className="font-semibold text-foreground">No jobs yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">Create your first job to start tracking work for your customers.</p>
                </div>
                {isAdmin && (
                  <Button size="sm" onClick={() => setDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Create First Job
                  </Button>
                )}
              </>
            ) : (
              <>
                <Search className="h-10 w-10 text-muted-foreground/40" />
                <div>
                  <p className="font-semibold text-foreground">No jobs match your filters</p>
                  <p className="mt-1 text-sm text-muted-foreground">Try adjusting your search or clearing filters.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); setPriorityFilter("all"); setCategoryFilter("all"); }}>
                  Clear filters
                </Button>
              </>
            )}
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
                statusColor={getStatusColor}
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
                onQuickSchedule={(job) => { setQuickScheduleJob(job); setQuickScheduleOpen(true); }}
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
              <Input value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} placeholder="Enter new customer name" autoFocus required />
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">{pendingNewCustomerJob?.reference_number}</span> — {pendingNewCustomerJob?.name} will be moved to this folder.
            </p>
            <Button type="submit" className="w-full" disabled={!newCustomerName.trim()}>Create & Move</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename Customer Folder</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleRenameConfirm(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>New Name</Label>
              <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus required />
            </div>
            <Button type="submit" className="w-full" disabled={!renameValue.trim() || renameValue.trim() === renamingFolder}>Rename</Button>
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
                  {isImageFile(file.name)
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
                <p className="text-xs text-muted-foreground">Create a sibling job{getCustomerName(fileDropTargetJob) ? ` under ${getCustomerName(fileDropTargetJob)}` : ""} with these files</p>
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
                      {isImageFile(file.name)
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
            {fileDropCustomerName && (
              <div className="space-y-2">
                <Label>Customer</Label>
                <Input value={fileDropCustomerName} disabled />
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

      {/* Quick Schedule Dialog */}
      <QuickScheduleDialog
        job={quickScheduleJob}
        open={quickScheduleOpen}
        onOpenChange={setQuickScheduleOpen}
        onScheduled={fetchJobs}
      />

      {/* PO Import Dialog */}
      <PoImportDialog
        open={poImportOpen}
        onOpenChange={setPoImportOpen}
        file={poImportFile}
        onJobCreated={fetchJobs}
      />

      {/* Save as Template Dialog */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Save className="h-4 w-4" /> Save as Template</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Save the current job settings (category, priority, quantities) as a reusable template.</p>
          <div className="space-y-2">
            <Label>Template Name</Label>
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Annual Fire Inspection"
              autoFocus
            />
          </div>
          <Button className="w-full" disabled={!templateName.trim()} onClick={handleSaveTemplate}>
            Save Template
          </Button>
        </DialogContent>
      </Dialog>

      {/* Mobile FAB — only visible on small screens for admin users */}
      {isAdmin && (
        <button
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 sm:hidden"
          onClick={() => setDialogOpen(true)}
          aria-label="Create new job"
          title="Create new job"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
