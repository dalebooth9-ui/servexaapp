import { useEffect, useState, lazy, Suspense } from "react";
import ChunkErrorBoundary from "@/components/ChunkErrorBoundary";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useJobCategories } from "@/hooks/useJobCategories";
import { useWhat3Words } from "@/hooks/useWhat3Words";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { fuzzyMatch } from "@/lib/fuzzyMatch";
import { cn } from "@/lib/utils";
import SiteCombobox from "@/components/SiteCombobox";
import { OpenInMapsButton } from "@/components/OpenInMapsButton";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Download, Trash2, ChevronDown, ArrowLeft, FileText, CalendarClock, ExternalLink, Pencil, Save, X, ClipboardList, Sparkles, Camera, QrCode, PenLine, Printer } from "lucide-react";
import SiteSheetPrintDialog from "@/components/SiteSheetPrintDialog";
import { QRCodeSVG } from "qrcode.react";
import { Dialog as QrDialog, DialogContent as QrDialogContent, DialogHeader as QrDialogHeader, DialogTitle as QrDialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { generateAndSaveAiBrief } from "@/lib/aiJobBrief";
import SubmissionFilters, { Filters } from "@/components/SubmissionFilters";
import LocationMap from "@/components/LocationMap";
import FaultCodeSelect from "@/components/FaultCodeSelect";
import CloneJobDialog from "@/components/CloneJobDialog";
import ScheduleFollowUpJobs from "@/components/ScheduleFollowUpJobs";
import JobStatusPipeline, { ALL_JOB_STATUSES, getStatusLabel } from "@/components/JobStatusPipeline";
import SignatureCapture from "@/components/SignatureCapture";
import CustomerSignOffLink from "@/components/CustomerSignOffLink";
import JobHandoverLink from "@/components/JobHandoverLink";
import SendToCustomerMenu from "@/components/SendToCustomerMenu";
import AddNoteInput from "@/components/jobs/AddNoteInput";
import AutoAttachTemplateChooser from "@/components/AutoAttachTemplateChooser";
import { useFileUpload } from "@/hooks/useFileUpload";
import { ALLOWED_EXTENSIONS, extractStoragePath } from "@/lib/fileUtils";
import { buildAttachPlan, insertDraftResponses, lockJobTemplate, type MatchSlot, type TemplateOption } from "@/lib/autoAttachJobDocuments";
import { useJobPhotoCount } from "@/hooks/useJobPhotoCount";
import JobCompleteAction from "@/components/jobs/JobCompleteAction";
import JobRemedialChecklist from "@/components/jobs/JobRemedialChecklist";
import JobTemplateMismatchBanner from "@/components/jobs/JobTemplateMismatchBanner";
import { Switch } from "@/components/ui/switch";
import { Wrench, ClipboardPlus } from "lucide-react";

// Heavy children — code-split out of the JobDetail bundle. Each one pulls in
// hefty deps (jspdf/html2canvas/tiptap/exceljs/docx) transitively, so we
// React.lazy() them and gate rendering with <Suspense>.
const PhotoChecklistCapture = lazy(() => import("@/components/PhotoChecklistCapture"));
const AiJobBriefDialog = lazy(() => import("@/components/AiJobBriefDialog"));
const TechnicianAssistant = lazy(() => import("@/components/TechnicianAssistant"));
const EngineerAssignments = lazy(() => import("@/components/EngineerAssignments"));
const SiteHistoryPanel = lazy(() => import("@/components/SiteHistoryPanel"));

const WhatsAppReply = lazy(() => import("@/components/WhatsAppReply"));
const AllocatedDaysTracker = lazy(() => import("@/components/AllocatedDaysTracker"));
const JobMessages = lazy(() => import("@/components/JobMessages"));
const FieldReports = lazy(() => import("@/components/FieldReports"));
const FileDropZone = lazy(() => import("@/components/FileDropZone"));
const CreateInvoiceDialog = lazy(() => import("@/components/CreateInvoiceDialog"));
const JobVisits = lazy(() => import("@/components/JobVisits"));
const JobSheet = lazy(() => import("@/components/JobSheet"));
const JobParts = lazy(() => import("@/components/JobParts"));
const JobPdfReport = lazy(() => import("@/components/JobPdfReport"));
const JobWordReport = lazy(() => import("@/components/JobWordReport"));
const SubmissionList = lazy(() => import("@/components/jobs/SubmissionList"));
const EngineerCertificates = lazy(() => import("@/components/jobs/EngineerCertificates"));
const JobDocuments = lazy(() => import("@/components/JobDocuments"));
const InstallationProjects = lazy(() => import("@/components/InstallationProjects"));
const SiteSurveyCard = lazy(() => import("@/components/SiteSurveyCard"));
const JobDefects = lazy(() => import("@/components/jobs/JobDefects"));
const JobPartsUsed = lazy(() => import("@/components/jobs/JobPartsUsed"));
const JobPhotos = lazy(() => import("@/components/jobs/JobPhotos"));
const JobEmailChain = lazy(() => import("@/components/jobs/JobEmailChain"));
import RamsRequiredBanner from "@/components/rams/RamsRequiredBanner";
import { useJobRamsStatus } from "@/hooks/useJobRamsStatus";
import EngineerNextStepBar from "@/components/engineer/EngineerNextStepBar";
import EngineerJobHero from "@/components/engineer/EngineerJobHero";
import EngineerJobView from "@/components/engineer/EngineerJobView";
import EngineerCompletionGate from "@/components/engineer/EngineerCompletionGate";
import JobCompletionFlagsBadge from "@/components/jobs/JobCompletionFlagsBadge";

const LazyFallback = () => <div className="h-8 w-full animate-pulse rounded bg-muted/40" aria-hidden />;

const JOB_TABS = [
  { value: "overview", label: "Overview" },
  { value: "photos", label: "Photos" },
  { value: "documents", label: "Documents" },
  { value: "emails", label: "Emails" },
  { value: "parts", label: "Parts" },
  { value: "survey", label: "Survey & Snags" },
  { value: "signoff", label: "Sign-off" },
  { value: "activity", label: "Activity" },
] as const;

type JobTab = (typeof JOB_TABS)[number]["value"];

// Helper to get customer name from job with joined customers
function getCustomerName(job: any): string | null {
  return job?.customers?.name || job?.customer || null;
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const { categories: jobCategories } = useJobCategories();
  const { convert: convertW3W } = useWhat3Words();
  const [job, setJob] = useState<any>(null);
  const ramsStatus = useJobRamsStatus(id);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const photoCount = useJobPhotoCount(id);
  const [engineers, setEngineers] = useState<{ id: string; name: string }[]>([]);
  const [assignedEngineerIds, setAssignedEngineerIds] = useState<string[]>([]);
  const [customerEmail, setCustomerEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [filters, setFilters] = useState<Filters>({ type: "all", engineerId: "all", dateFrom: "", dateTo: "" });
  const [sites, setSites] = useState<{ id: string; name: string; address: string | null; postcode: string | null; latitude?: number | null; longitude?: number | null }[]>([]);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm, clearEditDraft] = useAutoSave(`job-edit-${id}`, { name: "", address: "", site_id: "", pressure_test_qty: 0, visual_qty: 0, other_qty: 0, other_service_type: "", due_date: "", allocated_days: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [chooserSlots, setChooserSlots] = useState<MatchSlot[]>([]);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [siteSheetOpen, setSiteSheetOpen] = useState(false);
  const [jobW3W, setJobW3W] = useState<string | null>(null);
  const jobUploadUrl = `${window.location.origin}/jobs/${id}`;
  const [showChecklistOptIn, setShowChecklistOptIn] = useState(false);
  const [savingRemedialFlag, setSavingRemedialFlag] = useState(false);
  const toggleIsRemedial = async (next: boolean) => {
    if (!id) return;
    setSavingRemedialFlag(true);
    const { error } = await supabase.from("jobs").update({ is_remedial: next } as any).eq("id", id);
    setSavingRemedialFlag(false);
    if (error) {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    } else {
      setJob((j: any) => j ? { ...j, is_remedial: next } : j);
      toast({ title: next ? "Marked as remedial" : "Remedial flag removed" });
    }
  };

  // Tab state — persisted per-job in sessionStorage so navigating away & back
  // keeps the same active section for the current browser session.
  const [activeTab, setActiveTab] = useState<JobTab>(() => {
    if (typeof window === "undefined" || !id) return "overview";
    const stored = sessionStorage.getItem(`job-detail-tab-${id}`);
    return JOB_TABS.some((t) => t.value === stored) ? (stored as JobTab) : "overview";
  });
  useEffect(() => {
    if (id) sessionStorage.setItem(`job-detail-tab-${id}`, activeTab);
  }, [activeTab, id]);

  useUnsavedChanges(editing, "You have unsaved changes to this job. Leave without saving?");

  const { uploading, uploadFilesAsSubmissions } = useFileUpload({ onComplete: () => fetchData() });


  const fetchData = async () => {
    if (!id) return;
    const [jobRes, subsRes, sitesRes, assignmentsRes] = await Promise.all([
      supabase.from("jobs").select("*, customers(id, name, email, logo_url), sites(id, name, address, postcode)").eq("id", id).single(),
      supabase.from("submissions").select("*").eq("job_id", id).order("created_at", { ascending: false }),
      supabase.from("sites").select("id, name, address, postcode").order("name"),
      supabase.from("job_assignments").select("engineer_id").eq("job_id", id),
    ]);
    setJob(jobRes.data);
    setSites(sitesRes.data || []);
    const subs = subsRes.data || [];
    setSubmissions(subs);

    // Resolve W3W using the address geocoding path
    const address = jobRes.data?.sites?.address || jobRes.data?.address;
    if (address) {
      supabase.functions.invoke("w3w-convert", { body: { address } })
        .then(({ data }) => { if (data?.words) setJobW3W(data.words); });
    }

    // Get customer email from joined data — fallback lookup in parallel below if needed
    let custEmailPromise: Promise<string>;
    if (jobRes.data?.customers?.email) {
      custEmailPromise = Promise.resolve(jobRes.data.customers.email as string);
    } else if (jobRes.data?.customer) {
      custEmailPromise = supabase
        .from("customers")
        .select("email")
        .eq("name", jobRes.data.customer)
        .limit(1)
        .maybeSingle()
        .then(({ data }) => (data?.email as string) || "") as Promise<string>;
    } else {
      custEmailPromise = Promise.resolve("");
    }

    // Collect all unique engineer IDs from submissions + assignments, then fetch profiles
    const submissionEngineerIds = subs.map((s: any) => s.engineer_id);
    const assignmentEngineerIds = (assignmentsRes.data || []).map((a: any) => a.engineer_id);
    setAssignedEngineerIds(assignmentEngineerIds);
    const engineerIds = [...new Set([...submissionEngineerIds, ...assignmentEngineerIds])];

    const profilesPromise = engineerIds.length > 0
      ? supabase.from("profiles").select("user_id, full_name, whatsapp_number").in("user_id", engineerIds).then(({ data }) => data || [])
      : Promise.resolve([]);

    const [custEmail, profiles] = await Promise.all([custEmailPromise, profilesPromise]);
    setCustomerEmail(custEmail);
    setEngineers((profiles as any[]).map((p) => ({ id: p.user_id, name: p.full_name || p.user_id, whatsappNumber: p.whatsapp_number })));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id]);

  // On job load, auto-attach a canonical fillable job sheet for categories
  // that don't rely on the qty fields (sprinkler, wet riser, fire hydrant,
  // fire extinguishers, etc.). buildAttachPlan checks for existing
  // attachments so this is safe to re-run.
  useEffect(() => {
    if (!id || !job?.category || !user || userRole !== "admin") return;
    if (job?.status === "completed" || job?.status === "cancelled") return;
    const ptQ = Number(job?.pressure_test_qty || 0);
    const visQ = Number(job?.visual_qty || 0);
    const othQ = Number(job?.other_qty || 0);
    // Only attempt the default when no qty-driven attachments are in play.
    if (ptQ + visQ + othQ > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const plan = await buildAttachPlan({
          jobId: id,
          jobCategory: job.category,
          qtys: { pressure_test: 0, visual: 0, other: 0 },
          categoryDefaultQty: 1,
        });
        if (cancelled) return;
        const prefill = {
          customerName: getCustomerName(job),
          siteName: job?.sites?.name || null,
          siteAddress: job?.sites?.address || job?.address || null,
          referenceNumber: job?.reference_number || null,
          categoryLabel: jobCategories.find((c: any) => c.slug === job.category)?.name || job.category || null,
        };
        if (plan.autoSlots.length > 0) {
          await insertDraftResponses({
            jobId: id,
            userId: user.id,
            prefill,
            slots: plan.autoSlots.map((s) => ({ template: s.template })),
          });
          fetchData();
        }
        if (!cancelled && plan.needsChoice.length > 0) {
          setChooserSlots(plan.needsChoice);
          setChooserOpen(true);
        }
      } catch (e) {
        console.error("Category default auto-attach failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [id, job?.category, job?.status, user?.id, userRole]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`submissions-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "submissions", filter: `job_id=eq.${id}` },
        () => {
          toast({ title: "New submission", description: "A new submission was just added." });
          fetchData();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const handleStatusChange = async (newStatus: string) => {
    if (!id) return;
    const { error } = await supabase.from("jobs").update({ status: newStatus }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
    } else {
      const prevStatus = job?.status;
      setJob((prev: any) => ({ ...prev, status: newStatus }));
      toast({ title: "Status updated", description: `Job is now ${newStatus}.` });

      if (newStatus === "active" && prevStatus !== "active") {
        supabase.functions.invoke("notify-customer", {
          body: { job_id: id, notification_type: "engineer_dispatched" },
        }).then(({ error: notifyErr }) => {
          if (!notifyErr) toast({ title: "Customer notified", description: "Dispatch email sent." });
        });
      } else if (newStatus === "completed" && prevStatus !== "completed") {
        supabase.functions.invoke("notify-customer", {
          body: { job_id: id, notification_type: "job_completed" },
        }).then(({ error: notifyErr }) => {
          if (!notifyErr) toast({ title: "Customer notified", description: "Completion email sent." });
        });
        // Prompt follow-up scheduling
        setFollowUpOpen(true);
      }
    }
  };

  const handleBulkUpload = async (files: File[]) => {
    if (!id || !user) return;
    await uploadFilesAsSubmissions(files, id, user.id);
  };

  const handleDeleteSubmission = async (sub: any) => {
    if (sub.file_url) {
      const path = extractStoragePath(sub.file_url);
      if (path) await supabase.storage.from("submissions").remove([path]);
    }
    const { error } = await supabase.from("submissions").delete().eq("id", sub.id);
    if (error) {
      toast({ title: "Error", description: "Failed to delete submission.", variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Submission removed." });
      setSubmissions((prev) => prev.filter((s) => s.id !== sub.id));
    }
  };

  const filtered = submissions.filter((s) => {
    if (s.file_name?.startsWith("[Cert]")) return false;
    if (filters.type !== "all" && s.type !== filters.type) return false;
    if (filters.engineerId !== "all" && s.engineer_id !== filters.engineerId) return false;
    if (filters.dateFrom && new Date(s.created_at) < new Date(filters.dateFrom)) return false;
    if (filters.dateTo && new Date(s.created_at) > new Date(filters.dateTo + "T23:59:59")) return false;
    return true;
  });

  const handleBatchDownload = async () => {
    const filesWithUrls = filtered.filter((s) => s.file_url);
    if (filesWithUrls.length === 0) {
      toast({ title: "No files to download", description: "No downloadable files match the current filters.", variant: "destructive" });
      return;
    }
    setDownloading(true);
    for (const sub of filesWithUrls) {
      const path = extractStoragePath(sub.file_url);
      if (!path) continue;
      const { data } = await supabase.storage.from("submissions").createSignedUrl(path, 3600);
      if (data?.signedUrl) {
        const link = document.createElement("a");
        link.href = data.signedUrl;
        link.download = sub.file_name || "download";
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    setDownloading(false);
    toast({ title: "Downloads started", description: `${filesWithUrls.length} file(s) downloading.` });
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>;
  if (!job) return <div className="flex h-64 items-center justify-center text-muted-foreground">Job not found.</div>;

  const fileCount = filtered.filter((s) => s.file_url).length;
  const custName = getCustomerName(job);
  const categoryDisplayName = jobCategories.find((c: any) => c.slug === job.category)?.name
    || (job.category ? job.category.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : null);

  // Engineers (and admins previewing as engineer) get the simplified,
  // field-first view: report(s), site docs, defects, photos. No admin tabs.
  if (userRole === "engineer") {
    return (
      <ChunkErrorBoundary>
        <Suspense fallback={<LazyFallback />}>
          <EngineerJobView
            jobId={id!}
            job={job}
            engineers={engineers}
            currentUserId={user?.id}
            isAssignedEngineer={!!user && assignedEngineerIds.includes(user.id)}
          />
          {id && (
            <EngineerNextStepBar
              jobId={id}
              jobStatus={job.status}
              isAssignedEngineer={!!user && assignedEngineerIds.includes(user.id)}
              onNavigateTab={() => { /* no tabs */ }}
              onStatusChanged={(s) => setJob((prev: any) => ({ ...prev, status: s }))}
            />
          )}
          {id && (
            <EngineerCompletionGate
              currentJobId={id}
              currentJobStatus={job.status}
              currentJobOrgId={job.org_id}
              isAssignedEngineer={!!user && assignedEngineerIds.includes(user.id)}
              isAdmin={false}
            />
          )}
        </Suspense>
      </ChunkErrorBoundary>
    );
  }

  return (
    <ChunkErrorBoundary>
    <Suspense fallback={<LazyFallback />}>
    <div>
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link to="/">Dashboard</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link to="/jobs">Jobs</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {custName && (
            <>
              <BreadcrumbItem><BreadcrumbPage>{custName}</BreadcrumbPage></BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}
          <BreadcrumbItem>
            <BreadcrumbPage>
              {(job as any).customer_po ? `PO ${(job as any).customer_po}` : job.reference_number}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mb-6 space-y-3">
        {/* Row 1: title + meta */}
        <div>
          <h1 className="text-2xl font-bold">{job.name}</h1>
          <p className="text-sm text-muted-foreground">
            {(job as any).customer_po ? (
              <>
                <span className="font-mono font-semibold text-foreground">PO {(job as any).customer_po}</span>
                {" · "}
                <span className="font-mono text-xs" title="Internal reference">{job.reference_number}</span>
              </>
            ) : (
              <span className="font-mono">{job.reference_number}</span>
            )}
            {custName && <> · <span className="font-medium text-foreground">{custName}</span></>}
            {job.sites?.name && <> · <span className="font-medium text-foreground">{job.sites.name}</span></>}
            {!job.sites?.name && job.address && <> · <span className="text-foreground">{job.address}</span></>}
            {categoryDisplayName && <> · <span className="text-muted-foreground">{categoryDisplayName}</span></>}
          </p>
          {jobW3W && (
            <a
              href={`https://what3words.com/${jobW3W.replace(/^\/\/\//, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium"
              style={{ color: "#e11f26" }}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="currentColor"><path d="M11.994 0C5.367 0 0 5.367 0 11.994 0 18.622 5.367 24 11.994 24 18.622 24 24 18.622 24 11.994 24 5.367 18.622 0 11.994 0zm-2.6 17.4l-1.5-5.1-1.5 5.1H4.7L2.5 9.6h1.8l1.5 5.4 1.5-5.4h1.8l1.5 5.4 1.5-5.4h1.8l-2.2 7.8h-1.7zm7.8 0l-1.5-5.1-1.5 5.1h-1.7l-2.2-7.8h1.8l1.5 5.4 1.5-5.4h1.8l1.5 5.4 1.5-5.4h1.8l-2.2 7.8h-1.7z"/></svg>
              {jobW3W}
            </a>
          )}
        </div>

        {/* Row 2: primary + Actions menu */}
        {userRole === "admin" ? (
          <div className="flex flex-wrap items-center gap-2">
            <JobCompletionFlagsBadge jobId={id!} isAdmin={userRole === "admin"} />
            <SendToCustomerMenu jobId={id!} job={job} customerEmail={customerEmail} />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  Actions <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-2">
                <div className="flex flex-col gap-1 [&>*]:w-full [&_button]:w-full [&_button]:justify-start">
                  <AiJobBriefDialog job={job} />
                  <JobPdfReport jobId={id!} job={job} />
                  <JobWordReport jobId={id!} job={job} />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => setSiteSheetOpen(true)}
                  >
                    <Printer className="mr-2 h-3.5 w-3.5" /> Print for site
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => document.getElementById("sign-off-signatures-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  >
                    <PenLine className="mr-2 h-3.5 w-3.5" /> Jump to sign-off
                  </Button>
                  <CloneJobDialog sourceJob={job} />
                  {(job.status === "completed" || job.status === "archived") && (
                    <ScheduleFollowUpJobs sourceJob={job} />
                  )}
                  <CreateInvoiceDialog
                    jobId={id!}
                    customerName={custName || ""}
                    customerEmail={customerEmail}
                    customerAddress={job.address || ""}
                    jobName={job.name}
                    documentType="quote"
                    trigger={
                      <Button size="sm" variant="ghost" className="justify-start">
                        <FileText className="mr-2 h-3.5 w-3.5" /> Create Quote
                      </Button>
                    }
                  />
                  {(job.status === "completed" || job.status === "archived") && (
                    <CreateInvoiceDialog
                      jobId={id!}
                      customerName={custName || ""}
                      customerEmail={customerEmail}
                      customerAddress={job.address || ""}
                      jobName={job.name}
                    />
                  )}
                  {job.status !== "scheduled" && (
                    <Button variant="ghost" size="sm" className="justify-start" onClick={() => handleStatusChange("scheduled")}>
                      <CalendarClock className="mr-2 h-3.5 w-3.5" /> Submit to Planner
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        ) : (
          <div>
            <Badge variant="secondary" className={job.status === "active" ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}>
              {job.status}
            </Badge>
          </div>
        )}

        {/* Row 3: compact controls — status / priority / result */}
        {userRole === "admin" && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={job.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue>{getStatusLabel(job.status)}</SelectValue></SelectTrigger>
              <SelectContent>
                {ALL_JOB_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={job.priority || "medium"}
              onValueChange={async (v) => {
                const { error } = await supabase.from("jobs").update({ priority: v } as any).eq("id", id!);
                if (error) { toast({ title: "Error", description: "Failed to update priority.", variant: "destructive" }); }
                else { setJob((prev: any) => ({ ...prev, priority: v })); toast({ title: "Priority updated" }); }
              }}
            >
              <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="high">🔴 High</SelectItem>
                <SelectItem value="medium">🟡 Medium</SelectItem>
                <SelectItem value="low">🟢 Low</SelectItem>
              </SelectContent>
            </Select>
            <FaultCodeSelect
              value={(job as any).result || null}
              onChange={async (v) => {
                const { error } = await supabase.from("jobs").update({ result: v } as any).eq("id", id!);
                if (error) { toast({ title: "Error", description: "Failed to update result.", variant: "destructive" }); }
                else { setJob((prev: any) => ({ ...prev, result: v })); toast({ title: "Result updated" }); }
              }}
            />
          </div>
        )}
      </div>

      {job.status === "scheduled" && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          <CalendarClock className="h-4 w-4 shrink-0" />
          <span className="flex-1">This job is in the planner awaiting engineer assignment.</span>
          <Link to="/planner" className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
            View Planner <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* Tab navigation — sections are lazy-mounted; only the active tab is in the DOM. */}
      <div className="mb-6 flex flex-wrap gap-1 border-b border-border" role="tablist" aria-label="Job sections">
        {JOB_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              activeTab === tab.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            {tab.label}
            {tab.value === "photos" && photoCount > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
                {photoCount}
              </span>
            )}
            {tab.value === "emails" && (job?.has_unread_email || job?.email_review_flag) && (
              <span
                className={`ml-1.5 inline-flex h-2 w-2 rounded-full ${
                  job?.email_review_flag ? "bg-destructive" : "bg-primary"
                }`}
                aria-label={job?.email_review_flag ? "Email received on completed job" : "New email"}
              />
            )}

          </button>
        ))}
      </div>

      {activeTab === "photos" && id && (
        <Suspense fallback={<LazyFallback />}>
          <JobPhotos
            jobId={id}
            engineers={engineers}
            isAdmin={userRole === "admin"}
            canUpload={job?.status !== "cancelled" && (userRole === "admin" || (user ? assignedEngineerIds.includes(user.id) : false))}
          />
        </Suspense>
      )}



      {activeTab === "overview" && (<>
      {!!user && assignedEngineerIds.includes(user.id) && userRole !== "admin" && (
        <EngineerJobHero
          jobId={id!}
          jobOrgId={job.org_id}
          isRemedial={!!job.is_remedial}
          onNavigateTab={(t) => setActiveTab(t as JobTab)}
        />
      )}
      {/* Editable Job Details */}
      <Collapsible defaultOpen className="mb-6">

          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
            Job Details
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            {!editing ? (
              <div className="rounded-lg border bg-card p-4 space-y-2">
                <div className="flex items-start justify-between">
                   <div className="space-y-1.5 text-sm">
                    <div><span className="text-muted-foreground">Job Name:</span> <span className="font-medium">{job.name}</span></div>
                    {(job as any).source && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Source:</span>
                        <Badge
                          variant="outline"
                          className={
                            (job as any).source === "Email Triage"
                              ? "border-orange-500 bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                              : ""
                          }
                        >
                          {(job as any).source}
                        </Badge>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Customer:</span>{" "}
                      <span className="font-medium">
                        {job.customers?.name || job.customer || "—"}
                      </span>
                      {!job.customers?.name && job.customer && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                          unlinked
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-muted-foreground">Site Address:</span>
                      <span className="font-medium">{job.address || "—"}</span>
                      {job.address && (
                        <OpenInMapsButton
                          address={job.address}
                          postcode={job.sites?.postcode ?? null}
                          lat={(job.sites as any)?.latitude ?? null}
                          lng={(job.sites as any)?.longitude ?? null}
                          size="sm"
                          variant="outline"
                          label="Directions"
                          className="h-7"
                        />
                      )}
                    </div>
                    {jobW3W && (
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">what3words:</span>
                        <a
                          href={`https://what3words.com/${jobW3W.replace(/^\/\/\//, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium inline-flex items-center gap-1 hover:underline"
                          style={{ color: "#e11f26" }}
                        >
                          <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="currentColor"><path d="M11.994 0C5.367 0 0 5.367 0 11.994 0 18.622 5.367 24 11.994 24 18.622 24 24 18.622 24 11.994 24 5.367 18.622 0 11.994 0zm-2.6 17.4l-1.5-5.1-1.5 5.1H4.7L2.5 9.6h1.8l1.5 5.4 1.5-5.4h1.8l1.5 5.4 1.5-5.4h1.8l-2.2 7.8h-1.7zm7.8 0l-1.5-5.1-1.5 5.1h-1.7l-2.2-7.8h1.8l1.5 5.4 1.5-5.4h1.8l1.5 5.4 1.5-5.4h1.8l-2.2 7.8h-1.7z"/></svg>
                          {jobW3W}
                        </a>
                      </div>
                    )}
                    <div><span className="text-muted-foreground">Site:</span> <span className="font-medium">{sites.find((s) => s.id === job.site_id)?.name || "—"}</span></div>
                    {job.category === "installation" ? (
                      <div className="flex gap-4">
                        <span><span className="text-muted-foreground">Dry Riser Systems:</span> <span className="font-medium">{(job as any).other_qty || 0}</span></span>
                      </div>
                    ) : (
                      <div className="flex gap-4">
                        <span><span className="text-muted-foreground">Pressure Test:</span> <span className="font-medium">{job.pressure_test_qty || 0}</span></span>
                        <span><span className="text-muted-foreground">Visual:</span> <span className="font-medium">{job.visual_qty || 0}</span></span>
                        {((job as any).other_qty > 0) && (
                          <span><span className="text-muted-foreground">{(job as any).other_service_type || "Other"}:</span> <span className="font-medium">{(job as any).other_qty}</span></span>
                        )}
                      </div>
                    )}
                    {(job as any).allocated_days != null && (
                      <AllocatedDaysTracker jobId={id!} allocatedDays={(job as any).allocated_days} />
                    )}
                  </div>
                  {userRole === "admin" && (
                    <Button size="sm" variant="outline" onClick={() => { setEditForm({ name: job.name || "", address: job.address || "", site_id: job.site_id || "", pressure_test_qty: job.pressure_test_qty || 0, visual_qty: job.visual_qty || 0, other_qty: (job as any).other_qty || 0, other_service_type: (job as any).other_service_type || "", due_date: job.due_date || "", allocated_days: (job as any).allocated_days != null ? String((job as any).allocated_days) : "" }); setEditing(true); }}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                    </Button>
                  )}
                </div>

                {/* AI Job Brief — stored brief */}
                {(job as any).brief && (
                  <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-semibold text-primary">AI Job Brief</span>
                    </div>
                    <div className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap line-clamp-6">
                      {(job as any).brief.replace(/^#+\s+/gm, "").replace(/\*\*(.*?)\*\*/g, "$1")}
                    </div>
                    <AiJobBriefDialog
                      job={job}
                      trigger={
                        <button className="mt-2 text-xs text-primary hover:underline underline-offset-2">
                          View full brief →
                        </button>
                      }
                    />
                  </div>
                )}

                {userRole === "admin" && id && (
                  <div className="mt-3">
                    <Suspense fallback={null}>
                      <SiteHistoryPanel
                        currentJobId={id}
                        siteId={job.site_id}
                        address={job.address}
                      />
                    </Suspense>
                  </div>
                )}
              </div>

            ) : (userRole === "admin" && (
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Job Name</Label>
                    <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Address</Label>
                    <Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Site</Label>
                    <SiteCombobox
                      value={editForm.site_id}
                      sites={sites}
                      onChange={(siteId) => {
                        const site = sites.find((s) => s.id === siteId);
                        setEditForm((f) => ({ ...f, site_id: siteId, ...(site?.address ? { address: site.address } : {}) }));
                      }}
                    />
                  </div>
                  {job.category === "installation" ? (
                    <div>
                      <Label className="text-xs">Dry Riser Systems Qty</Label>
                      <Input type="number" min={0} value={editForm.other_qty} onChange={(e) => setEditForm({ ...editForm, other_qty: Math.max(0, parseInt(e.target.value) || 0) })} className="mt-1" />
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <Label className="text-xs">Pressure Test Qty</Label>
                          <Input type="number" min={0} value={editForm.pressure_test_qty} onChange={(e) => setEditForm({ ...editForm, pressure_test_qty: Math.max(0, parseInt(e.target.value) || 0) })} className="mt-1" />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs">Visual Qty</Label>
                          <Input type="number" min={0} value={editForm.visual_qty} onChange={(e) => setEditForm({ ...editForm, visual_qty: Math.max(0, parseInt(e.target.value) || 0) })} className="mt-1" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Label className="text-xs">Other Service Type</Label>
                          <Input placeholder="e.g. Wet Riser" value={editForm.other_service_type} onChange={(e) => setEditForm({ ...editForm, other_service_type: e.target.value })} className="mt-1" />
                        </div>
                        <div className="w-24">
                          <Label className="text-xs">Other Qty</Label>
                          <Input type="number" min={0} value={editForm.other_qty} onChange={(e) => setEditForm({ ...editForm, other_qty: Math.max(0, parseInt(e.target.value) || 0) })} className="mt-1" />
                        </div>
                      </div>
                    </>
                  )}
                  <div>
                    <Label className="text-xs">Due Date</Label>
                    <Input type="date" value={editForm.due_date} onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Allocated Days</Label>
                    <Input type="number" min={1} placeholder="e.g. 5" value={editForm.allocated_days} onChange={(e) => setEditForm({ ...editForm, allocated_days: e.target.value })} className="mt-1" />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" disabled={editSaving || !editForm.name.trim()} onClick={async () => {
                    setEditSaving(true);
                    const updatePayload: any = { name: editForm.name.trim(), address: editForm.address.trim() || null, site_id: editForm.site_id || null, other_qty: editForm.other_qty, due_date: editForm.due_date || null, allocated_days: editForm.allocated_days ? parseInt(editForm.allocated_days) : null };
                    if (job.category !== "installation") {
                      updatePayload.pressure_test_qty = editForm.pressure_test_qty;
                      updatePayload.visual_qty = editForm.visual_qty;
                      updatePayload.other_service_type = editForm.other_service_type || null;
                    }
                    const { error } = await supabase.from("jobs").update(updatePayload).eq("id", id!);
                    if (error) {
                      toast({ title: "Error", description: "Failed to save changes.", variant: "destructive" });
                      setEditSaving(false);
                      return;
                    }
                    toast({ title: "Job details updated" });
                    clearEditDraft();
                    setEditing(false);

                    // Auto-attach relevant document templates based on category counts
                    try {
                      const plan = await buildAttachPlan({
                        jobId: id!,
                        jobCategory: job.category || null,
                        qtys: {
                          pressure_test: job.category !== "installation" ? (editForm.pressure_test_qty || 0) : 0,
                          visual: job.category !== "installation" ? (editForm.visual_qty || 0) : 0,
                          other: editForm.other_qty || 0,
                        },
                        otherServiceType: job.category !== "installation" ? (editForm.other_service_type || null) : null,
                      });

                      const prefill = {
                        customerName: getCustomerName(job),
                        siteName: job?.sites?.name || null,
                        siteAddress: job?.sites?.address || editForm.address || null,
                        referenceNumber: job?.reference_number || null,
                        categoryLabel: jobCategories.find((c: any) => c.slug === job.category)?.name || job.category || null,
                      };

                      // Auto-attach unambiguous matches immediately
                      if (plan.autoSlots.length > 0 && user) {
                        await insertDraftResponses({
                          jobId: id!,
                          userId: user.id,
                          prefill,
                          slots: plan.autoSlots.map((s) => ({ template: s.template })),
                        });
                        toast({ title: `Attached ${plan.autoSlots.length} document${plan.autoSlots.length === 1 ? "" : "s"}` });
                      }

                      // Prompt for any ambiguous slots
                      if (plan.needsChoice.length > 0) {
                        setChooserSlots(plan.needsChoice);
                        setChooserOpen(true);
                      }
                    } catch (e: any) {
                      console.error("Auto-attach failed", e);
                      toast({ title: "Document auto-attach failed", description: e?.message || String(e), variant: "destructive" });
                    }

                    fetchData();
                    setEditSaving(false);
                  }}>
                    <Save className="mr-1.5 h-3.5 w-3.5" /> {editSaving ? "Saving..." : "Save"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { clearEditDraft(); setEditing(false); }}>
                    <X className="mr-1.5 h-3.5 w-3.5" /> Cancel
                  </Button>
                </div>
              </div>
            ))}
           </CollapsibleContent>
         </Collapsible>

        {/* Remedial flag + works checklist (visible on every job to admin; engineers see checklist only when items exist) */}
        {userRole === "admin" && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
            <div className="flex items-center gap-3">
              <Wrench className="h-4 w-4 text-primary" />
              <div>
                <div className="text-sm font-medium">Remedial job</div>
                <div className="text-xs text-muted-foreground">Flag jobs where defects/snags are being rectified. Enables the works checklist and gates completion until items are resolved.</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!job.is_remedial && !showChecklistOptIn && (
                <Button size="sm" variant="outline" onClick={() => setShowChecklistOptIn(true)}>
                  <ClipboardPlus className="mr-1.5 h-4 w-4" /> Add works checklist
                </Button>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Remedial</span>
                <Switch checked={!!job.is_remedial} disabled={savingRemedialFlag} onCheckedChange={toggleIsRemedial} />
              </div>
            </div>
          </div>
        )}
        {/* Engineers get the checklist inside <EngineerJobHero> above; skip here to avoid duplication. */}
        {!(userRole !== "admin" && !!user && assignedEngineerIds.includes(user.id)) && (
          <JobRemedialChecklist
            jobId={id!}
            jobOrgId={job.org_id}
            isRemedial={!!job.is_remedial}
            isAdmin={userRole === "admin"}
            isAssignedEngineer={!!user && assignedEngineerIds.includes(user.id)}
            forceShow={showChecklistOptIn}
          />
        )}
      </>)}


      <AutoAttachTemplateChooser
        open={chooserOpen}
        slots={chooserSlots}
        onCancel={() => { setChooserOpen(false); setChooserSlots([]); }}
        onConfirm={async (choices) => {
          setChooserOpen(false);
          if (!user || choices.length === 0) { setChooserSlots([]); return; }
          try {
            const prefill = {
              customerName: getCustomerName(job),
              siteName: job?.sites?.name || null,
              siteAddress: job?.sites?.address || job?.address || null,
              referenceNumber: job?.reference_number || null,
              categoryLabel: jobCategories.find((c: any) => c.slug === job.category)?.name || job.category || null,
            };
            await insertDraftResponses({
              jobId: id!,
              userId: user.id,
              prefill,
              slots: choices.map((c) => ({ template: c.template })),
            });

            // Persist per-bucket locks (one lock per bucket; later choices in the same bucket just reaffirm)
            const lockedBuckets = new Set<string>();
            const lockOps = choices
              .filter((c) => c.lock && !lockedBuckets.has(c.slot.bucket) && (lockedBuckets.add(c.slot.bucket), true))
              .map((c) => lockJobTemplate(id!, c.slot.bucket, c.template.id, user.id));
            if (lockOps.length > 0) {
              try {
                await Promise.all(lockOps);
              } catch (lockErr: any) {
                console.warn("Failed to save template lock:", lockErr);
              }
            }

            const lockMsg = lockOps.length > 0 ? ` · locked ${lockOps.length} template${lockOps.length === 1 ? "" : "s"} for this job` : "";
            toast({ title: `Attached ${choices.length} document${choices.length === 1 ? "" : "s"}${lockMsg}` });
            fetchData();
          } catch (e: any) {
            toast({ title: "Failed to attach documents", description: e?.message || String(e), variant: "destructive" });
          }
          setChooserSlots([]);
        }}
      />

      {/* Follow-up scheduling prompt on completion */}
      <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule Follow-Up Services</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            Job <strong>{job.reference_number}</strong> has been completed. Would you like to schedule follow-up services?
          </p>
          <div className="flex flex-col gap-2">
            <ScheduleFollowUpJobs sourceJob={job} onCreated={() => setFollowUpOpen(false)} />
          </div>
          <Button variant="ghost" size="sm" className="w-full mt-1" onClick={() => setFollowUpOpen(false)}>
            Skip for now
          </Button>
        </DialogContent>
      </Dialog>

      {activeTab === "overview" && (<>
      <Collapsible defaultOpen className="mb-6">
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
          Engineer Assignments
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            {userRole === "admin" && <EngineerAssignments jobId={id!} />}
            <WhatsAppReply jobId={id!} engineers={engineers} />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {userRole === "admin" && (
        <Collapsible defaultOpen className="mb-6">
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
            Scheduled Visits
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <JobVisits jobId={id!} jobData={job} />
          </CollapsibleContent>
        </Collapsible>
      )}
      </>)}


      {activeTab === "documents" && (<>
      <Collapsible defaultOpen className="mb-6">
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
          Documents
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          {userRole === "admin" && (
            <div className="mb-3 flex justify-end gap-2">
              <Button
                variant="outline" size="sm" className="gap-1.5 text-xs"
                onClick={() => navigate(`/rams/start?job=${id}`)}
              >
                <ClipboardList className="h-3.5 w-3.5" /> Generate RAMS (AI)
              </Button>
              <Button
                variant="outline" size="sm" className="gap-1.5 text-xs"
                onClick={() => navigate(`/jobs/${id}/rams`)}
              >
                <ClipboardList className="h-3.5 w-3.5" /> Edit / Create RAMS
              </Button>
            </div>
          )}
          <JobDocuments jobId={id!} job={job} engineers={engineers} />
        </CollapsibleContent>
      </Collapsible>

      <Collapsible defaultOpen className="mb-6" id="job-sheets-section">
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
          Job Sheets
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <JobSheet jobId={id!} job={job} />
        </CollapsibleContent>
      </Collapsible>
      </>)}


      {activeTab === "survey" && (<>
      <Collapsible defaultOpen className="mb-6">
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
          Site Survey
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <SiteSurveyCard jobId={id!} />
        </CollapsibleContent>
      </Collapsible>

      {!(job.category === "installation" || job.category?.includes("install")) && (
        <Collapsible defaultOpen className="mb-6">
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
            <span className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" />
              Photo Documentation
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <PhotoChecklistCapture
              jobId={id!}
              jobName={job.name}
              jobCategory={job.category || "general"}
              customerName={job.customers?.name || job.customer || undefined}
              siteName={job.sites?.name || undefined}
            />
          </CollapsibleContent>
        </Collapsible>
      )}

      {(job.category === "installation" || job.category?.includes("install")) && (
        <div className="mb-6">
          <InstallationProjects jobId={id!} job={job} />
        </div>
      )}
      </>)}


      {activeTab === "overview" && (
        <div className="mb-6 space-y-3">
          {userRole === "admin" && (
            <JobStatusPipeline currentStatus={job.status} onChange={handleStatusChange} />
          )}
          {(job as any).template_mismatch_reason && (
            <JobTemplateMismatchBanner
              jobId={id!}
              reason={(job as any).template_mismatch_reason}
              detectedWorkTypes={(job as any).detected_work_types}
              onDrafted={fetchData}
            />
          )}
          <RamsRequiredBanner jobId={id!} status={ramsStatus} />
          <JobCompleteAction
            jobId={id!}
            jobStatus={job.status}
            jobRef={job.reference_number}
            isAssignedEngineer={!!user && assignedEngineerIds.includes(user.id)}
            variant="inline"
            onCompleted={fetchData}
          />
        </div>
      )}

      {activeTab === "emails" && id && (
        <Suspense fallback={<LazyFallback />}>
          <JobEmailChain jobId={id} isAdmin={userRole === "admin"} />
        </Suspense>
      )}


      {activeTab === "parts" && (
        <Collapsible defaultOpen className="mb-6">
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
            Parts & Materials
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <JobParts jobId={id!} jobCategory={job.category} jobName={job.name} />
          </CollapsibleContent>
        </Collapsible>
      )}


      {activeTab === "activity" && userRole === "admin" && (
        <Collapsible defaultOpen className="mb-6">
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
            Servexa Reports
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <FieldReports jobId={id!} />
          </CollapsibleContent>
        </Collapsible>
      )}

      {activeTab === "signoff" && (<>
      <JobCompleteAction
        jobId={id!}
        jobStatus={job.status}
        jobRef={job.reference_number}
        isAssignedEngineer={!!user && assignedEngineerIds.includes(user.id)}
        variant="banner"
        className="mb-4"
        onCompleted={fetchData}
      />
      <Collapsible defaultOpen className="mb-6" id="sign-off-signatures-section">
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
          Engineer & Customer Sign-Off Signatures
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-4">
          <SignatureCapture jobId={id!} signerRole="engineer" heading="Engineer sign-off" filterByRole />
          <div className="border-t pt-3">
            <SignatureCapture
              jobId={id!}
              signerRole="customer"
              heading="Customer sign-off (in person)"
              defaultSignerName={custName || ""}
              filterByRole
            />
          </div>
          <div className="border-t pt-3 space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Customer handover sign-off (remote link)</p>
              <JobHandoverLink jobId={id!} customerId={(job as any).customer_id} customerName={custName || ""} />
            </div>
            <div className="border-t pt-3">
              <p className="text-sm text-muted-foreground mb-2">Need the customer to sign off remotely (legacy)?</p>
              <CustomerSignOffLink jobId={id!} customerName={custName || ""} />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
      {userRole === "admin" && (
        <Collapsible defaultOpen className="mb-6">
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
            Engineer Certificates
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <EngineerCertificates jobId={id!} engineers={engineers} />
          </CollapsibleContent>
        </Collapsible>
      )}
      {id && <JobDefects jobId={id} siteId={job?.site_id || null} />}
      </>)}

      {activeTab === "parts" && !(job?.category === "installation" || job?.category?.includes("install")) && id && (
        <Suspense fallback={null}><JobPartsUsed jobId={id} /></Suspense>
      )}


      {activeTab === "activity" && (<>
      <Collapsible defaultOpen className="mb-6">
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
          Messages
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <JobMessages jobId={id!} />
        </CollapsibleContent>
      </Collapsible>

      <Collapsible defaultOpen className="mb-6">
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
          Submissions ({filtered.length})
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-4">
           <FileDropZone onFilesSelected={handleBulkUpload} uploading={uploading} />
           <AddNoteInput jobId={id!} userId={user?.id} onAdded={fetchData} />

          <div className="flex items-center justify-between">
            <SubmissionFilters filters={filters} onChange={setFilters} engineers={engineers} />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setQrOpen(true)} title="Open job on mobile via QR code">
                <QrCode className="h-4 w-4 mr-1.5" /> Upload via Mobile
              </Button>
              {fileCount > 0 && (
                <Button size="sm" variant="outline" onClick={handleBatchDownload} disabled={downloading}>
                  <Download className="mr-1.5 h-4 w-4" /> {downloading ? "Downloading..." : `Download ${fileCount} file(s)`}
                </Button>
              )}
            </div>
          </div>

          <SubmissionList
            items={filtered}
            isAdmin={userRole === "admin"}
            onDelete={handleDeleteSubmission}
            engineers={engineers}
            currentUserId={user?.id}
            onUpdate={fetchData}
          />
        </CollapsibleContent>
      </Collapsible>
      </>)}


      {/* QR Code Dialog for mobile upload */}
      <QrDialog open={qrOpen} onOpenChange={setQrOpen}>
        <QrDialogContent className="max-w-sm">
          <QrDialogHeader>
            <QrDialogTitle className="flex items-center gap-2">
              <QrCode className="h-4 w-4 text-primary" /> Upload Photos from Mobile
            </QrDialogTitle>
          </QrDialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <p className="text-sm text-muted-foreground text-center">
              Scan this QR code with your mobile device. Log in if prompted, then take or select photos to upload directly to this job.
            </p>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <QRCodeSVG value={jobUploadUrl} size={200} includeMargin={false} />
            </div>
            <p className="text-xs text-muted-foreground text-center break-all">{jobUploadUrl}</p>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => { navigator.clipboard.writeText(jobUploadUrl); }}
            >
              Copy Link
            </Button>
          </div>
        </QrDialogContent>
      </QrDialog>
    </div>

    {/* Technician AI Assistant — floating on job detail for all roles */}
    {job && (
      <TechnicianAssistant
        jobContext={{
          job_name: job.name,
          category: job.category,
          customer: getCustomerName(job) ?? undefined,
          site: job.sites?.name ?? job.address ?? undefined,
          priority: job.priority,
          description: job.description ?? undefined,
        }}
      />
    )}

    {/* Sticky mobile "Complete Job" — admin view only. The simplified
        engineer view above handles its own next-step / completion UI. */}
    {job && (
      <JobCompleteAction
        jobId={id!}
        jobStatus={job.status}
        jobRef={job.reference_number}
        isAssignedEngineer={!!user && assignedEngineerIds.includes(user.id)}
        variant="sticky"
        onCompleted={fetchData}
      />
    )}
    <SiteSheetPrintDialog
      jobId={id || null}
      open={siteSheetOpen}
      onOpenChange={setSiteSheetOpen}
    />
    </Suspense>
    </ChunkErrorBoundary>
  );
}
