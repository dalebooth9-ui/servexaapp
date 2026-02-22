import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Download, Trash2, ChevronDown, ArrowLeft, FileText } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import EngineerAssignments from "@/components/EngineerAssignments";
import WhatsAppReply from "@/components/WhatsAppReply";
import SubmissionFilters, { Filters } from "@/components/SubmissionFilters";
import LocationMap from "@/components/LocationMap";
import FieldReports from "@/components/FieldReports";
import FileDropZone from "@/components/FileDropZone";
import CreateInvoiceDialog from "@/components/CreateInvoiceDialog";
import JobVisits from "@/components/JobVisits";
import FaultCodeSelect from "@/components/FaultCodeSelect";
import CloneJobDialog from "@/components/CloneJobDialog";
import JobSheet from "@/components/JobSheet";
import JobParts from "@/components/JobParts";
import JobPdfReport from "@/components/JobPdfReport";
import JobStatusPipeline, { ALL_JOB_STATUSES, getStatusLabel } from "@/components/JobStatusPipeline";
import SignatureCapture from "@/components/SignatureCapture";
import CustomerSignOffLink from "@/components/CustomerSignOffLink";
import SendToCustomerMenu from "@/components/SendToCustomerMenu";
import SubmissionList from "@/components/jobs/SubmissionList";
import AddNoteInput from "@/components/jobs/AddNoteInput";
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
  const [job, setJob] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [engineers, setEngineers] = useState<{ id: string; name: string }[]>([]);
  const [customerEmail, setCustomerEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [filters, setFilters] = useState<Filters>({ type: "all", engineerId: "all", dateFrom: "", dateTo: "" });

  const { uploading, uploadFilesAsSubmissions } = useFileUpload({ onComplete: () => fetchData() });

  const fetchData = async () => {
    if (!id) return;
    const [jobRes, subsRes] = await Promise.all([
      supabase.from("jobs").select("*, customers(id, name, email)").eq("id", id).single(),
      supabase.from("submissions").select("*").eq("job_id", id).order("created_at", { ascending: false }),
    ]);
    setJob(jobRes.data);
    const subs = subsRes.data || [];
    setSubmissions(subs);

    // Get customer email from joined data
    if (jobRes.data?.customers?.email) {
      setCustomerEmail(jobRes.data.customers.email);
    } else if (jobRes.data?.customer) {
      // Fallback: lookup by name for legacy data
      const { data: custData } = await supabase
        .from("customers")
        .select("email")
        .eq("name", jobRes.data.customer)
        .limit(1)
        .maybeSingle();
      setCustomerEmail(custData?.email || "");
    }

    const engineerIds = [...new Set(subs.map((s: any) => s.engineer_id))];
    if (engineerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, whatsapp_number")
        .in("user_id", engineerIds);
      setEngineers((profiles || []).map((p) => ({ id: p.user_id, name: p.full_name || p.user_id, whatsappNumber: p.whatsapp_number })));
    }
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

  return (
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
              <Select
                value={job.category || "general"}
                onValueChange={async (v) => {
                  const { error } = await supabase.from("jobs").update({ category: v } as any).eq("id", id!);
                  if (error) { toast({ title: "Error", description: "Failed to update category.", variant: "destructive" }); }
                  else { setJob((prev: any) => ({ ...prev, category: v })); toast({ title: "Category updated" }); }
                }}
              >
                <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="installation">Installation</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="inspection">Inspection</SelectItem>
                  <SelectItem value="survey">Survey</SelectItem>
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
            <SendToCustomerMenu jobId={id!} job={job} customerEmail={customerEmail} />
            <JobPdfReport jobId={id!} job={job} />
            <CloneJobDialog sourceJob={job} />
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
          <JobParts jobId={id!} />
        </CollapsibleContent>
      </Collapsible>

      <Collapsible defaultOpen className="mb-6">
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
          Field Reports
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
          <div className="border-t pt-3">
            <p className="text-sm text-muted-foreground mb-2">Need the customer to sign off remotely?</p>
            <CustomerSignOffLink jobId={id!} customerName={custName || ""} />
          </div>
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
            {fileCount > 0 && (
              <Button size="sm" variant="outline" onClick={handleBatchDownload} disabled={downloading}>
                <Download className="mr-1.5 h-4 w-4" /> {downloading ? "Downloading..." : `Download ${fileCount} file(s)`}
              </Button>
            )}
          </div>

          <SubmissionList
            items={filtered}
            isAdmin={userRole === "admin"}
            onDelete={handleDeleteSubmission}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
