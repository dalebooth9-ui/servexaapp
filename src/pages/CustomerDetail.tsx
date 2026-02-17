import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Building2, Mail, Phone, MapPin, Upload, Loader2 } from "lucide-react";
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

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const fetchJobs = useCallback(async (customerName: string) => {
    const { data: jobData } = await supabase
      .from("jobs")
      .select("*")
      .eq("customer", customerName)
      .order("created_at", { ascending: false });
    setJobs((jobData as Job[]) || []);
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
      setLoading(false);
    };
    fetchData();
  }, [id, fetchJobs]);

  const handleFileUpload = async (files: FileList) => {
    if (!user || !customer) return;
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
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

      // Create one job per file
      const refNumber = `IMP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      const jobName = file.name.replace(/\.[^/.]+$/, "");

      const { data: job, error: jobError } = await supabase
        .from("jobs")
        .insert({
          name: jobName,
          reference_number: refNumber,
          customer: customer.name,
          created_by: user.id,
        } as any)
        .select("id")
        .single();

      if (jobError || !job) {
        toast({ title: "Error", description: `Failed to create job for ${file.name}.`, variant: "destructive" });
        processed++;
        setUploadProgress(Math.round((processed / validFiles.length) * 100));
        continue;
      }

      const filePath = `${job.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("submissions").upload(filePath, file);

      if (uploadError) {
        toast({ title: "Upload failed", description: `Failed to upload ${file.name}.`, variant: "destructive" });
      } else {
        const { data: urlData } = supabase.storage.from("submissions").getPublicUrl(filePath);
        const isImage = IMAGE_EXTENSIONS.includes(ext);
        await supabase.from("submissions").insert({
          job_id: job.id,
          engineer_id: user.id,
          type: isImage ? "photo" : "document",
          file_url: urlData.publicUrl,
          file_name: file.name,
        });
      }
      processed++;
      setUploadProgress(Math.round((processed / validFiles.length) * 100));
    }

    toast({ title: "Import complete", description: `${validFiles.length} job(s) created.` });
    setUploading(false);
    setUploadProgress(0);
    await fetchJobs(customer.name);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const statusColor = (s: string) =>
    s === "active" ? "bg-accent/10 text-accent" : s === "completed" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground";

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading…</div>;
  if (!customer) return <div className="flex h-64 items-center justify-center text-muted-foreground">Customer not found.</div>;

  return (
    <div>
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

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragCounterRef.current++;
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragCounterRef.current--;
          if (dragCounterRef.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragCounterRef.current = 0;
          setDragging(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files);
          }
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Jobs ({jobs.length})</h2>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.gif"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) handleFileUpload(e.target.files);
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload &amp; Create Job
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
            <p className="font-medium text-primary">Drop files here to create a new job</p>
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            {jobs.length === 0 && !dragging ? (
              <p className="p-8 text-center text-muted-foreground">No jobs associated with this customer. Drag &amp; drop files or click Upload to create one.</p>
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
    </div>
  );
}
