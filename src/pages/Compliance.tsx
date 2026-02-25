import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useUndoAction } from "@/hooks/useUndoAction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Shield, Plus, Search, Pencil, Trash2, Download, Upload, CheckCircle2, AlertTriangle, XCircle, Clock, FileText, Paperclip,
} from "lucide-react";
import { format } from "date-fns";

type ComplianceRecord = {
  id: string; title: string; record_type: string;
  asset_id: string | null; site_id: string | null;
  issuer: string | null; reference_number: string | null;
  issue_date: string | null; expiry_date: string | null;
  status: string; file_url: string | null; file_name: string | null;
  notes: string | null; created_at: string;
};

type LookupOption = { id: string; name: string };

const RECORD_TYPES = ["certificate", "inspection", "gas_safety", "legionella", "fire_risk", "pat_testing", "asbestos", "electrical", "insurance", "other"];

const STATUS_DISPLAY: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  valid: { label: "Valid", icon: CheckCircle2, color: "text-green-500" },
  expiring_soon: { label: "Expiring Soon", icon: Clock, color: "text-amber-500" },
  expired: { label: "Expired", icon: XCircle, color: "text-destructive" },
  not_applicable: { label: "N/A", icon: AlertTriangle, color: "text-muted-foreground" },
};

const emptyForm = {
  title: "", record_type: "certificate", asset_id: "", site_id: "",
  issuer: "", reference_number: "", issue_date: "", expiry_date: "",
  status: "valid", notes: "",
};

export default function Compliance() {
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const { deleteWithUndo, editWithUndo } = useUndoAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const [records, setRecords] = useState<ComplianceRecord[]>([]);
  const [assets, setAssets] = useState<LookupOption[]>([]);
  const [sites, setSites] = useState<LookupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ComplianceRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachDialogOpen, setAttachDialogOpen] = useState(false);
  const [attachingRecord, setAttachingRecord] = useState<ComplianceRecord | null>(null);
  const [jobs, setJobs] = useState<{ id: string; name: string; reference_number: string; customer: string | null }[]>([]);
  const [jobSearch, setJobSearch] = useState("");
  const [attachingJobId, setAttachingJobId] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);

  const fetchData = async () => {
    const [recRes, assetRes, siteRes, jobRes] = await Promise.all([
      supabase.from("compliance_records").select("*").order("expiry_date", { ascending: true }),
      supabase.from("assets").select("id, name").order("name"),
      supabase.from("sites").select("id, name").order("name"),
      supabase.from("jobs").select("id, name, reference_number, customer").order("name"),
    ]);
    setRecords((recRes.data as ComplianceRecord[]) || []);
    setAssets((assetRes.data as LookupOption[]) || []);
    setSites((siteRes.data as LookupOption[]) || []);
    setJobs((jobRes.data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const assetLookup = Object.fromEntries(assets.map((a) => [a.id, a.name]));
  const siteLookup = Object.fromEntries(sites.map((s) => [s.id, s.name]));

  const filtered = records.filter((r) => {
    if (typeFilter !== "all" && r.record_type !== typeFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return r.title.toLowerCase().includes(q) || r.reference_number?.toLowerCase().includes(q) || r.issuer?.toLowerCase().includes(q);
    }
    return true;
  });

  const counts = {
    valid: records.filter((r) => r.status === "valid").length,
    expiring_soon: records.filter((r) => r.status === "expiring_soon").length,
    expired: records.filter((r) => r.status === "expired").length,
    total: records.length,
  };

  const parseFileList = (url: string | null, name: string | null): { urls: string[]; names: string[] } => {
    if (!url) return { urls: [], names: [] };
    try {
      const urls = JSON.parse(url);
      const names = JSON.parse(name || "[]");
      if (Array.isArray(urls)) return { urls, names };
    } catch {}
    return { urls: [url], names: [name || "file"] };
  };

  const openCreate = () => { setEditing(null); setForm(emptyForm); setPendingFiles([]); setDialogOpen(true); };
  const openEdit = (r: ComplianceRecord) => {
    setEditing(r);
    setForm({
      title: r.title, record_type: r.record_type,
      asset_id: r.asset_id || "", site_id: r.site_id || "",
      issuer: r.issuer || "", reference_number: r.reference_number || "",
      issue_date: r.issue_date || "", expiry_date: r.expiry_date || "",
      status: r.status, notes: r.notes || "",
    });
    setPendingFiles([]);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }

    // Gather existing files (for edit mode)
    const existing = editing ? parseFileList(editing.file_url, editing.file_name) : { urls: [], names: [] };
    const allUrls = [...existing.urls];
    const allNames = [...existing.names];

    // Upload new pending files
    for (const file of pendingFiles) {
      const path = `compliance/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage.from("asset-documents").upload(path, file);
      if (upErr) { toast({ title: "Upload failed", description: `${file.name}: ${upErr.message}`, variant: "destructive" }); continue; }
      allUrls.push(path);
      allNames.push(file.name);
    }

    const fileUrl = allUrls.length > 0 ? JSON.stringify(allUrls) : null;
    const fileName = allNames.length > 0 ? JSON.stringify(allNames) : null;

    const payload = {
      title: form.title.trim(), record_type: form.record_type,
      asset_id: form.asset_id || null, site_id: form.site_id || null,
      issuer: form.issuer || null, reference_number: form.reference_number || null,
      issue_date: form.issue_date || null, expiry_date: form.expiry_date || null,
      status: form.status, notes: form.notes || null,
      file_url: fileUrl, file_name: fileName,
    };

    if (editing) {
      const oldRec = records.find((r) => r.id === editing.id);
      const oldPayload = oldRec ? {
        title: oldRec.title, record_type: oldRec.record_type,
        asset_id: oldRec.asset_id, site_id: oldRec.site_id,
        issuer: oldRec.issuer, reference_number: oldRec.reference_number,
        issue_date: oldRec.issue_date, expiry_date: oldRec.expiry_date,
        status: oldRec.status, notes: oldRec.notes,
        file_url: oldRec.file_url, file_name: oldRec.file_name,
      } : null;
      const editId = editing.id;
      const { error } = await supabase.from("compliance_records").update(payload).eq("id", editId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      setDialogOpen(false);
      fetchData();
      editWithUndo({
        label: "Record updated",
        onUndo: async () => {
          if (oldPayload) {
            await supabase.from("compliance_records").update(oldPayload).eq("id", editId);
            fetchData();
          }
        },
      });
      return;
    } else {
      const { error } = await supabase.from("compliance_records").insert(payload as any);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Record created" });
    }
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    const deletedRecord = records.find((r) => r.id === id);
    if (!deletedRecord) return;
    setRecords((prev) => prev.filter((r) => r.id !== id));
    deleteWithUndo({
      key: id,
      label: "Record deleted",
      onConfirm: async () => {
        const { error } = await supabase.from("compliance_records").delete().eq("id", id);
        if (error) {
          toast({ title: "Error", description: error.message, variant: "destructive" });
          setRecords((prev) => [...prev, deletedRecord]);
        }
      },
      onUndo: () => setRecords((prev) => [...prev, deletedRecord]),
    });
  };

  const handleDownload = async (r: ComplianceRecord) => {
    if (!r.file_url) return;
    const { urls, names } = parseFileList(r.file_url, r.file_name);
    for (const url of urls) {
      const { data } = await supabase.storage.from("asset-documents").createSignedUrl(url, 3600);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    }
  };

  const openAttachDialog = (r: ComplianceRecord) => {
    setAttachingRecord(r);
    setAttachingJobId(null);
    setJobSearch("");
    setAttachDialogOpen(true);
  };

  const handleAttachToJob = async () => {
    if (!attachingRecord || !attachingJobId || !user) return;
    setAttaching(true);
    const { urls, names } = parseFileList(attachingRecord.file_url, attachingRecord.file_name);

    if (urls.length === 0) {
      toast({ title: "No documents", description: "This compliance record has no attached documents.", variant: "destructive" });
      setAttaching(false);
      return;
    }

    let attachedCount = 0;
    for (let i = 0; i < urls.length; i++) {
      const storagePath = urls[i];
      const fileName = names[i] || attachingRecord.title;
      // Get a signed URL to copy the file via fetch, then re-upload to submissions bucket
      const { data: signedData } = await supabase.storage.from("asset-documents").createSignedUrl(storagePath, 3600);
      if (!signedData?.signedUrl) continue;

      try {
        const fileRes = await fetch(signedData.signedUrl);
        const blob = await fileRes.blob();
        const destPath = `${attachingJobId}/${Date.now()}-${fileName}`;
        const { error: upErr } = await supabase.storage.from("submissions").upload(destPath, blob, { contentType: blob.type });
        if (upErr) continue;

        const { data: urlData } = supabase.storage.from("submissions").getPublicUrl(destPath);
        const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
        const isImage = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext);
        const { error: insErr } = await supabase.from("submissions").insert({
          job_id: attachingJobId,
          engineer_id: user.id,
          type: isImage ? "photo" : "document",
          file_url: urlData.publicUrl,
          file_name: fileName,
        });
        if (!insErr) attachedCount++;
      } catch {}
    }

    setAttaching(false);
    setAttachDialogOpen(false);
    if (attachedCount > 0) {
      toast({ title: "Documents attached", description: `${attachedCount} document(s) added to job folder.` });
    } else {
      toast({ title: "Attach failed", description: "Could not attach documents to the job.", variant: "destructive" });
    }
  };

  const filteredJobs = jobs.filter((j) => {
    if (!jobSearch.trim()) return true;
    const q = jobSearch.toLowerCase();
    return j.name.toLowerCase().includes(q) || j.reference_number?.toLowerCase().includes(q) || j.customer?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compliance</h1>
          <p className="text-sm text-muted-foreground">Track certificates, inspections, and regulatory compliance across your estate.</p>
        </div>
        {userRole === "admin" && (
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add Record</Button>
        )}
      </div>

      {/* RAG Summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter("all")}>
          <CardContent className="flex items-center gap-3 p-4">
            <Shield className="h-5 w-5 text-primary" />
            <div><p className="text-2xl font-bold">{counts.total}</p><p className="text-xs text-muted-foreground">Total Records</p></div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter(statusFilter === "valid" ? "all" : "valid")}>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <div><p className="text-2xl font-bold">{counts.valid}</p><p className="text-xs text-muted-foreground">Valid</p></div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter(statusFilter === "expiring_soon" ? "all" : "expiring_soon")}>
          <CardContent className="flex items-center gap-3 p-4">
            <Clock className="h-5 w-5 text-amber-500" />
            <div><p className="text-2xl font-bold">{counts.expiring_soon}</p><p className="text-xs text-muted-foreground">Expiring Soon</p></div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter(statusFilter === "expired" ? "all" : "expired")}>
          <CardContent className="flex items-center gap-3 p-4">
            <XCircle className="h-5 w-5 text-destructive" />
            <div><p className="text-2xl font-bold">{counts.expired}</p><p className="text-xs text-muted-foreground">Expired</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search records..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {RECORD_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {records.length === 0 ? "No compliance records yet." : "No records match your filters."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Asset / Site</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Doc</TableHead>
                  <TableHead className="w-8" />
                   {userRole === "admin" && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const sd = STATUS_DISPLAY[r.status];
                  const StatusIcon = sd?.icon || Shield;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{r.title}</p>
                        {r.reference_number && <p className="text-[10px] text-muted-foreground font-mono">{r.reference_number}</p>}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px] capitalize">{r.record_type.replace("_", " ")}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.asset_id ? assetLookup[r.asset_id] || "—" : r.site_id ? siteLookup[r.site_id] || "—" : "—"}
                      </TableCell>
                      <TableCell>
                        {r.expiry_date ? (
                          <span className={`text-xs ${r.status === "expired" ? "text-destructive font-medium" : r.status === "expiring_soon" ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                            {format(new Date(r.expiry_date), "dd MMM yyyy")}
                          </span>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.status === "valid" ? "default" : r.status === "expired" ? "destructive" : "secondary"} className="text-[10px] capitalize gap-1">
                          <StatusIcon className="h-3 w-3" /> {sd?.label || r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.file_url ? (() => {
                          const { urls } = parseFileList(r.file_url, r.file_name);
                          return (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(r)}>
                              <Download className="h-3.5 w-3.5" />
                              {urls.length > 1 && <span className="absolute -top-1 -right-1 text-[9px] bg-primary text-primary-foreground rounded-full h-3.5 w-3.5 flex items-center justify-center">{urls.length}</span>}
                            </Button>
                          );
                        })() : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {r.file_url && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Attach to job" onClick={() => openAttachDialog(r)}>
                            <Paperclip className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                      {userRole === "admin" && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Compliance Record</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Title *</label>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Gas Safety Certificate" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Type</label>
                <Select value={form.record_type} onValueChange={(v) => setForm((f) => ({ ...f, record_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECORD_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Asset</label>
                <Select value={form.asset_id} onValueChange={(v) => setForm((f) => ({ ...f, asset_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
                  <SelectContent>
                    {assets.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Site</label>
                <Select value={form.site_id} onValueChange={(v) => setForm((f) => ({ ...f, site_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                  <SelectContent>
                    {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Issuer</label>
                <Input value={form.issuer} onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Reference</label>
                <Input value={form.reference_number} onChange={(e) => setForm((f) => ({ ...f, reference_number: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Issue Date</label>
                <Input type="date" value={form.issue_date} onChange={(e) => setForm((f) => ({ ...f, issue_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Expiry Date</label>
                <Input type="date" value={form.expiry_date} onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Status</label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_DISPLAY).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Attach Documents</label>
              <input ref={fileRef} type="file" multiple onChange={(e) => {
                if (e.target.files) setPendingFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                if (fileRef.current) fileRef.current.value = "";
              }} className="hidden" />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-1.5 h-3.5 w-3.5" /> Add files
              </Button>
              {editing && (() => {
                const { names } = parseFileList(editing.file_url, editing.file_name);
                return names.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {names.map((n, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{n}</Badge>
                    ))}
                  </div>
                ) : null;
              })()}
              {pendingFiles.length > 0 && (
                <div className="space-y-1 mt-1">
                  {pendingFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="h-3 w-3 shrink-0" />
                      <span className="truncate">{f.name}</span>
                      <button onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))} className="text-destructive hover:underline text-[10px] shrink-0">Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>{editing ? "Update" : "Create"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Attach to Job Dialog */}
      <Dialog open={attachDialogOpen} onOpenChange={setAttachDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-4 w-4" /> Attach to Job
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {attachingRecord && (
              <div className="rounded-md bg-muted px-3 py-2 text-sm">
                <p className="font-medium">{attachingRecord.title}</p>
                {(() => {
                  const { names } = parseFileList(attachingRecord.file_url, attachingRecord.file_name);
                  return <p className="text-xs text-muted-foreground mt-0.5">{names.length} document(s) will be attached</p>;
                })()}
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search jobs..."
                value={jobSearch}
                onChange={(e) => setJobSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-60 overflow-y-auto rounded-md border divide-y">
              {filteredJobs.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No jobs found</p>
              ) : filteredJobs.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => setAttachingJobId(j.id)}
                  className={`w-full text-left px-3 py-2.5 hover:bg-muted transition-colors ${attachingJobId === j.id ? "bg-primary/10 border-l-2 border-primary" : ""}`}
                >
                  <p className="text-sm font-medium">{j.name}</p>
                  <p className="text-xs text-muted-foreground">{j.reference_number}{j.customer ? ` · ${j.customer}` : ""}</p>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAttachDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAttachToJob} disabled={!attachingJobId || attaching}>
                {attaching ? "Attaching..." : "Attach Documents"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
