import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Search, CheckCircle2, Clock, AlertCircle, XCircle, Camera, FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

type Defect = {
  id: string;
  asset_id: string | null;
  site_id: string | null;
  job_id: string | null;
  reported_by: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  category: string | null;
  photos: string[] | null;
  location_on_site: string | null;
  bs_standard_reference: string | null;
  quote_id: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/15 text-yellow-800 dark:text-yellow-400 border-yellow-500/30",
  low: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

const STATUS_BADGE: Record<string, string> = {
  open: "bg-red-500/15 text-red-700 dark:text-red-400",
  in_progress: "bg-yellow-500/15 text-yellow-800 dark:text-yellow-400",
  resolved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  deferred: "bg-muted text-muted-foreground",
  quoted: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
};

const STATUS_ICON: Record<string, React.ElementType> = {
  open: AlertCircle, in_progress: Clock, resolved: CheckCircle2, deferred: XCircle, quoted: FileText,
};

const CATEGORIES = [
  { value: "fire_alarm", label: "Fire Alarm" },
  { value: "emergency_lighting", label: "Emergency Lighting" },
  { value: "extinguisher", label: "Extinguisher" },
  { value: "sprinkler", label: "Sprinkler" },
  { value: "dry_riser", label: "Dry Riser" },
  { value: "suppression", label: "Suppression" },
  { value: "passive_fire", label: "Passive Fire" },
  { value: "other", label: "Other" },
];

export default function Defects() {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAdmin = userRole === "admin";

  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [quotedFilter, setQuotedFilter] = useState<"all" | "unquoted" | "quoted">(
    searchParams.get("filter") === "unquoted" ? "unquoted" : "all"
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);

  const [assets, setAssets] = useState<{ id: string; name: string }[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string; address: string | null }[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [customerSites, setCustomerSites] = useState<Record<string, { customer_id: string; customer_name: string; customer_email: string | null; site_address: string | null }>>({});

  const [form, setForm] = useState({
    title: "", description: "", severity: "medium", category: "other",
    asset_id: "", site_id: "", job_id: "", location_on_site: "", bs_standard_reference: "",
  });
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Batch quoting
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quoting, setQuoting] = useState(false);

  const fetchData = async () => {
    const [defRes, assetRes, siteRes] = await Promise.all([
      supabase.from("defects").select("*").order("created_at", { ascending: false }),
      supabase.from("assets").select("id, name").order("name"),
      supabase.from("sites").select("id, name, address").order("name"),
    ]);
    const defs = (defRes.data || []) as any as Defect[];
    setDefects(defs);
    setAssets((assetRes.data || []) as any);
    setSites((siteRes.data || []) as any);

    const ids = new Set(defs.map(d => d.reported_by));
    if (ids.size > 0) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", Array.from(ids));
      const map: Record<string, string> = {};
      (profs || []).forEach(p => { map[p.user_id] = p.full_name; });
      setProfiles(map);
    }

    // Build site → customer lookup
    const siteIds = Array.from(new Set(defs.map(d => d.site_id).filter(Boolean))) as string[];
    if (siteIds.length > 0) {
      const { data: cs } = await supabase
        .from("customer_sites")
        .select("site_id, customer_id, customers(name, email), sites(address)")
        .in("site_id", siteIds);
      const m: Record<string, any> = {};
      (cs || []).forEach((row: any) => {
        m[row.site_id] = {
          customer_id: row.customer_id,
          customer_name: row.customers?.name || "",
          customer_email: row.customers?.email || null,
          site_address: row.sites?.address || null,
        };
      });
      setCustomerSites(m);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const uploadPhotos = async (defectId: string, files: File[]): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of files) {
      const path = `defects/${defectId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("submissions").upload(path, file);
      if (error) {
        toast.error(`Photo upload failed: ${file.name}`);
        continue;
      }
      const { data } = supabase.storage.from("submissions").getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    return urls;
  };

  const handleCreate = async () => {
    if (!form.title.trim() || !user) return;
    setCreating(true);
    const { data: inserted, error } = await supabase.from("defects").insert({
      title: form.title.trim(),
      description: form.description || null,
      severity: form.severity,
      category: form.category,
      asset_id: form.asset_id || null,
      site_id: form.site_id || null,
      job_id: form.job_id || null,
      location_on_site: form.location_on_site || null,
      bs_standard_reference: form.bs_standard_reference || null,
      reported_by: user.id,
    } as any).select("id").single();

    if (error || !inserted) {
      toast.error(error?.message || "Failed");
      setCreating(false);
      return;
    }

    if (pendingPhotos.length > 0) {
      const urls = await uploadPhotos(inserted.id, pendingPhotos);
      if (urls.length) {
        await supabase.from("defects").update({ photos: urls } as any).eq("id", inserted.id);
      }
    }

    toast.success("Defect reported");
    setDialogOpen(false);
    setForm({ title: "", description: "", severity: "medium", category: "other", asset_id: "", site_id: "", job_id: "", location_on_site: "", bs_standard_reference: "" });
    setPendingPhotos([]);
    setCreating(false);
    fetchData();
  };

  const handleResolve = async () => {
    if (!selectedDefect || !user) return;
    const { error } = await supabase.from("defects").update({
      status: "resolved",
      resolution_notes: resolutionNotes || null,
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    } as any).eq("id", selectedDefect.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Defect resolved");
    setResolveDialogOpen(false);
    fetchData();
  };

  const handleStatusChange = async (defectId: string, newStatus: string) => {
    const { error } = await supabase.from("defects").update({ status: newStatus } as any).eq("id", defectId);
    if (error) toast.error(error.message);
    else fetchData();
  };

  const generateQuoteForDefects = async (defectsToQuote: Defect[]) => {
    if (!user || defectsToQuote.length === 0) return;
    const siteIds = new Set(defectsToQuote.map(d => d.site_id).filter(Boolean));
    if (siteIds.size > 1) {
      toast.error("All defects must belong to the same site for combined quoting.");
      return;
    }
    const siteId = defectsToQuote[0].site_id;
    const cust = siteId ? customerSites[siteId] : null;

    setQuoting(true);
    const { data: invoice, error } = await supabase.from("invoices").insert({
      created_by: user.id,
      customer_name: cust?.customer_name || "Customer",
      customer_email: cust?.customer_email || null,
      customer_address: cust?.site_address || null,
      document_type: "quote",
      status: "draft",
      invoice_number: "",
      subtotal: 0,
      tax_amount: 0,
      tax_rate: 20,
      total: 0,
      notes: `Quote generated from ${defectsToQuote.length} defect${defectsToQuote.length === 1 ? "" : "s"}`,
    } as any).select("id").single();

    if (error || !invoice) {
      toast.error(error?.message || "Failed to create quote");
      setQuoting(false);
      return;
    }

    const lineItems = defectsToQuote.map((d, i) => ({
      invoice_id: invoice.id,
      description: `${d.title}${d.location_on_site ? ` — ${d.location_on_site}` : ""}${d.description ? `\n${d.description}` : ""}${d.bs_standard_reference ? `\n(${d.bs_standard_reference})` : ""}`,
      quantity: 1,
      unit_price: 0,
      amount: 0,
      sort_order: i,
    }));
    await supabase.from("invoice_line_items").insert(lineItems as any);
    await supabase.from("defects").update({ status: "quoted", quote_id: invoice.id } as any)
      .in("id", defectsToQuote.map(d => d.id));

    toast.success("Quote created");
    setQuoting(false);
    setSelectedIds(new Set());
    navigate(`/invoices/${invoice.id}`);
  };

  const onPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPendingPhotos(prev => [...prev, ...files]);
  };

  const assetLookup = Object.fromEntries(assets.map(a => [a.id, a.name]));
  const siteLookup = Object.fromEntries(sites.map(s => [s.id, s.name]));

  const filtered = defects.filter(d => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    if (severityFilter !== "all" && d.severity !== severityFilter) return false;
    if (quotedFilter === "unquoted" && d.quote_id) return false;
    if (quotedFilter === "quoted" && !d.quote_id) return false;
    if (search) {
      const s = search.toLowerCase();
      return d.title.toLowerCase().includes(s) || (d.description || "").toLowerCase().includes(s);
    }
    return true;
  });

  const counts = { open: 0, in_progress: 0, resolved: 0, deferred: 0, quoted: 0 };
  defects.forEach(d => { if ((counts as any)[d.status] !== undefined) (counts as any)[d.status]++; });

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedDefects = defects.filter(d => selectedIds.has(d.id));
  const selectedSiteIds = new Set(selectedDefects.map(d => d.site_id));
  const canBatchQuote = selectedDefects.length > 0 && selectedSiteIds.size === 1 && !selectedDefects.some(d => d.quote_id);

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Defect Tracking</h1>
          <p className="text-sm text-muted-foreground">Log, track and quote deficiencies found during inspections.</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && selectedIds.size > 0 && (
            <Button onClick={() => generateQuoteForDefects(selectedDefects)} disabled={!canBatchQuote || quoting} variant="secondary">
              {quoting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              Quote {selectedIds.size} selected
            </Button>
          )}
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Report Defect
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(["open", "in_progress", "resolved", "deferred", "quoted"] as const).map(s => {
          const Icon = STATUS_ICON[s];
          return (
            <Card key={s} className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}>
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{(counts as any)[s]}</p>
                  <p className="text-xs text-muted-foreground capitalize">{s.replace("_", " ")}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search defects..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="deferred">Deferred</SelectItem>
            <SelectItem value="quoted">Quoted</SelectItem>
          </SelectContent>
        </Select>
        <Select value={quotedFilter} onValueChange={(v: any) => setQuotedFilter(v)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Quote Status</SelectItem>
            <SelectItem value="unquoted">Unquoted</SelectItem>
            <SelectItem value="quoted">Quoted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {isAdmin && <TableHead className="w-10" />}
                <TableHead>Defect</TableHead>
                <TableHead>Photos</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Asset / Site</TableHead>
                <TableHead className="hidden md:table-cell">Reported</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={isAdmin ? 8 : 7} className="text-center py-8 text-muted-foreground">No defects found</TableCell></TableRow>
              ) : filtered.map(d => {
                const photos = (d.photos as string[] | null) || [];
                return (
                  <TableRow key={d.id}>
                    {isAdmin && (
                      <TableCell>
                        <Checkbox checked={selectedIds.has(d.id)} onCheckedChange={() => toggleSelected(d.id)} disabled={!!d.quote_id} />
                      </TableCell>
                    )}
                    <TableCell>
                      <p className="font-medium text-sm">{d.title}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {d.category && <Badge variant="outline" className="text-[10px] capitalize">{d.category.replace("_", " ")}</Badge>}
                        {d.location_on_site && <span className="text-[10px] text-muted-foreground">{d.location_on_site}</span>}
                      </div>
                      {d.description && <p className="text-xs text-muted-foreground line-clamp-1">{d.description}</p>}
                    </TableCell>
                    <TableCell>
                      {photos.length > 0 ? (
                        <div className="flex -space-x-2">
                          {photos.slice(0, 3).map((url, i) => (
                            <img key={i} src={url} alt="" className="h-8 w-8 rounded border-2 border-background object-cover" />
                          ))}
                          {photos.length > 3 && <span className="text-xs text-muted-foreground ml-3">+{photos.length - 3}</span>}
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={SEVERITY_BADGE[d.severity]}>{d.severity}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE[d.status]}>{d.status.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {d.asset_id ? assetLookup[d.asset_id] || "—" : d.site_id ? siteLookup[d.site_id] || "—" : "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      <div>{profiles[d.reported_by] || "Unknown"}</div>
                      <div>{format(new Date(d.created_at), "dd MMM yyyy")}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        {isAdmin && !d.quote_id && d.status !== "resolved" && (
                          <Button variant="ghost" size="sm" title="Generate Quote" onClick={() => generateQuoteForDefects([d])} disabled={quoting}>
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {d.quote_id && (
                          <Button variant="ghost" size="sm" title="View Quote" onClick={() => navigate(`/invoices/${d.quote_id}`)}>
                            <FileText className="h-3.5 w-3.5 text-primary" />
                          </Button>
                        )}
                        {d.status === "open" && (
                          <Button variant="ghost" size="sm" onClick={() => handleStatusChange(d.id, "in_progress")} title="Mark in progress">
                            <Clock className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {(d.status === "open" || d.status === "in_progress") && (
                          <Button variant="ghost" size="sm" title="Resolve" onClick={() => { setSelectedDefect(d); setResolutionNotes(""); setResolveDialogOpen(true); }}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
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

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Report Defect</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Cracked outlet cap — Level 3" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Detail the deficiency..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Asset</Label>
                <Select value={form.asset_id || "_none"} onValueChange={v => setForm(f => ({ ...f, asset_id: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {assets.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Site</Label>
                <Select value={form.site_id || "_none"} onValueChange={v => setForm(f => ({ ...f, site_id: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Location on Site</Label>
              <Input value={form.location_on_site} onChange={e => setForm(f => ({ ...f, location_on_site: e.target.value }))} placeholder="e.g. 3rd floor, corridor B" />
            </div>
            <div className="space-y-2">
              <Label>BS Standard Reference</Label>
              <Input value={form.bs_standard_reference} onChange={e => setForm(f => ({ ...f, bs_standard_reference: e.target.value }))} placeholder="e.g. BS 5839-1 clause 26.2d" />
            </div>
            <div className="space-y-2">
              <Label>Photos</Label>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={onPhotoSelect} />
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full">
                <Camera className="mr-2 h-4 w-4" /> Add Photos {pendingPhotos.length > 0 && `(${pendingPhotos.length})`}
              </Button>
              {pendingPhotos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pendingPhotos.map((f, i) => (
                    <div key={i} className="relative">
                      <img src={URL.createObjectURL(f)} alt="" className="h-16 w-16 rounded object-cover border" />
                      <button type="button" onClick={() => setPendingPhotos(p => p.filter((_, j) => j !== i))}
                        className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={handleCreate} disabled={!form.title.trim() || creating} className="w-full">
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Report Defect
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Resolve dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Resolve Defect</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm font-medium">{selectedDefect?.title}</p>
            <div className="space-y-2">
              <Label>Resolution Notes</Label>
              <Textarea value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)} placeholder="Describe what was done to resolve..." rows={3} />
            </div>
            <Button onClick={handleResolve} className="w-full">Mark Resolved</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
