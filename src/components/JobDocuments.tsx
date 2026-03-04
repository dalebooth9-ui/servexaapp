import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Trash2, Upload, Loader2, Zap } from "lucide-react";
import { generateRamsPdf } from "@/lib/ramsPdf";
import BlankTemplatePdfExport from "@/components/BlankTemplatePdfExport";

type JobDoc = {
  id: string;
  job_id: string;
  document_type: string;
  label: string;
  file_url: string | null;
  file_name: string | null;
  source: string;
  created_at: string;
};

type Props = {
  jobId: string;
  job: any;
  engineers: { id: string; name: string }[];
};

export default function JobDocuments({ jobId, job, engineers }: Props) {
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const [docs, setDocs] = useState<JobDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingRams, setGeneratingRams] = useState(false);
  const [uploadingManual, setUploadingManual] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jobInfo, setJobInfo] = useState<any | null>(null);
  const [blankTemplates, setBlankTemplates] = useState<Record<string, any>>({});

  const fetchDocs = async () => {
    const { data } = await supabase
      .from("job_documents" as any)
      .select("*")
      .eq("job_id", jobId)
      .order("created_at");
    setDocs((data as unknown as JobDoc[]) || []);
    setLoading(false);
  };

  // Fetch full job info including site/customer for PDF generation
  const fetchJobInfo = async () => {
    const { data: jd } = await supabase
      .from("jobs")
      .select("name, address, customer, reference_number, category, status, priority, visual_qty, pressure_test_qty, other_qty, other_service_type, customer_id, site_id, customers(name, email, phone), sites(name, address, postcode, contact_name, contact_phone, contact_email, riser_location)")
      .eq("id", jobId)
      .single();
    if (!jd) return;
    const j = jd as any;
    let engineerNames: string[] = [];
    const { data: assigns } = await supabase.from("job_assignments").select("engineer_id").eq("job_id", jobId);
    if (assigns && assigns.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", assigns.map((a: any) => a.engineer_id));
      engineerNames = (profs || []).map((p: any) => p.full_name).filter(Boolean);
    }
    setJobInfo({
      name: j.name,
      address: j.address,
      customer: j.customers?.name || j.customer,
      customers: j.customers ? { name: j.customers.name } : null,
      customer_email: j.customers?.email || null,
      customer_phone: j.customers?.phone || null,
      reference_number: j.reference_number,
      category: j.category,
      status: j.status,
      priority: j.priority,
      visual_qty: j.visual_qty,
      pressure_test_qty: j.pressure_test_qty,
      other_qty: j.other_qty ?? 0,
      other_service_type: j.other_service_type ?? null,
      engineers: engineerNames,
      site: j.sites ? { name: j.sites.name, address: j.sites.address, postcode: j.sites.postcode, contact_name: j.sites.contact_name, contact_phone: j.sites.contact_phone, contact_email: j.sites.contact_email, riser_location: j.sites.riser_location } : null,
    });
    // Fetch templates for blank_job_sheet docs
    const { data: tpls } = await supabase.from("job_sheet_templates").select("*");
    if (tpls) {
      const map: Record<string, any> = {};
      (tpls as any[]).forEach((t) => {
        map[t.id] = { ...t, fields: typeof t.fields === "string" ? JSON.parse(t.fields) : t.fields, branding: t.branding || {} };
      });
      setBlankTemplates(map);
    }
  };

  useEffect(() => { fetchDocs(); fetchJobInfo(); }, [jobId]);

  // Auto-attach documents from category templates when the component mounts
  useEffect(() => {
    if (!job?.category || !user || userRole !== "admin") return;
    if (job?.status === "completed" || job?.status === "cancelled") return;
    autoAttachCategoryDocuments();
  }, [job?.category]);

  const autoAttachCategoryDocuments = async () => {
    if (!job?.category) return;
    // Fetch enabled templates for this category
    const { data: catTemplates } = await supabase
      .from("category_document_templates" as any)
      .select("*")
      .eq("category_slug", job.category)
      .eq("enabled", true)
      .order("sort_order");

    if (!catTemplates || catTemplates.length === 0) return;

    // Get existing auto-attached docs to avoid duplicates
    const { data: existingDocs } = await supabase
      .from("job_documents" as any)
      .select("category_template_id")
      .eq("job_id", jobId)
      .eq("source", "auto");

    const existingTemplateIds = new Set((existingDocs || []).map((d: any) => d.category_template_id));

    const toInsert = (catTemplates as any[])
      .filter((t) => !existingTemplateIds.has(t.id))
      .map((t) => ({
        job_id: jobId,
        document_type: t.document_type,
        label: t.label,
        file_url: t.document_type === "uploaded_file" ? t.file_url : null,
        file_name: t.document_type === "uploaded_file" ? t.file_name : null,
        source: "auto",
        category_template_id: t.id,
        created_by: user?.id,
      }));

    if (toInsert.length > 0) {
      await supabase.from("job_documents" as any).insert(toInsert as any);
      fetchDocs();
    }
  };

  const handleGenerateRams = async () => {
    setGeneratingRams(true);
    try {
      // Fetch site data
      let siteData = null;
      if (job.site_id) {
        const { data: s } = await supabase.from("sites").select("*").eq("id", job.site_id).single();
        siteData = s;
      }
      // Fetch customer
      let customerData = null;
      if (job.customer_id) {
        const { data: c } = await supabase.from("customers").select("*").eq("id", job.customer_id).single();
        customerData = c;
      }

      const jobInfo = {
        ...job,
        site: siteData,
        customer: customerData,
        reference_number: job.reference_number,
      };

      const operatives = engineers.map((e) => ({ name: e.name, sig: "", date: "" }));

      // Fetch earliest scheduled date for attendance date auto-population
      let attendanceDate = "";
      const { data: schedules } = await supabase
        .from("job_schedule")
        .select("schedule_date")
        .eq("job_id", jobId)
        .order("schedule_date", { ascending: true })
        .limit(1);
      if (schedules && schedules.length > 0) {
        attendanceDate = new Date(schedules[0].schedule_date).toLocaleDateString("en-GB");
      }

      const { base64, fileName } = await generateRamsPdf({ rams_attendance_date: attendanceDate }, jobInfo, operatives);
      const byteCharacters = atob(base64);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast({ title: "RAMS PDF opened", description: fileName });
    } catch (e) {
      toast({ title: "Error generating RAMS PDF", variant: "destructive" });
    }
    setGeneratingRams(false);
  };

  const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    e.target.value = "";
    setUploadingManual(true);

    const path = `job-documents/${jobId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("submissions").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Upload failed", variant: "destructive" });
    } else {
      const { data: urlData } = await supabase.storage.from("submissions").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (urlData?.signedUrl) {
        await supabase.from("job_documents" as any).insert({
          job_id: jobId,
          document_type: "uploaded_file",
          label: file.name,
          file_url: urlData.signedUrl,
          file_name: file.name,
          source: "manual",
          created_by: user.id,
        } as any);
        fetchDocs();
        toast({ title: "Document attached" });
      }
    }
    setUploadingManual(false);
  };

  const handleDelete = async (doc: JobDoc) => {
    setDeletingId(doc.id);
    await supabase.from("job_documents" as any).delete().eq("id", doc.id);
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    toast({ title: "Document removed" });
    setDeletingId(null);
  };

  const handleDownload = async (doc: JobDoc) => {
    if (!doc.file_url) return;
    const link = document.createElement("a");
    link.href = doc.file_url;
    link.download = doc.file_name || doc.label;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading documents…</p>;

  const autoAttached = docs.filter((d) => d.source === "auto");
  const manualDocs = docs.filter((d) => d.source === "manual");

  return (
    <div className="space-y-4">
      {/* Auto-attached documents */}
      {autoAttached.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Zap className="h-3 w-3" /> Auto-attached for this job type
          </p>
          <div className="space-y-2">
            {autoAttached.map((doc) => (
              <DocRow
                key={doc.id}
                doc={doc}
                isAdmin={userRole === "admin"}
                deleting={deletingId === doc.id}
                onDelete={handleDelete}
                onDownload={handleDownload}
                onGenerateRams={handleGenerateRams}
                generatingRams={generatingRams}
                jobId={jobId}
                job={job}
                jobInfo={jobInfo}
                blankTemplates={blankTemplates}
              />
            ))}
          </div>
        </div>
      )}

      {/* Manual documents */}
      {manualDocs.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Additional Documents</p>
          <div className="space-y-2">
            {manualDocs.map((doc) => (
              <DocRow
                key={doc.id}
                doc={doc}
                isAdmin={userRole === "admin"}
                deleting={deletingId === doc.id}
                onDelete={handleDelete}
                onDownload={handleDownload}
                onGenerateRams={handleGenerateRams}
                generatingRams={generatingRams}
                jobId={jobId}
                job={job}
                jobInfo={jobInfo}
                blankTemplates={blankTemplates}
              />
            ))}
          </div>
        </div>
      )}

      {docs.length === 0 && (
        <p className="text-sm text-muted-foreground">No documents configured for this job type. Attach one manually below, or configure auto-attachments in Settings.</p>
      )}

      {/* Admin actions */}
      {userRole === "admin" && (
        <div className="flex items-center gap-2 pt-2 border-t">
          <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={handleManualUpload} />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingManual}
          >
            {uploadingManual ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Attach Document
          </Button>
        </div>
      )}
    </div>
  );
}

function DocRow({
  doc,
  isAdmin,
  deleting,
  onDelete,
  onDownload,
  onGenerateRams,
  generatingRams,
  jobId,
  job,
  jobInfo,
  blankTemplates,
}: {
  doc: JobDoc;
  isAdmin: boolean;
  deleting: boolean;
  onDelete: (d: JobDoc) => void;
  onDownload: (d: JobDoc) => void;
  onGenerateRams: () => void;
  generatingRams: boolean;
  jobId: string;
  job: any;
  jobInfo: any | null;
  blankTemplates: Record<string, any>;
}) {
  const isRams = doc.document_type === "rams_pdf";
  const isBlankSheet = doc.document_type === "blank_job_sheet";
  const hasFile = !!doc.file_url;

  // Find matching template for blank job sheet by label
  const matchedTemplate = isBlankSheet
    ? Object.values(blankTemplates).find((t: any) =>
        t.name?.toLowerCase() === doc.label?.toLowerCase() ||
        doc.label?.toLowerCase().includes(t.name?.toLowerCase()) ||
        t.name?.toLowerCase().includes(doc.label?.toLowerCase())
      ) ?? null
    : null;

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{doc.label}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Badge variant="secondary" className="text-[10px]">
            {doc.document_type === "rams_pdf" ? "RAMS PDF" :
             doc.document_type === "blank_job_sheet" ? "Blank Job Sheet" : "File"}
          </Badge>
          {doc.source === "auto" && (
            <Badge variant="outline" className="text-[10px] gap-0.5">
              <Zap className="h-2.5 w-2.5" /> Auto
            </Badge>
          )}
          {doc.file_name && doc.document_type === "uploaded_file" && (
            <span className="text-[10px] text-muted-foreground truncate">{doc.file_name}</span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {isRams && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2 gap-1 shrink-0"
          onClick={onGenerateRams}
          disabled={generatingRams}
        >
          {generatingRams ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
          Generate
        </Button>
      )}
      {isBlankSheet && matchedTemplate && jobInfo && (
        <BlankTemplatePdfExport template={matchedTemplate} jobInfo={jobInfo} />
      )}
      {isBlankSheet && (!matchedTemplate || !jobInfo) && (
        <span className="text-[10px] text-muted-foreground">Loading…</span>
      )}
      {hasFile && doc.document_type === "uploaded_file" && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2 gap-1 shrink-0"
          onClick={() => onDownload(doc)}
        >
          <Download className="h-3 w-3" /> Open
        </Button>
      )}

      {isAdmin && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
          onClick={() => onDelete(doc)}
          disabled={deleting}
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      )}
    </div>
  );
}
