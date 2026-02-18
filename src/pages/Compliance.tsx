import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
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
  Shield, Plus, Search, Pencil, Trash2, Download, Upload, CheckCircle2, AlertTriangle, XCircle, Clock,
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
  const { userRole } = useAuth();
  const { toast } = useToast();
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
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const fetchData = async () => {
    const [recRes, assetRes, siteRes] = await Promise.all([
      supabase.from("compliance_records").select("*").order("expiry_date", { ascending: true }),
      supabase.from("assets").select("id, name").order("name"),
      supabase.from("sites").select("id, name").order("name"),
    ]);
    setRecords((recRes.data as ComplianceRecord[]) || []);
    setAssets((assetRes.data as LookupOption[]) || []);
    setSites((siteRes.data as LookupOption[]) || []);
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

  const openCreate = () => { setEditing(null); setForm(emptyForm); setPendingFile(null); setDialogOpen(true); };
  const openEdit = (r: ComplianceRecord) => {
    setEditing(r);
    setForm({
      title: r.title, record_type: r.record_type,
      asset_id: r.asset_id || "", site_id: r.site_id || "",
      issuer: r.issuer || "", reference_number: r.reference_number || "",
      issue_date: r.issue_date || "", expiry_date: r.expiry_date || "",
      status: r.status, notes: r.notes || "",
    });
    setPendingFile(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }

    let fileUrl = editing?.file_url || null;
    let fileName = editing?.file_name || null;

    if (pendingFile) {
      const path = `compliance/${Date.now()}_${pendingFile.name}`;
      const { error: upErr } = await supabase.storage.from("asset-documents").upload(path, pendingFile);
      if (upErr) { toast({ title: "Upload failed", description: upErr.message, variant: "destructive" }); return; }
      fileUrl = path;
      fileName = pendingFile.name;
    }

    const payload = {
      title: form.title.trim(), record_type: form.record_type,
      asset_id: form.asset_id || null, site_id: form.site_id || null,
      issuer: form.issuer || null, reference_number: form.reference_number || null,
      issue_date: form.issue_date || null, expiry_date: form.expiry_date || null,
      status: form.status, notes: form.notes || null,
      file_url: fileUrl, file_name: fileName,
    };

    if (editing) {
      const { error } = await supabase.from("compliance_records").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Record updated" });
    } else {
      const { error } = await supabase.from("compliance_records").insert(payload as any);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Record created" });
    }
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("compliance_records").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Record deleted" }); fetchData();
  };

  const handleDownload = async (r: ComplianceRecord) => {
    if (!r.file_url) return;
    const { data } = await supabase.storage.from("asset-documents").createSignedUrl(r.file_url, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

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
                        {r.file_url ? (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(r)}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
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
              <label className="text-sm font-medium">Attach Document</label>
              <input ref={fileRef} type="file" onChange={(e) => setPendingFile(e.target.files?.[0] || null)} className="hidden" />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-1.5 h-3.5 w-3.5" /> {pendingFile ? pendingFile.name : "Choose file"}
              </Button>
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
    </div>
  );
}
