import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Image, FileText, MapPin, MessageSquare, Download, Upload, Eye, X, FileSpreadsheet, File } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import EngineerAssignments from "@/components/EngineerAssignments";
import WhatsAppReply from "@/components/WhatsAppReply";
import SubmissionFilters, { Filters } from "@/components/SubmissionFilters";
import LocationMap from "@/components/LocationMap";

const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx"];

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
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const [job, setJob] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [engineers, setEngineers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filters, setFilters] = useState<Filters>({ type: "all", engineerId: "all", dateFrom: "", dateTo: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !id || !user) return;

    setUploading(true);
    let uploadedCount = 0;

    for (const file of Array.from(files)) {
      const ext = getFileExtension(file.name);
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        toast({ title: "Unsupported file", description: `${file.name} is not a supported format. Use PDF, Word, or Excel files.`, variant: "destructive" });
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

      const { error: insertError } = await supabase.from("submissions").insert({
        job_id: id,
        engineer_id: user.id,
        type: "document",
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
    if (fileInputRef.current) fileInputRef.current.value = "";
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
      <Link to="/jobs" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Jobs
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{job.name}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{job.reference_number}</span>
            {job.client && <> • {job.client}</>}
            {job.address && <> • {job.address}</>}
          </p>
        </div>
        <Badge variant="secondary" className={job.status === "active" ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}>
          {job.status}
        </Badge>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <EngineerAssignments jobId={id!} />
        {userRole === "admin" && <WhatsAppReply jobId={id!} engineers={engineers} />}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Submissions ({filtered.length})</h2>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload className="mr-1.5 h-4 w-4" />
            {uploading ? "Uploading..." : "Upload Document"}
          </Button>
          {fileCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleBatchDownload} disabled={downloading}>
              <Download className="mr-1.5 h-4 w-4" />
              {downloading ? "Downloading..." : `Download ${fileCount} file(s)`}
            </Button>
          )}
        </div>
      </div>

      <SubmissionFilters filters={filters} onChange={setFilters} engineers={userRole === "admin" ? engineers : []} />

      {(() => {
        const locations = filtered.filter((s) => s.type === "location" && s.latitude != null && s.longitude != null);
        return locations.length > 0 ? <LocationMap locations={locations} /> : null;
      })()}

      <SubmissionList items={filtered} />
    </div>
  );
}

function SubmissionList({ items }: { items: any[] }) {
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [previewSub, setPreviewSub] = useState<any>(null);

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

  if (items.length === 0) {
    return <p className="py-12 text-center text-muted-foreground">No submissions match the current filters.</p>;
  }

  const previewUrl = previewSub ? signedUrls[previewSub.id] : null;
  const previewFileName = previewSub?.file_name || "";

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((sub) => {
          const resolvedUrl = signedUrls[sub.id] || undefined;
          const isDocument = sub.type === "document" && sub.file_name;
          return (
            <Card key={sub.id}>
              <CardContent className="p-4">
                {sub.type === "photo" && resolvedUrl && (
                  <img src={resolvedUrl} alt={sub.file_name || "Photo"} className="mb-3 h-48 w-full rounded-md object-cover" />
                )}
                {sub.type === "photo" && sub.content && (
                  <p className="mb-2 text-sm text-foreground">{sub.content}</p>
                )}
                {sub.type === "document" && (
                  <div className="mb-3 flex h-32 flex-col items-center justify-center rounded-md bg-muted gap-2">
                    {sub.file_name ? getDocIcon(sub.file_name) : <FileText className="h-10 w-10 text-muted-foreground" />}
                    {sub.file_name && (
                      <span className="max-w-full truncate px-2 text-xs text-muted-foreground">{sub.file_name}</span>
                    )}
                  </div>
                )}
                {sub.type === "document" && sub.content && (
                  <p className="mb-2 text-sm text-foreground">{sub.content}</p>
                )}
                {sub.type === "location" && (
                  <div className="mb-3 flex h-32 items-center justify-center rounded-md bg-muted">
                    <MapPin className="h-10 w-10 text-destructive" />
                    <span className="ml-2 text-xs text-muted-foreground">
                      {sub.latitude?.toFixed(4)}, {sub.longitude?.toFixed(4)}
                    </span>
                  </div>
                )}
                {sub.type === "note" && (
                  <div className="mb-3 rounded-md bg-muted p-3">
                    <MessageSquare className="mb-1 h-4 w-4 text-primary" />
                    <p className="text-sm">{sub.content}</p>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{new Date(sub.created_at).toLocaleString()}</span>
                  <div className="flex gap-2">
                    {isDocument && resolvedUrl && (
                      <button
                        onClick={() => setPreviewSub(sub)}
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      >
                        <Eye className="h-3 w-3" /> Preview
                      </button>
                    )}
                    {resolvedUrl && (
                      <a href={resolvedUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                        Download
                      </a>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

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
