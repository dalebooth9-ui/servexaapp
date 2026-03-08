import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import PpmSchedules from "@/components/PpmSchedules";
import DigitalTwinPanel from "@/components/DigitalTwinPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Package,
  ArrowLeft,
  Briefcase,
  FileText,
  Upload,
  Trash2,
  Download,
  Clock,
  CheckCircle2,
  Wrench,
  AlertTriangle,
  XCircle,
  MapPin,
  Calendar,
  Shield,
  Activity,
} from "lucide-react";
import { format } from "date-fns";

type Asset = {
  id: string;
  name: string;
  asset_tag: string | null;
  category: string;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  site_id: string | null;
  install_date: string | null;
  warranty_expiry: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

type LinkedJob = {
  id: string;
  reference_number: string;
  name: string;
  status: string;
  priority: string;
  created_at: string;
  customer: string | null;
};

type AssetDoc = {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  document_type: string;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
};

type ActivityEntry = {
  id: string;
  action: string;
  details: string | null;
  created_at: string;
  user_id: string | null;
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  operational: { label: "Operational", icon: CheckCircle2, color: "text-green-500" },
  maintenance: { label: "Maintenance", icon: Wrench, color: "text-amber-500" },
  faulty: { label: "Faulty", icon: AlertTriangle, color: "text-destructive" },
  decommissioned: { label: "Decommissioned", icon: XCircle, color: "text-muted-foreground" },
};

const DOC_TYPES = ["general", "certificate", "inspection", "warranty", "manual", "compliance", "risk_assessment"];

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [asset, setAsset] = useState<Asset | null>(null);
  const [siteName, setSiteName] = useState<string | null>(null);
  const [jobs, setJobs] = useState<LinkedJob[]>([]);
  const [docs, setDocs] = useState<AssetDoc[]>([]);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState("general");
  const [expiryDate, setExpiryDate] = useState("");

  const fetchAll = async () => {
    if (!id) return;

    const [assetRes, jobsRes, docsRes] = await Promise.all([
      supabase.from("assets").select("*").eq("id", id).maybeSingle(),
      supabase.from("jobs").select("id, reference_number, name, status, priority, created_at, customer").eq("asset_id", id).order("created_at", { ascending: false }),
      supabase.from("asset_documents").select("*").eq("asset_id", id).order("created_at", { ascending: false }),
    ]);

    const assetData = assetRes.data as Asset | null;
    setAsset(assetData);
    setJobs((jobsRes.data as LinkedJob[]) || []);
    setDocs((docsRes.data as AssetDoc[]) || []);

    // Fetch site name
    if (assetData?.site_id) {
      const { data: siteData } = await supabase.from("sites").select("name").eq("id", assetData.site_id).maybeSingle();
      setSiteName(siteData?.name || null);
    }

    // Fetch activity from linked jobs
    const jobIds = (jobsRes.data || []).map((j: any) => j.id);
    if (jobIds.length > 0) {
      const { data: actData } = await supabase
        .from("job_activity_log")
        .select("id, action, details, created_at, user_id")
        .in("job_id", jobIds)
        .order("created_at", { ascending: false })
        .limit(30);
      setActivities((actData as ActivityEntry[]) || []);

      // Fetch profile names
      const userIds = new Set<string>();
      (actData || []).forEach((a: any) => a.user_id && userIds.add(a.user_id));
      if (userIds.size > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", Array.from(userIds));
        const map: Record<string, string> = {};
        (profs || []).forEach((p) => { map[p.user_id] = p.full_name; });
        setProfiles(map);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, [id]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id || !user) return;
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 20MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    const path = `${id}/${Date.now()}_${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("asset-documents").upload(path, file);
    if (uploadErr) {
      toast({ title: "Upload failed", description: uploadErr.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { error: insertErr } = await supabase.from("asset_documents").insert({
      asset_id: id,
      file_name: file.name,
      file_url: path,
      file_size: file.size,
      document_type: docType,
      expiry_date: expiryDate || null,
      uploaded_by: user.id,
    } as any);

    if (insertErr) {
      toast({ title: "Error", description: insertErr.message, variant: "destructive" });
    } else {
      toast({ title: "Document uploaded" });
      setExpiryDate("");
      fetchAll();
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDownload = async (doc: AssetDoc) => {
    const { data } = await supabase.storage.from("asset-documents").createSignedUrl(doc.file_url, 3600);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    } else {
      toast({ title: "Error", description: "Could not generate download link.", variant: "destructive" });
    }
  };

  const handleDeleteDoc = async (doc: AssetDoc) => {
    await supabase.storage.from("asset-documents").remove([doc.file_url]);
    const { error } = await supabase.from("asset_documents").delete().eq("id", doc.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Document deleted" });
      fetchAll();
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>;
  }

  if (!asset) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">Asset not found.</p>
        <Link to="/assets"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Assets</Button></Link>
      </div>
    );
  }

  const sc = STATUS_CONFIG[asset.status];
  const StatusIcon = sc?.icon || Package;
  const expiringSoon = docs.filter((d) => {
    if (!d.expiry_date) return false;
    const diff = new Date(d.expiry_date).getTime() - Date.now();
    return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
  });
  const expired = docs.filter((d) => d.expiry_date && new Date(d.expiry_date) < new Date());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Link to="/assets">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{asset.name}</h1>
              <Badge variant={sc?.color === "text-green-500" ? "default" : sc?.color === "text-destructive" ? "destructive" : "secondary"} className="capitalize">
                <StatusIcon className="mr-1 h-3 w-3" /> {asset.status}
              </Badge>
            </div>
            {asset.asset_tag && (
              <p className="text-sm text-muted-foreground font-mono mt-0.5">{asset.asset_tag}</p>
            )}
          </div>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Details</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Category</span><Badge variant="outline" className="capitalize">{asset.category.replace("_", " ")}</Badge></div>
              {asset.make && <div className="flex justify-between"><span className="text-muted-foreground">Make</span><span>{asset.make}</span></div>}
              {asset.model && <div className="flex justify-between"><span className="text-muted-foreground">Model</span><span>{asset.model}</span></div>}
              {asset.serial_number && <div className="flex justify-between"><span className="text-muted-foreground">Serial</span><span className="font-mono text-xs">{asset.serial_number}</span></div>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Location</p>
            <div className="space-y-1.5 text-sm">
              {siteName ? (
                <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-muted-foreground" /><span>{siteName}</span></div>
              ) : (
                <p className="text-muted-foreground">No site assigned</p>
              )}
            </div>
            <Separator />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dates</p>
            <div className="space-y-1.5 text-sm">
              {asset.install_date && <div className="flex justify-between"><span className="text-muted-foreground">Installed</span><span>{format(new Date(asset.install_date), "dd MMM yyyy")}</span></div>}
              {asset.warranty_expiry && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Warranty</span>
                  <span className={new Date(asset.warranty_expiry) < new Date() ? "text-destructive font-medium" : ""}>
                    {format(new Date(asset.warranty_expiry), "dd MMM yyyy")}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Summary</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-2 rounded bg-muted/50">
                <p className="text-2xl font-bold">{jobs.length}</p>
                <p className="text-[10px] text-muted-foreground">Linked Jobs</p>
              </div>
              <div className="text-center p-2 rounded bg-muted/50">
                <p className="text-2xl font-bold">{docs.length}</p>
                <p className="text-[10px] text-muted-foreground">Documents</p>
              </div>
              {expired.length > 0 && (
                <div className="col-span-2 text-center p-2 rounded bg-destructive/10">
                  <p className="text-lg font-bold text-destructive">{expired.length}</p>
                  <p className="text-[10px] text-destructive">Expired Docs</p>
                </div>
              )}
              {expiringSoon.length > 0 && expired.length === 0 && (
                <div className="col-span-2 text-center p-2 rounded bg-amber-500/10">
                  <p className="text-lg font-bold text-amber-600">{expiringSoon.length}</p>
                  <p className="text-[10px] text-amber-600">Expiring Soon</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {asset.notes && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm">{asset.notes}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Linked Jobs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Briefcase className="h-4 w-4" /> Linked Jobs ({jobs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {jobs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No jobs linked to this asset.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ref</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell>
                        <Link to={`/jobs/${j.id}`} className="text-primary hover:underline font-mono text-xs">
                          {j.reference_number}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm max-w-[160px] truncate">{j.name}</TableCell>
                      <TableCell>
                        <Badge variant={j.status === "completed" ? "default" : j.status === "active" ? "secondary" : "outline"} className="text-[10px] capitalize">
                          {j.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(j.created_at), "dd MMM yy")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Activity / Maintenance History */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" /> Maintenance History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No activity yet. Link jobs to this asset to see history.</p>
            ) : (
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {activities.map((a) => (
                  <div key={a.id} className="flex gap-3 text-sm">
                    <div className="mt-0.5 h-6 w-6 shrink-0 rounded-full border bg-card flex items-center justify-center">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize text-xs">{a.action.replace("_", " ")}</span>
                        {a.user_id && profiles[a.user_id] && (
                          <span className="text-[10px] text-muted-foreground">by {profiles[a.user_id]}</span>
                        )}
                      </div>
                      {a.details && <p className="text-xs text-muted-foreground mt-0.5">{a.details}</p>}
                      <span className="text-[10px] text-muted-foreground/70">
                        {format(new Date(a.created_at), "dd MMM yyyy, HH:mm")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* PPM Schedules */}
      <PpmSchedules assetId={asset.id} />

      {/* Compliance Documents */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4" /> Compliance Documents ({docs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload area */}
          <div className="flex flex-wrap items-end gap-3 p-3 border border-dashed rounded-lg bg-muted/30">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Type</label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Expiry Date</label>
              <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="w-[150px] h-9 text-xs" />
            </div>
            <div>
              <input ref={fileRef} type="file" onChange={handleUpload} className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" />
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload className="mr-1.5 h-3.5 w-3.5" /> {uploading ? "Uploading..." : "Upload Document"}
              </Button>
            </div>
          </div>

          {/* Documents table */}
          {docs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No documents uploaded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((doc) => {
                  const isExpired = doc.expiry_date && new Date(doc.expiry_date) < new Date();
                  const isExpiring = doc.expiry_date && !isExpired && (new Date(doc.expiry_date).getTime() - Date.now()) < 30 * 24 * 60 * 60 * 1000;
                  return (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <button onClick={() => handleDownload(doc)} className="text-primary hover:underline text-sm flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5" /> {doc.file_name}
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] capitalize">{doc.document_type.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell>
                        {doc.expiry_date ? (
                          <span className={`text-xs ${isExpired ? "text-destructive font-medium" : isExpiring ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                            {isExpired ? "⚠ " : isExpiring ? "⏳ " : ""}
                            {format(new Date(doc.expiry_date), "dd MMM yyyy")}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(doc.created_at), "dd MMM yy")}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(doc)}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          {userRole === "admin" && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteDoc(doc)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
