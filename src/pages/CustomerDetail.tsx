import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Building2, Mail, Phone, MapPin, Upload, Loader2, FileText, Image, Trash2, Download, ArrowLeft, ArrowUpDown, SortAsc } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".webp", ".gif"];

type Customer = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
};

type Job = {
  id: string;
  name: string;
  reference_number: string;
  status: string;
  priority: string;
  category: string;
  address: string | null;
  created_at: string;
};

type CustomerDocument = {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  created_at: string;
};

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [documents, setDocuments] = useState<CustomerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [docSortBy, setDocSortBy] = useState<"date" | "name">("date");
  const [docSortAsc, setDocSortAsc] = useState(false);
  const fetchDocuments = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("customer_documents")
      .select("id, file_name, file_url, file_size, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false });
    setDocuments((data as CustomerDocument[]) || []);
  }, [id]);

  const fetchJobs = useCallback(async (customerName: string) => {
    const { data } = await supabase
      .from("jobs")
      .select("*")
      .eq("customer", customerName)
      .order("created_at", { ascending: false });
    setJobs((data as Job[]) || []);
  }, []);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const { data: cust } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id)
        .single();
      setCustomer(cust as Customer | null);

      if (cust) {
        await fetchJobs(cust.name);
      }
      await fetchDocuments();
      setLoading(false);
    };
    fetchData();
  }, [id, fetchJobs, fetchDocuments]);

  const handleFileUpload = async (files: FileList) => {
    if (!user || !id) return;
    setUploading(true);
    setUploadProgress(0);

    const validFiles = Array.from(files).filter((f) => {
      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
      return ALLOWED_EXTENSIONS.includes(ext) && f.size <= 20 * 1024 * 1024;
    });

    if (validFiles.length === 0) {
      toast({ title: "No valid files", description: "Only PDF, Word, Excel, and image files under 20MB are accepted.", variant: "destructive" });
      setUploading(false);
      return;
    }

    let processed = 0;
    for (const file of validFiles) {
      const filePath = `customer-docs/${id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("submissions").upload(filePath, file);

      if (uploadError) {
        toast({ title: "Upload failed", description: `Failed to upload ${file.name}.`, variant: "destructive" });
      } else {
        await supabase.from("customer_documents").insert({
          customer_id: id,
          file_name: file.name,
          file_url: filePath,
          file_size: file.size,
          uploaded_by: user.id,
        } as any);
      }
      processed++;
      setUploadProgress(Math.round((processed / validFiles.length) * 100));
    }

    toast({ title: "Upload complete", description: `${validFiles.length} file(s) uploaded.` });
    setUploading(false);
    setUploadProgress(0);
    await fetchDocuments();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteDocument = async (doc: CustomerDocument) => {
    // Handle both old public URLs and new storage paths
    let storagePath: string;
    if (doc.file_url.includes("/submissions/")) {
      const urlParts = doc.file_url.split("/submissions/");
      storagePath = decodeURIComponent(urlParts[urlParts.length - 1]);
    } else {
      storagePath = doc.file_url;
    }
    await supabase.storage.from("submissions").remove([storagePath]);
    await supabase.from("customer_documents").delete().eq("id", doc.id);
    toast({ title: "Deleted", description: `${doc.file_name} removed.` });
    setSelectedDocIds((prev) => { const u = new Set(prev); u.delete(doc.id); return u; });
    await fetchDocuments();
  };

  const handleBulkDeleteDocuments = async () => {
    const ids = Array.from(selectedDocIds);
    const docsToDelete = documents.filter((d) => selectedDocIds.has(d.id));
    
    // Remove files from storage
    const paths = docsToDelete
      .map((d) => { const parts = d.file_url.split("/submissions/"); return parts.length > 1 ? decodeURIComponent(parts[1]) : null; })
      .filter(Boolean) as string[];
    if (paths.length > 0) await supabase.storage.from("submissions").remove(paths);
    
    await supabase.from("customer_documents").delete().in("id", ids);
    toast({ title: "Deleted", description: `${ids.length} document(s) removed.` });
    setSelectedDocIds(new Set());
    await fetchDocuments();
  };

  const toggleDocSelect = (id: string, checked: boolean) => {
    setSelectedDocIds((prev) => {
      const u = new Set(prev);
      if (checked) u.add(id); else u.delete(id);
      return u;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) setSelectedDocIds(new Set(documents.map((d) => d.id)));
    else setSelectedDocIds(new Set());
  };

  const getFileIcon = (name: string) => {
    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext)
      ? <Image className="h-4 w-4 text-muted-foreground" />
      : <FileText className="h-4 w-4 text-muted-foreground" />;
  };

  const statusColor = (s: string) =>
    s === "active" ? "bg-accent/10 text-accent" : s === "completed" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground";

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading…</div>;
  if (!customer) return <div className="flex h-64 items-center justify-center text-muted-foreground">Customer not found.</div>;

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
            <BreadcrumbLink asChild><Link to="/customers">Customers</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{customer.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Building2 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{customer.name}</h1>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {customer.email && (
            <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {customer.email}</span>
          )}
          {customer.phone && (
            <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {customer.phone}</span>
          )}
          {customer.address && (
            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {customer.address}</span>
          )}
        </div>
      </div>

      {/* Documents Section */}
      <div
        className="mb-8"
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current++; setDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current--; if (dragCounterRef.current === 0) setDragging(false); }}
        onDrop={(e) => {
          e.preventDefault(); e.stopPropagation(); dragCounterRef.current = 0; setDragging(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files);
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Documents ({documents.length})</h2>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.gif"
              className="hidden"
              onChange={(e) => { if (e.target.files && e.target.files.length > 0) handleFileUpload(e.target.files); }}
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload Files
            </Button>
          </div>
        </div>

        {uploading && (
          <div className="mb-4">
            <Progress value={uploadProgress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">{uploadProgress}%</p>
          </div>
        )}

        {dragging && !uploading && (
          <div className="mb-4 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-primary/5 p-8 text-center transition-colors">
            <Upload className="h-6 w-6 text-primary" />
            <p className="font-medium text-primary">Drop files here to upload</p>
          </div>
        )}

        {selectedDocIds.size > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
            <span className="text-sm font-medium">{selectedDocIds.size} document(s) selected</span>
            <Button variant="ghost" size="sm" onClick={() => setSelectedDocIds(new Set())}>Clear</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="mr-2 h-4 w-4" /> Delete Selected
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selectedDocIds.size} document(s)?</AlertDialogTitle>
                  <AlertDialogDescription>This will permanently delete the selected documents. This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleBulkDeleteDocuments}>
                    Delete {selectedDocIds.size} Document(s)
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            {documents.length === 0 && !dragging ? (
              <p className="p-8 text-center text-muted-foreground">No documents uploaded yet. Drag &amp; drop files here or click Upload.</p>
            ) : (
              <>
                <div className="flex items-center justify-end gap-1 px-4 pt-3 pb-1">
                  <Button
                    variant={docSortBy === "date" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => { if (docSortBy === "date") setDocSortAsc(!docSortAsc); else { setDocSortBy("date"); setDocSortAsc(false); } }}
                    className="text-xs"
                  >
                    <ArrowUpDown className="mr-1 h-3 w-3" />
                    Date {docSortBy === "date" ? (docSortAsc ? "↑" : "↓") : ""}
                  </Button>
                  <Button
                    variant={docSortBy === "name" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => { if (docSortBy === "name") setDocSortAsc(!docSortAsc); else { setDocSortBy("name"); setDocSortAsc(true); } }}
                    className="text-xs"
                  >
                    <SortAsc className="mr-1 h-3 w-3" />
                    Name {docSortBy === "name" ? (docSortAsc ? "A→Z" : "Z→A") : ""}
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 px-2">
                        <Checkbox
                          checked={documents.length > 0 && selectedDocIds.size === documents.length ? true : selectedDocIds.size > 0 ? "indeterminate" : false}
                          onCheckedChange={(checked) => toggleSelectAll(!!checked)}
                        />
                      </TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...documents].sort((a, b) => {
                      if (docSortBy === "name") {
                        return docSortAsc
                          ? a.file_name.toLowerCase().localeCompare(b.file_name.toLowerCase())
                          : b.file_name.toLowerCase().localeCompare(a.file_name.toLowerCase());
                      }
                      const dateA = new Date(a.created_at).getTime();
                      const dateB = new Date(b.created_at).getTime();
                      return docSortAsc ? dateA - dateB : dateB - dateA;
                    }).map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="w-10 px-2">
                          <Checkbox
                            checked={selectedDocIds.has(doc.id)}
                            onCheckedChange={(checked) => toggleDocSelect(doc.id, !!checked)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getFileIcon(doc.file_name)}
                            <span className="font-medium text-sm truncate max-w-[300px]">{doc.file_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(doc.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={async () => {
                              const storagePath = doc.file_url.includes("/object/public/submissions/")
                                ? decodeURIComponent(doc.file_url.split("/object/public/submissions/")[1])
                                : doc.file_url;
                              const { data } = await supabase.storage.from("submissions").createSignedUrl(storagePath, 3600);
                              if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                            }}>
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteDocument(doc)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Jobs Section */}
      <h2 className="text-lg font-semibold mb-3">Jobs ({jobs.length})</h2>
      <Card>
        <CardContent className="p-0">
          {jobs.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No jobs associated with this customer.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
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
                        {job.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
