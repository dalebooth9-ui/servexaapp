import { useEffect, useState, useCallback, useRef } from "react";
import { useAutoSave } from "@/hooks/useAutoSave";
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
import { Checkbox } from "@/components/ui/checkbox";
import { fuzzyFilter } from "@/lib/fuzzyMatch";
import CustomerCombobox from "@/components/CustomerCombobox";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, FolderOpen, Trash2, Upload, ArrowLeft, Loader2, FileText, Image, X, BookTemplate, Save, ChevronDown, SlidersHorizontal, MoreHorizontal, Sparkles, Download, CheckSquare, Briefcase, FileSpreadsheet, ScanLine, Printer } from "lucide-react";
import SiteSheetPrintDialog from "@/components/SiteSheetPrintDialog";
import { ToastAction } from "@/components/ui/toast";
import BulkImportDialog from "@/components/BulkImportDialog";
import FolderImportDialog, { type FolderImportDialogHandle } from "@/components/FolderImportDialog";
import ScanCompletedJobDialog from "@/components/ScanCompletedJobDialog";
import PaperScanQueueBadge from "@/components/paper-scan/PaperScanQueueBadge";
import ReferenceFilesDropzone, { DeferredReferenceFilesList } from "@/components/ReferenceFilesDropzone";
import { uploadReferenceFiles } from "@/lib/uploadReferenceFile";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { buildOrgPathAsync } from "@/lib/orgStoragePath";
import DroppedPoFilesReorder from "@/components/jobs/DroppedPoFilesReorder";

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
  const { userRole, user, effectiveUserId, isPreviewingAsEngineer, previewEngineerId } = useAuth();
  const isEngineerView = userRole === "engineer";
  const isGenericEngineerPreview = isPreviewingAsEngineer && !previewEngineerId;
  const { toast } = useToast();
  const { categories } = useJobCategories();
  const { uploadFilesAsSubmissions } = useFileUpload();
  const { deleteWithUndo } = useUndoAction();
  const [jobs, setJobs] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm, clearJobFormDraft] = useAutoSave("job-create-form", { name: "", reference_number: "", customer_po: "", customer_id: "", address: "", priority: "medium", category: "general", pressure_test_qty: 0, visual_qty: 0, other_qty: 0, other_service_type: "", due_date: "", allocated_days: "" });
  const [loading, setLoading] = useState(false);
  const [costingSheetFile, setCostingSheetFile] = useState<File | null>(null);
  const [costingSheetProcessing, setCostingSheetProcessing] = useState(false);
  const [newJobReferenceFiles, setNewJobReferenceFiles] = useState<File[]>([]);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [folderImportOpen, setFolderImportOpen] = useState(false);
  const [scanPaperOpen, setScanPaperOpen] = useState(false);
  const [scanInitialFile, setScanInitialFile] = useState<File | null>(null);
  const [siteSheetJobId, setSiteSheetJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<any>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
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
  const PENDING_SELECTION_KEY = "jobs:selectedPendingIds";
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(PENDING_SELECTION_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === "string")) : new Set();
    } catch {
      return new Set();
    }
  });

  // Persist selection to localStorage whenever it changes.
  useEffect(() => {
    try {
      if (selectedPendingIds.size === 0) {
        localStorage.removeItem(PENDING_SELECTION_KEY);
      } else {
        localStorage.setItem(PENDING_SELECTION_KEY, JSON.stringify(Array.from(selectedPendingIds)));
      }
    } catch {
      // ignore quota/availability errors
    }
  }, [selectedPendingIds]);

  // Keep selection in sync with the live jobs list — drop any IDs that are
  // no longer pending_review (approved, rejected, deleted, etc.).
  // Skip pruning until jobs have actually loaded so a refresh doesn't wipe
  // restored selections before data arrives.
  useEffect(() => {
    if (jobs.length === 0) return;
    setSelectedPendingIds((prev) => {
      if (prev.size === 0) return prev;
      const stillPending = new Set(
        jobs.filter((j) => j.status === "pending_review").map((j) => j.id)
      );
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (stillPending.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [jobs]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState("");
  const [bulkPriorityValue, setBulkPriorityValue] = useState("");
  const [bulkEngineerValue, setBulkEngineerValue] = useState("");
  const [engineers, setEngineers] = useState<{ user_id: string; full_name: string }[]>([]);
  const [jobTemplates, setJobTemplates] = useState<any[]>([]);
  // Blank-job-sheet counts for pending-review jobs — used to warn the reviewer
  // when a PO-intake job has no sheets and would otherwise reach an engineer empty.
  const [pendingSheetCounts, setPendingSheetCounts] = useState<Record<string, number>>({});
  const [sheetTemplates, setSheetTemplates] = useState<{ id: string; name: string; category: string | null; job_category: string | null }[]>([]);

  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [quickScheduleJob, setQuickScheduleJob] = useState<any>(null);
  const [quickScheduleOpen, setQuickScheduleOpen] = useState(false);
  const [fileDragging, setFileDragging] = useState(false);
  const [dialogParsingFile, setDialogParsingFile] = useState(false);
  const [dialogParsedFiles, setDialogParsedFiles] = useState<File[]>([]);
  const dialogFileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileDropUploading, setFileDropUploading] = useState(false);
  const [fileDropDialogOpen, setFileDropDialogOpen] = useState(false);
  const [fileDropChoiceOpen, setFileDropChoiceOpen] = useState(false);
  const [fileDropTargetJob, setFileDropTargetJob] = useState<any>(null);
  const [fileDropCustomerId, setFileDropCustomerId] = useState("");
  const [fileDropCustomerName, setFileDropCustomerName] = useState("");
  const [fileDropPendingFiles, setFileDropPendingFiles] = useState<File[]>([]);
  const [poImportOpen, setPoImportOpen] = useState(false);
  const [poImportFile, setPoImportFile] = useState<File | null>(null);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeSource, setMergeSource] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const poDropRef = useRef<HTMLDivElement | null>(null);
  const poDragCounter = useRef(0);
  const [fileDropNewJobForm, setFileDropNewJobForm] = useState({ name: "", reference_number: "", priority: "medium", category: "general" });
  const fileDragCounter = useRef(0);
  const folderImportRef = useRef<FolderImportDialogHandle | null>(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilters, setCategoryFilters] = useState<string[]>(() => {
    try {
      const raw = sessionStorage.getItem("jobs-category-filters");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
    } catch { return []; }
  });
  useEffect(() => {
    try { sessionStorage.setItem("jobs-category-filters", JSON.stringify(categoryFilters)); } catch {}
  }, [categoryFilters]);
  const toggleCategoryFilter = (slug: string) => {
    setCategoryFilters((prev) => prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]);
  };
  const [showFilters, setShowFilters] = useState(false);
  // Visible primary status tab — Active (default), Pending Review, Completed, All
  const [statusTab, setStatusTab] = useState<"active" | "pending_review" | "completed" | "rejected" | "all">("active");
  const includeArchived = statusTab === "completed" || statusTab === "all";

  const [pageSize, setPageSize] = useState(300);
  const [hasMore, setHasMore] = useState(false);
  const firstLoadRef = useRef(true);
  const renderTimerRef = useRef(false);
  if (!renderTimerRef.current) {
    renderTimerRef.current = true;
    // eslint-disable-next-line no-console
    console.time("jobs-page-render");
  }
  useEffect(() => {
    // Log time to first paint of the page (after initial render commit)
    // eslint-disable-next-line no-console
    console.timeEnd("jobs-page-render");
  }, []);

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

    // Published job-sheet templates for the pending-review quick picker
    supabase
      .from("job_sheet_templates")
      .select("id, name, category, job_category")
      .eq("status", "published")
      .order("name")
      .then(({ data }) => setSheetTemplates((data as any) || []));
  }, []);


  const isAdmin = userRole === "admin";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchJobs = async () => {
    const COLUMNS = "id, reference_number, customer_po, name, customer, customer_id, site_id, address, status, priority, category, due_date, created_at, source, result, pressure_test_qty, visual_qty, other_qty, other_service_type, rejection_reason, template_mismatch_reason, detected_work_types, submissions(id, type), customers(id, name, email), sites(id, name, address, postcode)";
    let query = supabase.from("jobs").select(COLUMNS).order("created_at", { ascending: false });
    // When user is actively searching, fetch across ALL statuses so completed jobs
    // still surface regardless of the current tab. Otherwise, scope by tab.
    const searching = search.trim().length > 0;
    if (!searching) {
      if (statusTab === "active") {
        query = query.not("status", "in", "(completed,archived,rejected)");
      } else if (statusTab === "pending_review") {
        query = query.eq("status", "pending_review");
      } else if (statusTab === "completed") {
        query = query.eq("status", "completed");
      } else if (statusTab === "rejected") {
        query = query.eq("status", "rejected");
      } else if (statusTab === "all") {
        // "All" excludes rejected — those are archive-only and viewable via the Rejected tab.
        query = query.neq("status", "rejected");
      }
    } else {
      // Searching across statuses — still hide rejected unless the user is on the rejected tab.
      if (statusTab !== "rejected") query = query.neq("status", "rejected");
    }

    query = query.limit(pageSize + 1);
    if (userRole === "engineer" && user) {
      const engineerId = effectiveUserId ?? user.id;
      const { data: assignments } = await supabase
        .from("job_assignments")
        .select("job_id")
        .eq("engineer_id", engineerId);
      const ids = (assignments ?? []).map((a: any) => a.job_id);
      if (ids.length === 0) { setJobs([]); setHasMore(false); return; }
      query = query.in("id", ids);
    }


    const { data } = await query;
    const rows = data || [];
    setHasMore(rows.length > pageSize);
    setJobs(rows.slice(0, pageSize));
  };

  // Debounce refetch when tab or (debounced) search changes
  useEffect(() => {
    const t = setTimeout(() => { fetchJobs(); }, search.trim() ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, statusTab, pageSize, search]);


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

  const handleApproveJob = async (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId) as any;
    if ((pendingSheetCounts[jobId] ?? 0) === 0) {
      const ok = window.confirm(
        "This job has no job sheets attached. The engineer will arrive on site with nothing to fill in.\n\nApprove anyway?"
      );
      if (!ok) return;
    }
    if (job?.template_mismatch_reason) {
      const ok = window.confirm(
        `⚠️ Work-type mismatch:\n\n${job.template_mismatch_reason}\n\nApprove anyway?`
      );
      if (!ok) return;
      await supabase.from("jobs").update({
        approved_with_mismatch: true,
        approved_with_mismatch_by: user?.id,
        approved_with_mismatch_at: new Date().toISOString(),
      } as any).eq("id", jobId);
    }
    const { error } = await supabase.from("jobs").update({ status: "active" } as any).eq("id", jobId);
    if (error) {
      toast({ title: "Error", description: "Failed to approve job.", variant: "destructive" });
    } else {
      setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: "active" } : j)));
      toast({ title: "Job approved", description: "Status set to Active." });
    }
  };

  const handleBulkApprovePending = async (ids: string[]) => {
    if (ids.length === 0) return;
    const emptyCount = ids.filter((id) => (pendingSheetCounts[id] ?? 0) === 0).length;
    if (emptyCount > 0) {
      const ok = window.confirm(
        `${emptyCount} of the ${ids.length} selected job(s) have no job sheets attached. Engineers will arrive with nothing to fill in.\n\nApprove all anyway?`
      );
      if (!ok) return;
    }
    const mismatched = jobs.filter((j) => ids.includes(j.id) && (j as any).template_mismatch_reason);
    if (mismatched.length > 0) {
      const ok = window.confirm(
        `⚠️ ${mismatched.length} of the selected job(s) have a work-type / template mismatch. Approve all anyway?`
      );
      if (!ok) return;
      await supabase.from("jobs").update({
        approved_with_mismatch: true,
        approved_with_mismatch_by: user?.id,
        approved_with_mismatch_at: new Date().toISOString(),
      } as any).in("id", mismatched.map((j) => j.id));
    }
    const { error } = await supabase.from("jobs").update({ status: "active" } as any).in("id", ids);
    if (error) {
      toast({ title: "Error", description: "Failed to approve jobs.", variant: "destructive" });
    } else {
      setJobs((prev) => prev.map((j) => (ids.includes(j.id) ? { ...j, status: "active" } : j)));
      toast({ title: `${ids.length} job(s) approved`, description: "Status set to Active." });
      setSelectedPendingIds(new Set());
    }
  };

  const handleBulkDismissPending = async (ids: string[]) => {
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Dismiss ${ids.length} pending draft(s)? They'll be marked rejected and removed from the review queue. This can't be undone from here.`
    );
    if (!ok) return;
    const { error } = await supabase
      .from("jobs")
      .update({ status: "rejected", rejection_reason: "Bulk-dismissed from Pending Review as duplicate/junk" } as any)
      .in("id", ids);
    if (error) {
      toast({ title: "Error", description: "Failed to dismiss drafts.", variant: "destructive" });
      return;
    }
    setJobs((prev) => prev.map((j) => (ids.includes(j.id) ? { ...j, status: "rejected" } : j)));
    setSelectedPendingIds(new Set());
    toast({ title: `${ids.length} draft(s) dismissed` });
  };

  const [pendingMergeOpen, setPendingMergeOpen] = useState(false);
  const [pendingMergeTargetId, setPendingMergeTargetId] = useState<string>("");

  const openMergeDialog = () => {
    if (selectedPendingIds.size < 2) {
      toast({ title: "Pick at least 2 drafts", description: "Select two or more pending drafts to merge.", variant: "destructive" });
      return;
    }
    setPendingMergeTargetId("");
    setPendingMergeOpen(true);
  };

  const handleMergePending = async () => {
    const ids = Array.from(selectedPendingIds);
    if (!pendingMergeTargetId || !ids.includes(pendingMergeTargetId)) {
      toast({ title: "Pick a target draft", variant: "destructive" });
      return;
    }
    const sourceIds = ids.filter((id) => id !== pendingMergeTargetId);
    // Move documents onto the target, then dismiss the sources.
    const { error: docErr } = await supabase
      .from("job_documents" as any)
      .update({ job_id: pendingMergeTargetId } as any)
      .in("job_id", sourceIds);
    if (docErr) {
      toast({ title: "Merge failed", description: docErr.message, variant: "destructive" });
      return;
    }
    // Best-effort: move any thread notes / messages too.
    await supabase.from("job_messages" as any).update({ job_id: pendingMergeTargetId } as any).in("job_id", sourceIds);
    // Add a note on the target listing what was merged.
    const sourceRefs = jobs.filter((j) => sourceIds.includes(j.id)).map((j) => j.reference_number).filter(Boolean).join(", ");
    await supabase.from("job_messages" as any).insert({
      job_id: pendingMergeTargetId,
      message: `Merged ${sourceIds.length} duplicate draft(s) into this one: ${sourceRefs}. Their attachments and notes have been consolidated here.`,
      author_role: "system",
    } as any);
    // Dismiss the source drafts.
    const { error: rejErr } = await supabase
      .from("jobs")
      .update({ status: "rejected", rejection_reason: `Merged into ${jobs.find((j) => j.id === pendingMergeTargetId)?.reference_number ?? "another draft"}` } as any)
      .in("id", sourceIds);
    if (rejErr) {
      toast({ title: "Sources not dismissed", description: rejErr.message, variant: "destructive" });
      return;
    }
    setJobs((prev) => prev.map((j) => (sourceIds.includes(j.id) ? { ...j, status: "rejected" } : j)));
    setSelectedPendingIds(new Set());
    setPendingMergeOpen(false);
    toast({ title: `Merged ${sourceIds.length} draft(s)`, description: `Consolidated into ${jobs.find((j) => j.id === pendingMergeTargetId)?.reference_number ?? "target draft"}.` });
  };




  // Refresh blank-sheet counts whenever the pending list changes.
  const refreshPendingSheetCounts = useCallback(async (ids: string[]) => {
    if (ids.length === 0) { setPendingSheetCounts({}); return; }
    const { data } = await supabase
      .from("job_documents" as any)
      .select("job_id")
      .eq("document_type", "blank_job_sheet")
      .in("job_id", ids);
    const counts: Record<string, number> = {};
    for (const id of ids) counts[id] = 0;
    for (const row of (data as any[] | null) || []) {
      counts[row.job_id] = (counts[row.job_id] || 0) + 1;
    }
    setPendingSheetCounts(counts);
  }, []);
  useEffect(() => {
    const ids = jobs.filter((j) => j.status === "pending_review").map((j) => j.id);
    refreshPendingSheetCounts(ids);
  }, [jobs, refreshPendingSheetCounts]);

  const handleAttachSheetToPending = async (jobId: string, templateId: string) => {
    const tpl = sheetTemplates.find((t) => t.id === templateId);
    if (!tpl) return;
    const { error } = await supabase.from("job_documents" as any).insert({
      job_id: jobId,
      document_type: "blank_job_sheet",
      label: tpl.name,
      source: "manual",
      created_by: user?.id ?? null,
    } as any);
    if (error) {
      toast({ title: "Could not attach sheet", description: error.message, variant: "destructive" });
      return;
    }
    setPendingSheetCounts((prev) => ({ ...prev, [jobId]: (prev[jobId] || 0) + 1 }));
    toast({ title: "Sheet attached", description: tpl.name });
  };


  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingJob, setRejectingJob] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");

  const openRejectDialog = (job: any) => {
    setRejectingJob(job);
    setRejectReason("");
    setRejectDialogOpen(true);
  };

  const handleRejectJob = async () => {
    if (!rejectingJob) return;
    const reason = rejectReason.trim();
    if (!reason) {
      toast({ title: "Reason required", description: "Please enter a rejection reason.", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("jobs")
      .update({ status: "rejected", rejection_reason: reason } as any)
      .eq("id", rejectingJob.id);
    if (error) {
      toast({ title: "Error", description: "Failed to reject job.", variant: "destructive" });
    } else {
      setJobs((prev) => prev.map((j) => (j.id === rejectingJob.id ? { ...j, status: "rejected", rejection_reason: reason } : j)));
      toast({ title: "Job rejected", description: "Status set to Rejected." });
      setRejectDialogOpen(false);
      setRejectingJob(null);
      setRejectReason("");
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
      .eq("category", fileDropNewJobForm.category)
      .eq("status", "published");
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
    toast({
      title: "Job created",
      description: `${parsed.data.name} created with ${fileDropPendingFiles.length} file(s). Print site sheets?`,
      action: newJob?.id ? (
        <ToastAction altText="Print site sheets" onClick={() => setSiteSheetJobId(newJob.id)}>
          Print site sheets
        </ToastAction>
      ) : undefined,
    });
    fetchJobs();
  };

  const PO_ALLOWED_EXT = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];
  const isPoAllowedFile = (name: string) => PO_ALLOWED_EXT.includes(name.slice(name.lastIndexOf(".")).toLowerCase());

  const addDialogFiles = (incoming: File[]) => {
    const valid: File[] = [];
    const rejected: string[] = [];
    for (const f of incoming) {
      if (isPoAllowedFile(f.name)) valid.push(f);
      else rejected.push(f.name);
    }
    if (rejected.length > 0) {
      toast({
        title: "Unsupported file(s) skipped",
        description: `Accepts PDF, Word or photo (JPG/PNG/HEIC/WEBP). Skipped: ${rejected.join(", ")}`,
        variant: "destructive",
      });
    }
    if (valid.length > 0) {
      setDialogParsedFiles((prev) => [...prev, ...valid]);
    }
  };

  const handleDialogFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const dt = e.dataTransfer;
    const collected: File[] = [];

    const readString = (type: string): Promise<string | null> =>
      new Promise((resolve) => {
        if (dt.items) {
          for (let i = 0; i < dt.items.length; i++) {
            const it = dt.items[i];
            if (it.kind === "string" && it.type === type) {
              it.getAsString((s) => resolve(s));
              return;
            }
          }
        }
        try { resolve(dt.getData(type) || null); } catch { resolve(null); }
      });

    if (dt.files && dt.files.length > 0) {
      for (let i = 0; i < dt.files.length; i++) collected.push(dt.files[i]);
    }
    if (collected.length === 0 && dt.items && dt.items.length > 0) {
      for (let i = 0; i < dt.items.length; i++) {
        const item = dt.items[i];
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f && f.size > 0) collected.push(f);
        }
      }
    }
    if (collected.length === 0) {
      // Fallback for email clients that expose files as URLs / HTML fragments.
      const uriList = (await readString("text/uri-list")) || (await readString("text/plain")) || "";
      const htmlPayload = await readString("text/html");
      const candidates: string[] = [];
      uriList.split(/\r?\n/).forEach((line) => {
        const t = line.trim();
        if (t && !t.startsWith("#") && /^https?:\/\//i.test(t)) candidates.push(t);
      });
      if (htmlPayload) {
        const matches = htmlPayload.match(/https?:\/\/[^"'\s<>]+\.(?:pdf|docx?|jpe?g|png|webp|heic|heif)/gi);
        if (matches) candidates.push(...matches);
      }
      for (const url of candidates) {
        try {
          const resp = await fetch(url, { credentials: "omit" });
          if (!resp.ok) continue;
          const blob = await resp.blob();
          if (blob.size === 0) continue;
          const name = decodeURIComponent(url.split("/").pop()?.split("?")[0] || "document");
          collected.push(new File([blob], name, { type: blob.type || "application/octet-stream" }));
        } catch { /* try next */ }
      }
    }

    if (collected.length === 0) {
      toast({ title: "No file detected", description: "Drop the files again, or use the Choose files button.", variant: "destructive" });
      return;
    }
    addDialogFiles(collected);
  };

  const extractFromDialogFiles = async () => {
    if (dialogParsedFiles.length === 0) return;
    setDialogParsingFile(true);
    try {
      const filesPayload = await Promise.all(
        dialogParsedFiles.map(
          (f) =>
            new Promise<{ file_base64: string; file_name: string }>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve({
                file_base64: (reader.result as string).split(",")[1],
                file_name: f.name,
              });
              reader.onerror = reject;
              reader.readAsDataURL(f);
            })
        )
      );
      const { data, error } = await supabase.functions.invoke("parse-po-document", {
        body: { files: filesPayload },
      });
      if (error || data?.error) throw new Error(error?.message || data?.error || "Parse failed");
      const ext2: any = data?.data || {};
      const matchedCustomer = customers.find(
        (c) => c.name.toLowerCase() === (ext2.customer_name || "").toLowerCase()
      );
      const ptQty = Math.max(0, Number(ext2.pressure_test_qty) || 0);
      const vQty = Math.max(0, Number(ext2.visual_qty) || 0);
      let oQty = Math.max(0, Number(ext2.other_qty) || 0);
      if (ptQty === 0 && vQty === 0 && oQty === 0 && Number(ext2.quantity) > 0) {
        oQty = Number(ext2.quantity);
      }
      const totalSystems = ptQty + vQty + oQty;
      // Build a work-type based name: "<Worktype> — <Customer/Site>".
      // Never use the raw scope prose (e.g. "SCOPE OF WORK: …") as the name.
      const workTypeBits: string[] = [];
      if (ptQty > 0) workTypeBits.push(ptQty > 1 ? `Pressure Test ×${ptQty}` : "Pressure Test");
      if (vQty > 0) workTypeBits.push(vQty > 1 ? `Visual Inspection ×${vQty}` : "Visual Inspection");
      if (oQty > 0 && ext2.other_service_type) workTypeBits.push(oQty > 1 ? `${ext2.other_service_type} ×${oQty}` : ext2.other_service_type);
      const workType = workTypeBits.join(" + ") || "Job";
      const siteBit = (ext2.customer_name || matchedCustomer?.name || ext2.address || "").trim();
      const nameWithCount = siteBit ? `${workType} — ${siteBit}` : workType;
      setForm((prev) => ({
        ...prev,
        name: nameWithCount.slice(0, 200),
        // Do NOT put the paper PO number into reference_number — that field is
        // reserved for our internal VFP sequence (auto-generated on insert).
        // The customer's PO goes into customer_po.
        customer_po: (ext2.po_number || prev.customer_po || "").trim(),
        customer_id: matchedCustomer?.id || prev.customer_id,
        address: ext2.address || prev.address,
        priority: ["high", "medium", "low"].includes(ext2.priority || "") ? ext2.priority : prev.priority,
        due_date: ext2.due_date || prev.due_date,
        pressure_test_qty: ptQty || prev.pressure_test_qty,
        visual_qty: vQty || prev.visual_qty,
        other_qty: oQty || prev.other_qty,
        other_service_type: ext2.other_service_type || prev.other_service_type,
      }));
      toast({
        title: "Details extracted",
        description: `Combined ${dialogParsedFiles.length} file(s). Review and adjust.`,
      });
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
      customer_po: (form.customer_po || "").trim() || null,
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
      toast({
        title: statusOverride === "scheduled" ? "Job created & submitted to planner" : "Job created",
        description: "Print site sheets for the engineer?",
        action: createdJob?.id ? (
          <ToastAction altText="Print site sheets" onClick={() => setSiteSheetJobId(createdJob.id)}>
            Print site sheets
          </ToastAction>
        ) : undefined,
      });
      clearJobFormDraft();
      setForm({ name: "", reference_number: "", customer_po: "", customer_id: "", address: "", priority: "medium", category: "general", pressure_test_qty: 0, visual_qty: 0, other_qty: 0, other_service_type: "", due_date: "", allocated_days: "" });
      setDialogOpen(false);
      const capturedPoFiles = dialogParsedFiles;
      setDialogParsedFiles([]);
      const capturedCostingSheet = costingSheetFile;
      setCostingSheetFile(null);
      const capturedReferenceFiles = newJobReferenceFiles;
      setNewJobReferenceFiles([]);
      setLoading(false);
      fetchJobs();

      if (createdJob && capturedReferenceFiles.length > 0) {
        // Fire-and-forget upload of any reference files staged in the dialog.
        uploadReferenceFiles({
          jobId: createdJob.id,
          files: capturedReferenceFiles,
          userId: user?.id,
        }).then(({ succeeded, failed }) => {
          if (succeeded > 0) {
            toast({
              title: `Attached ${succeeded} reference file${succeeded === 1 ? "" : "s"}`,
              description: failed > 0 ? `${failed} failed — retry from the Documents tab.` : undefined,
            });
          } else if (failed > 0) {
            toast({ title: "Reference file upload failed", variant: "destructive" });
          }
        });
      }

      if (createdJob && capturedPoFiles.length > 0 && user?.id) {
        // Attach every dropped PO page/photo to the newly-created job so the
        // full paper trail lives on the job record.
        uploadFilesAsSubmissions(capturedPoFiles, createdJob.id, user.id).catch((err) => {
          console.error("PO file attach failed", err);
        });
      }



      if (createdJob && capturedCostingSheet) {
        // Upload costing sheet and process it asynchronously
        const processCosting = async () => {
          try {
            setCostingSheetProcessing(true);
            // Sanitise filename — remove spaces & special chars to avoid URL issues
            const safeName = capturedCostingSheet.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const filePath = `costing-sheets/${createdJob.id}/${safeName}`;
            const { error: uploadError } = await supabase.storage
              .from("submissions")
              .upload(await buildOrgPathAsync(filePath), capturedCostingSheet, { upsert: true });
            if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

            // Create a long-lived signed URL (24 h) so the edge function can fetch it
            const { data: signedData, error: signedError } = await supabase.storage
              .from("submissions")
              .createSignedUrl(filePath, 86400);
            if (signedError || !signedData?.signedUrl) {
              throw new Error(`Could not create signed URL: ${signedError?.message ?? "unknown"}`);
            }
            const fileUrl = signedData.signedUrl;

            const { data: fnData, error: fnError } = await supabase.functions.invoke("parse-costing-sheet", {
              body: {
                file_url: fileUrl,
                job_id: createdJob.id,
                user_id: user?.id,
                bucket: "submissions",
              },
            });
            if (fnError) throw new Error(fnError.message);
            if (fnData?.error) throw new Error(fnData.error);

            const count = fnData?.parts?.length ?? 0;
            const days = fnData?.allocated_days;
            toast({
              title: "Costing sheet processed ✓",
              description: `${count} material(s) added to Parts tab${days ? `, ${days} allocated day(s) set` : ""}.`,
            });
            fetchJobs();
          } catch (err: any) {
            toast({
              title: "Costing sheet processing failed",
              description: err.message || "Could not extract materials.",
              variant: "destructive",
            });
          } finally {
            setCostingSheetProcessing(false);
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
          .in("category", Array.from(categoriesToFetch))
          .eq("status", "published");
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
    const data = event.active.data.current;
    if (data?.isFolder) {
      setActiveFolder(data.folderName);
      setActiveJob(null);
    } else {
      setActiveJob(data?.job || null);
      setActiveFolder(null);
    }
  };

  const handleDragOver = (event: any) => {
    const overId = event.over?.id as string | null;
    setOverId(overId || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const wasFolder = activeFolder;
    setActiveJob(null);
    setActiveFolder(null);
    setOverId(null);

    const { active, over } = event;
    if (!over) return;

    // Folder-to-folder merge
    if (wasFolder) {
      const targetFolder = over.data.current?.customerName;
      if (!targetFolder || targetFolder === wasFolder || targetFolder === "__new_customer__") return;
      setMergeSource(wasFolder);
      setMergeTarget(targetFolder);
      setMergeDialogOpen(true);
      return;
    }

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

  const handleMergeConfirm = async () => {
    if (!mergeSource || !mergeTarget) return;
    setMergeDialogOpen(false);

    const targetCust = customers.find((c) => c.name === mergeTarget);
    const targetId = targetCust?.id || null;

    // Update all jobs from source folder to target folder
    const { error } = await supabase.from("jobs").update({ customer: mergeTarget, customer_id: targetId } as any).eq("customer", mergeSource);
    if (error) {
      toast({ title: "Error", description: "Failed to merge folders.", variant: "destructive" });
    } else {
      setJobs((prev) =>
        prev.map((j) =>
          getCustomerName(j)?.trim() === mergeSource
            ? { ...j, customer: mergeTarget, customer_id: targetId, customers: targetCust ? { id: targetCust.id, name: targetCust.name } : null }
            : j
        )
      );
      setKnownCustomers((prev) => {
        const updated = new Set(prev);
        updated.delete(mergeSource);
        return updated;
      });
      setOpenFolders((prev) => prev.filter((f) => f !== mergeSource));
      toast({ title: "Folders merged", description: `All jobs from "${mergeSource}" moved to "${mergeTarget}"` });
    }
    setMergeSource("");
    setMergeTarget("");
  };

  const prefiltered = jobs.filter((j) => {
    if (statusFilter !== "all" && j.status !== statusFilter) return false;
    if (priorityFilter !== "all" && j.priority !== priorityFilter) return false;
    if (categoryFilters.length > 0 && !categoryFilters.includes(j.category)) return false;
    return true;
  });
  const filtered = fuzzyFilter(prefiltered, search, (j) => [
    j.name,
    j.reference_number,
    (j as any).customer_po,
    getCustomerName(j),
    (j as any).address,
    (j as any).sites?.name,
    (j as any).sites?.address,
    (j as any).sites?.postcode,
  ]);

  // Global select-all derived state (must come after filtered)
  const allFilteredIds = filtered.map((j) => j.id);
  const allFilteredSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedJobIds.has(id));
  const someFilteredSelected = !allFilteredSelected && allFilteredIds.some((id) => selectedJobIds.has(id));
  const handleSelectAllFiltered = (checked: boolean) => {
    setSelectedJobIds(checked ? new Set(allFilteredIds) : new Set());
  };

  const pendingReviewJobs = filtered.filter((j) => j.status === "pending_review");

  const grouped = filtered.reduce<Record<string, any[]>>((acc, job) => {
    if (job.status === "pending_review") return acc;
    // Rejected jobs are archive-only — only surface them under the Rejected tab.
    if (job.status === "rejected" && statusTab !== "rejected") return acc;
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
      // On first load, default-collapse all folders except the first 3.
      // After that, preserve whatever the user has open and never auto-open new folders.
      if (firstLoadRef.current && jobs.length > 0) {
        firstLoadRef.current = false;
        return customerNames.slice(0, 3);
      }
      return prev;
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
                <DropdownMenuItem asChild>
                  <Link to="/paper-scans" className="cursor-pointer flex items-center">
                    <ScanLine className="mr-2 h-4 w-4" /> Paper scans
                    <span className="ml-auto"><PaperScanQueueBadge /></span>
                  </Link>
                </DropdownMenuItem>


              </DropdownMenuContent>
            </DropdownMenu>
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setForm({ name: "", reference_number: "", customer_po: "", customer_id: "", address: "", priority: "medium", category: "general", pressure_test_qty: 0, visual_qty: 0, other_qty: 0, other_service_type: "", due_date: "", allocated_days: "" }); setDialogParsedFiles([]); setDialogParsingFile(false); setCostingSheetFile(null); setNewJobReferenceFiles([]); } }}>
              <DialogTrigger asChild>
                <Button size="sm" data-setup="add-job"><Plus className="mr-2 h-4 w-4" /> New Job</Button>
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
                {/* Drag-drop AI extraction zone — multi-file, one job.
                    Mobile has no drag-and-drop, so the whole zone doubles as a
                    file-picker trigger (tap or keyboard). accept covers PDFs,
                    Word docs and phone photos (incl. HEIC from iOS Camera). */}
                <div className="space-y-2">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label="Choose or drop purchase order files"
                    onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDialogFileDrop(e); }}
                    onClick={(e) => {
                      // Ignore clicks on inner buttons (Choose / Extract / Clear)
                      if ((e.target as HTMLElement).closest("button")) return;
                      dialogFileInputRef.current?.click();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        dialogFileInputRef.current?.click();
                      }
                    }}
                    className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/25 px-4 py-3 text-sm text-muted-foreground hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors cursor-pointer"
                  >
                    <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                    <span className="flex-1 min-w-[200px]">
                      {dialogParsedFiles.length === 0
                        ? "Drop a file here or tap to choose — PDF, Word or photos of a purchase order. Multiple files combine into ONE job."
                        : `${dialogParsedFiles.length} file(s) staged — drag thumbnails to reorder, then Extract.`}
                    </span>
                    <input
                      ref={dialogFileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,image/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) addDialogFiles(Array.from(e.target.files));
                        e.target.value = "";
                      }}
                    />
                    <Button type="button" size="sm" variant="outline" onClick={() => dialogFileInputRef.current?.click()}>
                      Choose files
                    </Button>
                    {dialogParsedFiles.length > 0 && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          onClick={extractFromDialogFiles}
                          disabled={dialogParsingFile}
                        >
                          {dialogParsingFile ? (
                            <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Reading…</>
                          ) : (
                            <>Extract from {dialogParsedFiles.length} file(s)</>
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setDialogParsedFiles([])}
                          disabled={dialogParsingFile}
                        >
                          Clear
                        </Button>
                      </>
                    )}
                  </div>
                  {dialogParsedFiles.length > 0 && (
                    <DroppedPoFilesReorder files={dialogParsedFiles} onChange={setDialogParsedFiles} />
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
                  <Label>Customer PO <span className="text-muted-foreground text-xs font-normal">(from paperwork — printed on reports)</span></Label>
                  <Input value={form.customer_po} onChange={(e) => setForm({ ...form, customer_po: e.target.value })} placeholder="e.g. 38896" />
                </div>
                <div className="space-y-2">
                  <Label>Customer</Label>
                  <CustomerCombobox
                    value={form.customer_id}
                    customers={customers}
                    onChange={(v) => setForm({ ...form, customer_id: v })}
                  />
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
                {/* Costing Sheet Upload */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />
                    Costing Sheet <span className="text-muted-foreground text-xs font-normal">(optional — Excel, auto-extracts materials &amp; days)</span>
                  </Label>
                  {costingSheetFile ? (
                    <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                      <FileSpreadsheet className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate flex-1 font-medium text-foreground">{costingSheetFile.name}</span>
                      <button type="button" onClick={() => setCostingSheetFile(null)} className="ml-auto text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-muted-foreground/30 px-3 py-2.5 text-sm text-muted-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors">
                      <Upload className="h-4 w-4 shrink-0" />
                      <span>Click to attach Excel costing sheet (.xlsx, .xls)</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) setCostingSheetFile(f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                  {costingSheetProcessing && (
                    <p className="flex items-center gap-1.5 text-xs text-primary animate-pulse">
                      <Loader2 className="h-3 w-3 animate-spin" /> Processing costing sheet in background…
                    </p>
                  )}
                </div>
                {/* Reference files — internal companion docs, e.g. last year's report */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    Reference files <span className="text-muted-foreground text-xs font-normal">(optional — attached for office reference, not sent to customer)</span>
                  </Label>
                  <ReferenceFilesDropzone
                    mode="deferred"
                    files={newJobReferenceFiles}
                    onFilesChange={setNewJobReferenceFiles}
                    label="Drop last year's report or other reference files"
                  />
                  <DeferredReferenceFilesList files={newJobReferenceFiles} onFilesChange={setNewJobReferenceFiles} />
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
          <ScanCompletedJobDialog
            open={scanPaperOpen}
            onOpenChange={(o) => { setScanPaperOpen(o); if (!o) setScanInitialFile(null); }}
            initialFile={scanInitialFile}
            onRedirectToPo={(f) => { setPoImportFile(f); setPoImportOpen(true); }}
          />

          </div>
        )}
      </div>

      {/* Primary status tabs — completed jobs are one tap away */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {([
          { key: "active", label: "Active" },
          { key: "pending_review", label: "Pending Review" },
          { key: "completed", label: "Completed" },
          { key: "rejected", label: "Rejected" },
          { key: "all", label: "All" },
        ] as const).map((t) => (

          <button
            key={t.key}
            type="button"
            onClick={() => setStatusTab(t.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              statusTab === t.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
        {search.trim() && (
          <span className="self-center pl-2 text-[11px] text-muted-foreground">
            Searching across all statuses
          </span>
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
            variant={showFilters || statusFilter !== "all" || priorityFilter !== "all" || categoryFilters.length > 0 ? "secondary" : "outline"}
            size="icon"
            onClick={() => setShowFilters((v) => !v)}
            title="Toggle filters"
            className="relative"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {(() => {
              const activeCount = (statusFilter !== "all" ? 1 : 0) + (priorityFilter !== "all" ? 1 : 0) + categoryFilters.length;
              return activeCount > 0 ? (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {activeCount}
                </span>
              ) : null;
            })()}
          </Button>
          {(statusFilter !== "all" || priorityFilter !== "all" || categoryFilters.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => { setStatusFilter("all"); setPriorityFilter("all"); setCategoryFilters([]); }}
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
            {(() => {
              const usedSlugs = new Set(jobs.map((j) => j.category).filter(Boolean));
              const catOptions = categories.filter((c) => usedSlugs.has(c.slug));
              // include any slugs present on jobs but missing from the categories table
              const knownSlugs = new Set(catOptions.map((c) => c.slug));
              const orphanSlugs = Array.from(usedSlugs).filter((s) => !knownSlugs.has(s as string)) as string[];
              return (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-10 min-w-[170px] justify-between bg-background font-normal">
                      <span className="truncate">
                        {categoryFilters.length === 0
                          ? "All categories"
                          : categoryFilters.length === 1
                          ? (categories.find((c) => c.slug === categoryFilters[0])?.name || categoryFilters[0])
                          : `${categoryFilters.length} categories`}
                      </span>
                      <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-2">
                    <div className="flex items-center justify-between px-1 pb-2">
                      <span className="text-xs font-medium text-muted-foreground">Filter by category</span>
                      {categoryFilters.length > 0 && (
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => setCategoryFilters([])}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {catOptions.length === 0 && orphanSlugs.length === 0 && (
                        <div className="px-2 py-3 text-xs text-muted-foreground">No categories in use.</div>
                      )}
                      {catOptions.map((c) => (
                        <label key={c.slug} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent cursor-pointer">
                          <Checkbox
                            checked={categoryFilters.includes(c.slug)}
                            onCheckedChange={() => toggleCategoryFilter(c.slug)}
                          />
                          <span className="text-sm">{c.name}</span>
                        </label>
                      ))}
                      {orphanSlugs.map((s) => (
                        <label key={s} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent cursor-pointer">
                          <Checkbox
                            checked={categoryFilters.includes(s)}
                            onCheckedChange={() => toggleCategoryFilter(s)}
                          />
                          <span className="text-sm capitalize">{s.replace(/_/g, " ")}</span>
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              );
            })()}
            <span className="pl-2 text-[11px] text-muted-foreground self-center">
              Use the tabs above to switch between Active, Pending Review, Completed and All.
            </span>

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
                <Button variant="outline" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); setPriorityFilter("all"); setCategoryFilters([]); }}>
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
          {pendingReviewJobs.length > 0 && (
            <div className="mb-4 rounded-lg border-2 border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-600 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-sm font-semibold text-yellow-900 dark:text-yellow-200">
                  <span className="inline-block h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                  Pending Review ({pendingReviewJobs.length})
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-yellow-900 dark:text-yellow-200 cursor-pointer">
                      <Checkbox
                        checked={selectedPendingIds.size === pendingReviewJobs.length && pendingReviewJobs.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedPendingIds(new Set(pendingReviewJobs.map((j) => j.id)));
                          else setSelectedPendingIds(new Set());
                        }}
                      />
                      Select all
                    </label>
                    {selectedPendingIds.size > 0 && (
                      <>
                        <span className="text-xs text-yellow-900 dark:text-yellow-200">{selectedPendingIds.size} selected</span>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white h-7 px-3"
                          onClick={() => handleBulkApprovePending(Array.from(selectedPendingIds))}
                        >
                          Approve selected
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-3"
                          disabled={selectedPendingIds.size < 2}
                          onClick={openMergeDialog}
                          title={selectedPendingIds.size < 2 ? "Select 2+ drafts to merge" : "Merge selected drafts into one"}
                        >
                          Merge into…
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 px-3"
                          onClick={() => handleBulkDismissPending(Array.from(selectedPendingIds))}
                        >
                          Dismiss selected
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setSelectedPendingIds(new Set())}
                        >
                          Clear
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                {pendingReviewJobs.map((j) => {
                  const sheetCount = pendingSheetCounts[j.id] ?? 0;
                  const noSheets = sheetCount === 0;
                  return (
                  <div
                    key={j.id}
                    className={`rounded-md bg-background border px-3 py-2 ${noSheets ? "border-red-400 dark:border-red-700" : "border-yellow-300 dark:border-yellow-700"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      {isAdmin && (
                        <Checkbox
                          checked={selectedPendingIds.has(j.id)}
                          onCheckedChange={(checked) => {
                            setSelectedPendingIds((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(j.id);
                              else next.delete(j.id);
                              return next;
                            });
                          }}
                        />
                      )}
                      <Link to={`/jobs/${j.id}`} className="flex-1 min-w-0 flex items-center gap-2 hover:underline">
                        {(j as any).customer_po ? (
                          <>
                            <span className="font-mono text-xs font-semibold text-primary shrink-0">PO {(j as any).customer_po}</span>
                            <span className="font-mono text-[10px] text-muted-foreground shrink-0">{j.reference_number}</span>
                          </>
                        ) : (
                          <span className="font-mono text-xs font-semibold text-primary shrink-0">{j.reference_number}</span>
                        )}
                        {(j as any).sites?.name && (
                          <span className="text-xs font-medium text-muted-foreground truncate shrink-0">· {(j as any).sites.name}</span>
                        )}
                        <span className="text-sm font-medium truncate">{j.name}</span>
                        <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                          {getCustomerName(j) || "Unassigned"}
                        </span>
                        {j.source && (
                          <Badge variant="outline" className="border-orange-400 bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 text-[10px] h-4 px-1.5">
                            {j.source}
                          </Badge>
                        )}
                        {!noSheets && (
                          <Badge variant="outline" className="border-green-400 bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 text-[10px] h-4 px-1.5">
                            {sheetCount} sheet{sheetCount === 1 ? "" : "s"}
                          </Badge>
                        )}
                      </Link>
                      {isAdmin && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white h-7 px-3"
                            onClick={() => handleApproveJob(j.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 px-3"
                            onClick={() => openRejectDialog(j)}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                    {isAdmin && noSheets && (
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-red-700 dark:text-red-300">
                          ⚠ No job sheets assigned — select before approving
                        </span>
                        <Select value="" onValueChange={(v) => handleAttachSheetToPending(j.id, v)}>
                          <SelectTrigger className="h-7 w-[260px] text-xs">
                            <SelectValue placeholder="Attach a job sheet…" />
                          </SelectTrigger>
                          <SelectContent>
                            {sheetTemplates.map((t) => (
                              <SelectItem key={t.id} value={t.id} className="text-xs">
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {(j as any).template_mismatch_reason && (
                      <div className="mt-2 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/40 rounded px-2 py-1.5">
                        <span className="font-semibold shrink-0">⚠ Work-type mismatch:</span>
                        <span className="whitespace-pre-wrap break-words">{(j as any).template_mismatch_reason}</span>
                      </div>
                    )}
                    {isAdmin && (
                      <div className="mt-2">
                        <ReferenceFilesDropzone
                          mode="live"
                          jobId={j.id}
                          variant="compact"
                          label="Attach reference file…"
                        />
                      </div>
                    )}
                  </div>
                  );
                })}

              </div>
            </div>
          )}
          <Accordion type="multiple" value={openFolders} onValueChange={setOpenFolders} className="space-y-3">
            {customerNames.map((customerName) => (
              <DroppableCustomerFolder
                key={customerName}
                customerName={customerName}
                jobs={grouped[customerName] || []}
                statusColor={getStatusColor}
                isAdmin={isAdmin}
                isOver={overId === `folder-${customerName}`}
                isOpen={openFolders.includes(customerName)}
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
          {hasMore && (
            <div className="flex justify-center mt-4">
              <Button variant="outline" onClick={() => setPageSize((n) => n + 300)}>
                Load more jobs
              </Button>
            </div>
          )}
          {isAdmin && (
            <NewCustomerDropZone isDragging={!!activeJob} isOver={overId === "folder-__new_customer__"} />
          )}
          <DragOverlay>
            {activeJob ? (
              <div className="rounded-md border bg-card px-4 py-2 shadow-lg">
                <span className="font-mono text-sm font-medium text-primary">{activeJob.reference_number}</span>
                <span className="ml-2 text-sm">{activeJob.name}</span>
              </div>
            ) : activeFolder ? (
              <div className="rounded-md border bg-card px-4 py-3 shadow-lg flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">{activeFolder}</span>
                <Badge variant="secondary" className="text-xs">{(grouped[activeFolder] || []).length} jobs</Badge>
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

      <Dialog open={pendingMergeOpen} onOpenChange={setPendingMergeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Merge pending drafts</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Pick the draft to keep. The other {Math.max(0, selectedPendingIds.size - 1)} draft(s) will have their attachments and thread notes moved onto it, then be dismissed.
            </p>
            <div className="space-y-2">
              <Label>Keep this draft</Label>
              <Select value={pendingMergeTargetId} onValueChange={setPendingMergeTargetId}>
                <SelectTrigger><SelectValue placeholder="Select target draft…" /></SelectTrigger>
                <SelectContent>
                  {jobs.filter((j) => selectedPendingIds.has(j.id)).map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.reference_number} — {j.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPendingMergeOpen(false)}>Cancel</Button>
              <Button onClick={handleMergePending} disabled={!pendingMergeTargetId}>Merge</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>



      <AlertDialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge Customer Folders?</AlertDialogTitle>
            <AlertDialogDescription>
              All jobs from <span className="font-semibold text-foreground">"{mergeSource}"</span> will be moved into <span className="font-semibold text-foreground">"{mergeTarget}"</span>. The "{mergeSource}" folder will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMergeConfirm}>Merge</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
        onRedirectToScan={(f) => { setScanInitialFile(f); setScanPaperOpen(true); }}
      />

      {/* Reject Job Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject job</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {rejectingJob && (
              <p className="text-sm text-muted-foreground">
                <span className="font-mono font-semibold">{rejectingJob.reference_number}</span> – {rejectingJob.name}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="reject-reason">Reason for rejection</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value.slice(0, 1000))}
                placeholder="Explain why this job is being rejected..."
                rows={4}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">{rejectReason.length}/1000</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleRejectJob} disabled={!rejectReason.trim()}>
                Reject job
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


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
      <SiteSheetPrintDialog
        jobId={siteSheetJobId}
        open={!!siteSheetJobId}
        onOpenChange={(o) => { if (!o) setSiteSheetJobId(null); }}
      />
    </div>
  );
}
