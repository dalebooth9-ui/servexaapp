import { useEffect, useState } from "react";
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
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Download, Trash2, ChevronDown, ArrowLeft, FileText, CalendarClock, ExternalLink, Pencil, Save, X, ClipboardList, Sparkles, Camera, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Dialog as QrDialog, DialogContent as QrDialogContent, DialogHeader as QrDialogHeader, DialogTitle as QrDialogTitle } from "@/components/ui/dialog";
import PhotoChecklistCapture from "@/components/PhotoChecklistCapture";
import AiJobBriefDialog from "@/components/AiJobBriefDialog";
import { generateAndSaveAiBrief } from "@/lib/aiJobBrief";
import TechnicianAssistant from "@/components/TechnicianAssistant";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import EngineerAssignments from "@/components/EngineerAssignments";
import WhatsAppReply from "@/components/WhatsAppReply";
import AllocatedDaysTracker from "@/components/AllocatedDaysTracker";
import JobMessages from "@/components/JobMessages";
import SubmissionFilters, { Filters } from "@/components/SubmissionFilters";
import LocationMap from "@/components/LocationMap";
import FieldReports from "@/components/FieldReports";
import FileDropZone from "@/components/FileDropZone";
import CreateInvoiceDialog from "@/components/CreateInvoiceDialog";
import JobVisits from "@/components/JobVisits";
import FaultCodeSelect from "@/components/FaultCodeSelect";
import CloneJobDialog from "@/components/CloneJobDialog";
import ScheduleFollowUpJobs from "@/components/ScheduleFollowUpJobs";
import JobSheet from "@/components/JobSheet";
import JobParts from "@/components/JobParts";
import JobPdfReport from "@/components/JobPdfReport";
import JobStatusPipeline, { ALL_JOB_STATUSES, getStatusLabel } from "@/components/JobStatusPipeline";
import SignatureCapture from "@/components/SignatureCapture";
import CustomerSignOffLink from "@/components/CustomerSignOffLink";
import JobHandoverLink from "@/components/JobHandoverLink";
import SendToCustomerMenu from "@/components/SendToCustomerMenu";
import SubmissionList from "@/components/jobs/SubmissionList";
import EngineerCertificates from "@/components/jobs/EngineerCertificates";
import AddNoteInput from "@/components/jobs/AddNoteInput";
import JobDocuments from "@/components/JobDocuments";
import InstallationProjects from "@/components/InstallationProjects";
import { useFileUpload } from "@/hooks/useFileUpload";
import { ALLOWED_EXTENSIONS, extractStoragePath } from "@/lib/fileUtils";

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
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [engineers, setEngineers] = useState<{ id: string; name: string }[]>([]);
  const [customerEmail, setCustomerEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [filters, setFilters] = useState<Filters>({ type: "all", engineerId: "all", dateFrom: "", dateTo: "" });
  const [sites, setSites] = useState<{ id: string; name: string; address: string | null; postcode: string | null; latitude?: number | null; longitude?: number | null }[]>([]);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm, clearEditDraft] = useAutoSave(`job-edit-${id}`, { name: "", address: "", site_id: "", pressure_test_qty: 0, visual_qty: 0, other_qty: 0, other_service_type: "", due_date: "", allocated_days: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [jobW3W, setJobW3W] = useState<string | null>(null);
  const jobUploadUrl = `${window.location.origin}/jobs/${id}`;

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

  return (
    <>
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>
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
            <BreadcrumbPage>{job.reference_number}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{job.name}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{job.reference_number}</span>
            {custName && <> • {custName}</>}
            {job.address && <> • {job.address}</>}
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
          {categoryDisplayName && (
            <div className="mt-1">
              <Badge variant="secondary" className="text-xs">{categoryDisplayName}</Badge>
            </div>
          )}
          {job.category === "installation" ? (
            job.other_qty > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                  Dry Riser Systems <span className="font-bold">× {job.other_qty}</span>
                </span>
              </div>
            )
          ) : (
            (job.pressure_test_qty > 0 || job.visual_qty > 0 || (job.other_qty > 0 && job.other_service_type)) && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {job.pressure_test_qty > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                    Pressure Test <span className="font-bold">× {job.pressure_test_qty}</span>
                  </span>
                )}
                {job.visual_qty > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-secondary border border-border px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                    Visual Inspection <span className="font-bold">× {job.visual_qty}</span>
                  </span>
                )}
                {job.other_qty > 0 && job.other_service_type && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-accent border border-border px-2 py-0.5 text-xs font-medium text-accent-foreground">
                    {job.other_service_type} <span className="font-bold">× {job.other_qty}</span>
                  </span>
                )}
              </div>
            )
          )}
          {userRole === "admin" ? (
            <div className="mt-1.5 flex items-center gap-2">
              <Select
                value={job.priority || "medium"}
                onValueChange={async (v) => {
                  const { error } = await supabase.from("jobs").update({ priority: v } as any).eq("id", id!);
                  if (error) { toast({ title: "Error", description: "Failed to update priority.", variant: "destructive" }); }
                  else { setJob((prev: any) => ({ ...prev, priority: v })); toast({ title: "Priority updated" }); }
                }}
              >
                <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
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
          ) : (
            <div className="mt-1.5 flex items-center gap-2">
              <Badge variant={job.priority === "high" ? "destructive" : "secondary"} className="text-[10px] uppercase">
                {job.priority || "medium"} priority
              </Badge>
              {job.category && job.category !== "general" && (
                <Badge variant="outline" className="text-[10px] uppercase">{job.category}</Badge>
              )}
            </div>
          )}
        </div>
        {userRole === "admin" ? (
          <div className="flex items-center gap-2">
            <AiJobBriefDialog job={job} />
            <SendToCustomerMenu jobId={id!} job={job} customerEmail={customerEmail} />
            <JobPdfReport jobId={id!} job={job} />
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
                <Button size="sm" variant="outline">
                  <FileText className="mr-1.5 h-4 w-4" /> Create Quote
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
              <Button variant="secondary" size="sm" onClick={() => handleStatusChange("scheduled")}>
                Save & Submit to Planner
              </Button>
            )}
            <Select value={job.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue>{getStatusLabel(job.status)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ALL_JOB_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <Badge variant="secondary" className={job.status === "active" ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}>
            {job.status}
          </Badge>
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

      {/* Editable Job Details */}
      {userRole === "admin" && (
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
                    <div><span className="text-muted-foreground">Address:</span> <span className="font-medium">{job.address || "—"}</span></div>
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
                  <Button size="sm" variant="outline" onClick={() => { setEditForm({ name: job.name || "", address: job.address || "", site_id: job.site_id || "", pressure_test_qty: job.pressure_test_qty || 0, visual_qty: job.visual_qty || 0, other_qty: (job as any).other_qty || 0, other_service_type: (job as any).other_service_type || "", due_date: job.due_date || "", allocated_days: (job as any).allocated_days != null ? String((job as any).allocated_days) : "" }); setEditing(true); }}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                  </Button>
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
              </div>
            ) : (
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
                    <Select value={editForm.site_id || "none"} onValueChange={(v) => {
                      const siteId = v === "none" ? "" : v;
                      const site = sites.find((s) => s.id === siteId);
                      setEditForm((f) => ({ ...f, site_id: siteId, ...(site?.address ? { address: site.address } : {}) }));
                    }}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select site" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No site</SelectItem>
                        {sites.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}{s.postcode ? ` (${s.postcode})` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    if (error) { toast({ title: "Error", description: "Failed to save changes.", variant: "destructive" }); }
                    else { toast({ title: "Job details updated" }); clearEditDraft(); setEditing(false); fetchData(); }
                    setEditSaving(false);
                  }}>
                    <Save className="mr-1.5 h-3.5 w-3.5" /> {editSaving ? "Saving..." : "Save"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { clearEditDraft(); setEditing(false); }}>
                    <X className="mr-1.5 h-3.5 w-3.5" /> Cancel
                  </Button>
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

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

      <Collapsible defaultOpen className="mb-6">
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
          Engineer Assignments
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <EngineerAssignments jobId={id!} />
            <WhatsAppReply jobId={id!} engineers={engineers} />
          </div>
          <JobMessages jobId={id!} />
        </CollapsibleContent>
      </Collapsible>

      <Collapsible defaultOpen className="mb-6">
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
          Scheduled Visits
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <JobVisits jobId={id!} jobData={job} />
        </CollapsibleContent>
      </Collapsible>

      <Collapsible defaultOpen className="mb-6">
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
          Documents
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <div className="mb-3 flex justify-end">
            <Button
              variant="outline" size="sm" className="gap-1.5 text-xs"
              onClick={() => navigate(`/jobs/${id}/rams`)}
            >
              <ClipboardList className="h-3.5 w-3.5" /> Edit / Create RAMS
            </Button>
          </div>
          <JobDocuments jobId={id!} job={job} engineers={engineers} />
        </CollapsibleContent>
      </Collapsible>

      <Collapsible defaultOpen className="mb-6">
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
          Job Sheets
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <JobSheet jobId={id!} job={job} />
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

      {userRole === "admin" && (
        <div className="mb-6">
          <JobStatusPipeline currentStatus={job.status} onChange={handleStatusChange} />
        </div>
      )}

      <Collapsible defaultOpen className="mb-6">
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
          Parts & Materials
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <JobParts jobId={id!} jobCategory={job.category} jobName={job.name} />
        </CollapsibleContent>
      </Collapsible>

      <Collapsible defaultOpen className="mb-6">
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
          Servexa Reports
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <FieldReports jobId={id!} />
        </CollapsibleContent>
      </Collapsible>

      <Collapsible defaultOpen className="mb-6">
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
          Sign-Off Signatures
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-4">
          <SignatureCapture jobId={id!} />
          <div className="border-t pt-3 space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Customer handover sign-off</p>
              <JobHandoverLink jobId={id!} customerId={(job as any).customer_id} customerName={custName || ""} />
            </div>
            <div className="border-t pt-3">
              <p className="text-sm text-muted-foreground mb-2">Need the customer to sign off remotely (legacy)?</p>
              <CustomerSignOffLink jobId={id!} customerName={custName || ""} />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
      <Collapsible defaultOpen className="mb-6">
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
          Engineer Certificates
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <EngineerCertificates jobId={id!} engineers={engineers} />
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
    </>
  );
}
