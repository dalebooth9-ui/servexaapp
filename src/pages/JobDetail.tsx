import { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Image, FileText, MapPin, MessageSquare, Download, Upload, Eye, X, FileSpreadsheet, File, Trash2, ChevronDown, ArrowLeft, ArrowUpDown, SortAsc, RefreshCw } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import EngineerAssignments from "@/components/EngineerAssignments";
import WhatsAppReply from "@/components/WhatsAppReply";
import SubmissionFilters, { Filters } from "@/components/SubmissionFilters";
import LocationMap from "@/components/LocationMap";
import FieldReports from "@/components/FieldReports";
import SubmissionComments from "@/components/SubmissionComments";
import FileDropZone from "@/components/FileDropZone";
import PhotoLightbox from "@/components/PhotoLightbox";
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

const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".webp", ".gif"];

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

function getFileExtension(name: string): string {
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}

function getDocIcon(fileName: string) {
  const ext = getFileExtension(fileName);
  if (ext === ".pdf") return <FileText className="h-10 w-10 text-red-500" />;
  if ([".xls", ".xlsx"].includes(ext)) return <FileSpreadsheet className="h-10 w-10 text-green-600" />;
  if ([".doc", ".docx"].includes(ext)) return <File className="h-10 w-10 text-blue-600" />;
  return <FileText className="h-10 w-10 text-muted-foreground" />;
}

function canPreviewInBrowser(fileName: string): boolean {
  return getFileExtension(fileName) === ".pdf";
}

function getOfficeViewerUrl(signedUrl: string, fileName: string): string | null {
  const ext = getFileExtension(fileName);
  if ([".doc", ".docx", ".xls", ".xlsx"].includes(ext)) {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(signedUrl)}`;
  }
  return null;
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const [job, setJob] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [engineers, setEngineers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filters, setFilters] = useState<Filters>({ type: "all", engineerId: "all", dateFrom: "", dateTo: "" });

  const fetchData = async () => {
    if (!id) return;
    const [jobRes, subsRes] = await Promise.all([
      supabase.from("jobs").select("*").eq("id", id).single(),
      supabase.from("submissions").select("*").eq("job_id", id).order("created_at", { ascending: false }),
    ]);
    setJob(jobRes.data);
    const subs = subsRes.data || [];
    setSubmissions(subs);

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

  useEffect(() => {
    fetchData();
  }, [id]);

  // Realtime subscription for new submissions
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`submissions-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "submissions", filter: `job_id=eq.${id}` },
        (payload) => {
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

      // Auto-trigger customer email notifications
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
    if (!id || !user || files.length === 0) return;

    setUploading(true);
    let uploadedCount = 0;

    for (const file of files) {
      const ext = getFileExtension(file.name);
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        toast({ title: "Unsupported file", description: `${file.name} is not a supported format.`, variant: "destructive" });
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast({ title: "File too large", description: `${file.name} exceeds the 20MB limit.`, variant: "destructive" });
        continue;
      }

      const filePath = `${id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("submissions").upload(filePath, file);

      if (uploadError) {
        toast({ title: "Upload failed", description: `Failed to upload ${file.name}.`, variant: "destructive" });
        continue;
      }

      const { data: urlData } = supabase.storage.from("submissions").getPublicUrl(filePath);

      const isImage = IMAGE_EXTENSIONS.includes(ext);
      const { error: insertError } = await supabase.from("submissions").insert({
        job_id: id,
        engineer_id: user.id,
        type: isImage ? "photo" : "document",
        file_url: urlData.publicUrl,
        file_name: file.name,
      });

      if (insertError) {
        toast({ title: "Error", description: `Failed to save record for ${file.name}.`, variant: "destructive" });
      } else {
        uploadedCount++;
      }
    }

    if (uploadedCount > 0) {
      toast({ title: "Upload complete", description: `${uploadedCount} file(s) uploaded.` });
      fetchData();
    }
    setUploading(false);
  };
  const handleDeleteSubmission = async (sub: any) => {
    // Delete file from storage if it exists
    if (sub.file_url) {
      const path = extractStoragePath(sub.file_url);
      if (path) {
        await supabase.storage.from("submissions").remove([path]);
      }
    }
    // Delete the submission record
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
          {job.customer && (
            <>
              <BreadcrumbItem><BreadcrumbPage>{job.customer}</BreadcrumbPage></BreadcrumbItem>
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
            {job.customer && <> • {job.customer}</>}
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
                <SelectTrigger className="h-7 w-[110px] text-xs">
                  <SelectValue />
                </SelectTrigger>
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
                <SelectTrigger className="h-7 w-[130px] text-xs">
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
              <FaultCodeSelect
                value={job.fault_code_id || null}
                onChange={async (v) => {
                  const { error } = await supabase.from("jobs").update({ fault_code_id: v } as any).eq("id", id!);
                  if (error) { toast({ title: "Error", description: "Failed to update result.", variant: "destructive" }); }
                  else { setJob((prev: any) => ({ ...prev, fault_code_id: v })); toast({ title: "Result updated" }); }
                }}
              />
            </div>
          ) : (
            <div className="mt-1.5 flex items-center gap-2">
              <Badge variant={job.priority === "high" ? "destructive" : "secondary"} className="text-[10px] uppercase">
                {job.priority || "medium"} priority
              </Badge>
              {job.category && job.category !== "general" && (
                <Badge variant="outline" className="text-[10px] uppercase">
                  {job.category}
                </Badge>
              )}
            </div>
          )}
        </div>
        {userRole === "admin" ? (
          <div className="flex items-center gap-2">
            <JobPdfReport jobId={id!} job={job} />
            <CloneJobDialog sourceJob={job} />
            {(job.status === "completed" || job.status === "archived") && (
              <CreateInvoiceDialog
                jobId={id!}
                customerName={job.customer || ""}
                customerAddress={job.address || ""}
                jobName={job.name}
              />
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
            {userRole === "admin" && <WhatsAppReply jobId={id!} engineers={engineers} />}
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

      {/* Status Pipeline */}
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
            <CustomerSignOffLink jobId={id!} customerName={job.customer || ""} />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible defaultOpen className="mb-6">
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
          Job Sheet & Activity
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
        <CollapsibleContent className="pt-3">
          <div className="mb-4">
            <FileDropZone
              onFilesSelected={handleBulkUpload}
              uploading={uploading}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.gif"
              allowedExtensions={ALLOWED_EXTENSIONS}
            />
          </div>

          {(fileCount > 0 || filtered.length > 0) && (
            <div className="mb-4 flex justify-end gap-2">
              {fileCount > 0 && (
                <Button variant="outline" size="sm" onClick={handleBatchDownload} disabled={downloading}>
                  <Download className="mr-1.5 h-4 w-4" />
                  {downloading ? "Downloading..." : `Download All ${fileCount} file(s)`}
                </Button>
              )}
              {userRole === "admin" && filtered.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="mr-1.5 h-4 w-4" /> Delete All ({filtered.length})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete all submissions?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete {filtered.length} submission(s) and their associated files. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={async () => {
                          const toDelete = [...filtered];
                          // Delete storage files
                          const paths = toDelete
                            .filter((s) => s.file_url)
                            .map((s) => extractStoragePath(s.file_url))
                            .filter(Boolean) as string[];
                          if (paths.length > 0) {
                            await supabase.storage.from("submissions").remove(paths);
                          }
                          // Delete records
                          const ids = toDelete.map((s) => s.id);
                          const { error } = await supabase.from("submissions").delete().in("id", ids);
                          if (error) {
                            toast({ title: "Error", description: "Failed to delete submissions.", variant: "destructive" });
                          } else {
                            toast({ title: "Deleted", description: `${toDelete.length} submission(s) removed.` });
                            setSubmissions((prev) => prev.filter((s) => !ids.includes(s.id)));
                          }
                        }}
                      >
                        Delete All
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )}

          <SubmissionFilters filters={filters} onChange={setFilters} engineers={userRole === "admin" ? engineers : []} />

          {(() => {
            const locations = filtered.filter((s) => s.type === "location" && s.latitude != null && s.longitude != null);
            return locations.length > 0 ? <LocationMap locations={locations} /> : null;
          })()}

          <SubmissionList items={filtered} isAdmin={userRole === "admin"} onDelete={handleDeleteSubmission} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function SubmissionList({ items, isAdmin, onDelete }: { items: any[]; isAdmin: boolean; onDelete: (sub: any) => Promise<void> }) {
  const { toast } = useToast();
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [previewSub, setPreviewSub] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [sortBy, setSortBy] = useState<"date" | "name">("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [replacingSub, setReplacingSub] = useState<any>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const generateSignedUrls = async () => {
      const filesWithUrls = items.filter((s) => s.file_url);
      if (filesWithUrls.length === 0) return;
      const urls: Record<string, string> = {};
      await Promise.all(
        filesWithUrls.map(async (sub) => {
          const path = extractStoragePath(sub.file_url);
          if (!path) return;
          const { data } = await supabase.storage.from("submissions").createSignedUrl(path, 3600);
          if (data?.signedUrl) urls[sub.id] = data.signedUrl;
        })
      );
      setSignedUrls(urls);
    };
    generateSignedUrls();
  }, [items]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [items]);

  if (items.length === 0) {
    return <p className="py-12 text-center text-muted-foreground">No submissions match the current filters.</p>;
  }

  const sortedItems = [...items].sort((a, b) => {
    if (sortBy === "name") {
      const nameA = (a.file_name || a.content || "").toLowerCase();
      const nameB = (b.file_name || b.content || "").toLowerCase();
      return sortAsc ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    }
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return sortAsc ? dateA - dateB : dateB - dateA;
  });

  const selectableItems = items.filter((s) => s.file_url);
  const allSelected = selectableItems.length > 0 && selectableItems.every((s) => selectedIds.has(s.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableItems.map((s) => s.id)));
    }
  };

  const handleBulkSelectedDownload = async () => {
    const selected = items.filter((s) => selectedIds.has(s.id) && s.file_url);
    if (selected.length === 0) return;
    setBulkDownloading(true);
    for (const sub of selected) {
      const url = signedUrls[sub.id];
      if (url) {
        const link = document.createElement("a");
        link.href = url;
        link.download = sub.file_name || "download";
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    setBulkDownloading(false);
    toast({ title: "Downloads started", description: `${selected.length} file(s) downloading.` });
  };

  const handleReplaceSubmission = async (file: File) => {
    if (!replacingSub) return;
    const ext = getFileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(ext) || file.size > 20 * 1024 * 1024) {
      toast({ title: "Invalid file", description: "Only supported file types under 20MB are accepted.", variant: "destructive" });
      setReplacingSub(null);
      return;
    }

    // Remove old file
    if (replacingSub.file_url) {
      const oldPath = extractStoragePath(replacingSub.file_url);
      if (oldPath) await supabase.storage.from("submissions").remove([oldPath]);
    }

    // Upload new file
    const jobId = replacingSub.job_id;
    const newPath = `${jobId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("submissions").upload(newPath, file);
    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setReplacingSub(null);
      return;
    }

    const { data: urlData } = supabase.storage.from("submissions").getPublicUrl(newPath);
    const isImage = IMAGE_EXTENSIONS.includes(ext);

    await supabase.from("submissions").update({
      file_url: urlData.publicUrl,
      file_name: file.name,
      type: isImage ? "photo" : "document",
    }).eq("id", replacingSub.id);

    toast({ title: "File replaced", description: `${replacingSub.file_name} → ${file.name}` });
    setReplacingSub(null);
    if (replaceInputRef.current) replaceInputRef.current.value = "";
    // Refresh signed URLs
    const { data } = await supabase.storage.from("submissions").createSignedUrl(newPath, 3600);
    if (data?.signedUrl) {
      setSignedUrls((prev) => ({ ...prev, [replacingSub.id]: data.signedUrl }));
    }
  };

  const previewUrl = previewSub ? signedUrls[previewSub.id] : null;
  const previewFileName = previewSub?.file_name || "";

  const photoItems = items.filter((s) => s.type === "photo" && signedUrls[s.id]);
  const lightboxPhotos = photoItems.map((s) => ({
    id: s.id,
    url: signedUrls[s.id],
    fileName: s.file_name,
    date: s.created_at,
  }));

  const openLightbox = (subId: string) => {
    const idx = photoItems.findIndex((s) => s.id === subId);
    if (idx >= 0) {
      setLightboxIndex(idx);
      setLightboxOpen(true);
    }
  };

  const handleSort = (field: "date" | "name") => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      setSortAsc(field === "name");
    }
  };

  const getTypeIcon = (sub: any) => {
    if (sub.type === "photo") return <Image className="h-4 w-4 text-muted-foreground" />;
    if (sub.type === "document" && sub.file_name) {
      const ext = getFileExtension(sub.file_name);
      if (ext === ".pdf") return <FileText className="h-4 w-4 text-destructive" />;
      if ([".xls", ".xlsx"].includes(ext)) return <FileSpreadsheet className="h-4 w-4 text-accent" />;
      if ([".doc", ".docx"].includes(ext)) return <File className="h-4 w-4 text-primary" />;
    }
    if (sub.type === "location") return <MapPin className="h-4 w-4 text-destructive" />;
    if (sub.type === "note") return <MessageSquare className="h-4 w-4 text-primary" />;
    return <FileText className="h-4 w-4 text-muted-foreground" />;
  };

  const getDisplayName = (sub: any) => {
    if (sub.file_name) return sub.file_name;
    if (sub.type === "location") return `Location (${sub.latitude?.toFixed(4)}, ${sub.longitude?.toFixed(4)})`;
    if (sub.type === "note" && sub.content) return sub.content.length > 60 ? sub.content.slice(0, 60) + "…" : sub.content;
    return sub.type;
  };

  return (
    <>
      <input
        ref={replaceInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.gif"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) handleReplaceSubmission(e.target.files[0]);
        }}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {selectableItems.length > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} id="select-all" />
            <label htmlFor="select-all" className="text-sm text-muted-foreground cursor-pointer">Select all</label>
          </div>
        )}
        {selectedIds.size > 0 && (
          <Button variant="outline" size="sm" onClick={handleBulkSelectedDownload} disabled={bulkDownloading}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {bulkDownloading ? "Downloading..." : `Download ${selectedIds.size} selected`}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant={sortBy === "date" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => handleSort("date")}
            className="text-xs"
          >
            <ArrowUpDown className="mr-1 h-3 w-3" />
            Date {sortBy === "date" ? (sortAsc ? "↑" : "↓") : ""}
          </Button>
          <Button
            variant={sortBy === "name" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => handleSort("name")}
            className="text-xs"
          >
            <SortAsc className="mr-1 h-3 w-3" />
            Name {sortBy === "name" ? (sortAsc ? "A→Z" : "Z→A") : ""}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 px-2"></TableHead>
                <TableHead>File</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedItems.map((sub) => {
                const resolvedUrl = signedUrls[sub.id] || undefined;
                const isDocument = sub.type === "document" && sub.file_name;
                const hasFile = !!sub.file_url;
                return (
                  <TableRow key={sub.id} className={`${selectedIds.has(sub.id) ? "bg-primary/5" : ""} ${hasFile ? "cursor-pointer" : ""}`} onDoubleClick={() => {
                    if (sub.type === "photo" && resolvedUrl) { openLightbox(sub.id); }
                    else if (isDocument && resolvedUrl) { setPreviewSub(sub); }
                    else if (resolvedUrl) { window.open(resolvedUrl, "_blank"); }
                  }}>
                    <TableCell className="w-10 px-2">
                      {hasFile && (
                        <Checkbox
                          checked={selectedIds.has(sub.id)}
                          onCheckedChange={() => toggleSelect(sub.id)}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {sub.type === "photo" && resolvedUrl ? (
                          <img
                            src={resolvedUrl}
                            alt={sub.file_name || "Photo"}
                            className="h-8 w-8 rounded object-cover cursor-pointer flex-shrink-0"
                            onClick={() => openLightbox(sub.id)}
                          />
                        ) : (
                          getTypeIcon(sub)
                        )}
                        <span className="text-sm font-medium truncate max-w-[300px]">
                          {getDisplayName(sub)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {sub.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(sub.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {isDocument && resolvedUrl && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewSub(sub)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        {resolvedUrl && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                            <a href={resolvedUrl} target="_blank" rel="noreferrer">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        {hasFile && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Replace with edited version" onClick={() => {
                            setReplacingSub(sub);
                            setTimeout(() => replaceInputRef.current?.click(), 50);
                          }}>
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                        {isAdmin && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={deletingId === sub.id}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete submission?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete {sub.file_name || "this submission"} and its associated file.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={async () => {
                                    setDeletingId(sub.id);
                                    await onDelete(sub);
                                    setDeletingId(null);
                                  }}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!previewSub} onOpenChange={(open) => !open && setPreviewSub(null)}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-base">
              {previewFileName && getDocIcon(previewFileName)}
              <span className="truncate">{previewFileName}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden px-6 pb-6">
            {previewUrl && canPreviewInBrowser(previewFileName) && (
              <iframe
                src={previewUrl}
                className="h-full w-full rounded-md border"
                title="Document preview"
              />
            )}
            {previewUrl && !canPreviewInBrowser(previewFileName) && getOfficeViewerUrl(previewUrl, previewFileName) && (
              <iframe
                src={getOfficeViewerUrl(previewUrl, previewFileName)!}
                className="h-full w-full rounded-md border"
                title="Document preview"
              />
            )}
            {previewUrl && !canPreviewInBrowser(previewFileName) && !getOfficeViewerUrl(previewUrl, previewFileName) && (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
                <FileText className="h-16 w-16" />
                <p>Preview not available for this file type.</p>
                <a href={previewUrl} target="_blank" rel="noreferrer">
                  <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Download to view</Button>
                </a>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <PhotoLightbox
        photos={lightboxPhotos}
        currentIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={setLightboxIndex}
      />
    </>
  );
}

function extractStoragePath(fileUrl: string): string | null {
  if (!fileUrl) return null;
  const match = fileUrl.match(/\/object\/(?:public|sign)\/submissions\/(.+?)(?:\?|$)/);
  if (match) return match[1];
  if (!fileUrl.startsWith("http")) return fileUrl;
  return null;
}
