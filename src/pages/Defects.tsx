import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Plus, Search, CheckCircle2, Clock, AlertCircle, XCircle } from "lucide-react";
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
  photo_url: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  low: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

const STATUS_BADGE: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  resolved: "bg-green-100 text-green-700",
  deferred: "bg-gray-100 text-gray-600",
};

const STATUS_ICON: Record<string, React.ElementType> = {
  open: AlertCircle,
  in_progress: Clock,
  resolved: CheckCircle2,
  deferred: XCircle,
};

export default function Defects() {
  const { user, userRole } = useAuth();
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);
  const [assets, setAssets] = useState<{ id: string; name: string }[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    title: "", description: "", severity: "medium", asset_id: "", site_id: "", job_id: "",
  });
  const [resolutionNotes, setResolutionNotes] = useState("");

  const fetchData = async () => {
    const [defRes, assetRes, siteRes] = await Promise.all([
      supabase.from("defects").select("*").order("created_at", { ascending: false }),
      supabase.from("assets").select("id, name").order("name"),
      supabase.from("sites").select("id, name").order("name"),
    ]);
    const defs = (defRes.data || []) as Defect[];
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
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!form.title.trim() || !user) return;
    const { error } = await supabase.from("defects").insert({
      title: form.title.trim(),
      description: form.description || null,
      severity: form.severity,
      asset_id: form.asset_id || null,
      site_id: form.site_id || null,
      job_id: form.job_id || null,
      reported_by: user.id,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Defect reported");
    setDialogOpen(false);
    setForm({ title: "", description: "", severity: "medium", asset_id: "", site_id: "", job_id: "" });
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

  const assetLookup = Object.fromEntries(assets.map(a => [a.id, a.name]));
  const siteLookup = Object.fromEntries(sites.map(s => [s.id, s.name]));

  const filtered = defects.filter(d => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    if (severityFilter !== "all" && d.severity !== severityFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return d.title.toLowerCase().includes(s) || (d.description || "").toLowerCase().includes(s);
    }
    return true;
  });

  const counts = { open: 0, in_progress: 0, resolved: 0, deferred: 0 };
  defects.forEach(d => { if (counts[d.status as keyof typeof counts] !== undefined) counts[d.status as keyof typeof counts]++; });

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Defect Tracking</h1>
          <p className="text-sm text-muted-foreground">Log and track deficiencies found during inspections.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Report Defect
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["open", "in_progress", "resolved", "deferred"] as const).map(s => {
          const Icon = STATUS_ICON[s];
          return (
            <Card key={s} className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}>
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{counts[s]}</p>
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
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Defect</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Asset / Site</TableHead>
                <TableHead className="hidden md:table-cell">Reported</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No defects found</TableCell></TableRow>
              ) : filtered.map(d => (
                <TableRow key={d.id}>
                  <TableCell>
                    <p className="font-medium text-sm">{d.title}</p>
                    {d.description && <p className="text-xs text-muted-foreground line-clamp-1">{d.description}</p>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={SEVERITY_BADGE[d.severity]}>{d.severity}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={STATUS_BADGE[d.status]}>{d.status.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {d.asset_id ? assetLookup[d.asset_id] || "—" : d.site_id ? siteLookup[d.site_id] || "—" : "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    <div>{profiles[d.reported_by] || "Unknown"}</div>
                    <div>{format(new Date(d.created_at), "dd MMM yyyy")}</div>
                  </TableCell>
                  <TableCell>
                    {d.status === "open" && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleStatusChange(d.id, "in_progress")}>
                          <Clock className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedDefect(d); setResolutionNotes(""); setResolveDialogOpen(true); }}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                    {d.status === "in_progress" && (
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedDefect(d); setResolutionNotes(""); setResolveDialogOpen(true); }}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
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
                <Label>Asset</Label>
                <Select value={form.asset_id} onValueChange={v => setForm(f => ({ ...f, asset_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {assets.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Site</Label>
              <Select value={form.site_id} onValueChange={v => setForm(f => ({ ...f, site_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} disabled={!form.title.trim()} className="w-full">Report Defect</Button>
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
