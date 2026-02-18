import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Plus,
  Search,
  Pencil,
  Trash2,
  CheckCircle2,
  Wrench,
  AlertTriangle,
  XCircle,
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

type SiteOption = { id: string; name: string; site_type: string };

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  operational: { label: "Operational", icon: CheckCircle2, variant: "default" },
  maintenance: { label: "Maintenance", icon: Wrench, variant: "secondary" },
  faulty: { label: "Faulty", icon: AlertTriangle, variant: "destructive" },
  decommissioned: { label: "Decommissioned", icon: XCircle, variant: "outline" },
};

const emptyAsset = {
  name: "",
  asset_tag: "",
  category: "general",
  make: "",
  model: "",
  serial_number: "",
  site_id: "" as string,
  install_date: "",
  warranty_expiry: "",
  status: "operational",
  notes: "",
};

const CATEGORIES = ["general", "hvac", "electrical", "plumbing", "fire_safety", "elevator", "security", "it_network"];

export default function Assets() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState(emptyAsset);

  const fetchData = async () => {
    const [assetRes, siteRes] = await Promise.all([
      supabase.from("assets").select("*").order("name"),
      supabase.from("sites").select("id, name, site_type").order("name"),
    ]);
    setAssets((assetRes.data as Asset[]) || []);
    setSites((siteRes.data as SiteOption[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const siteLookup = Object.fromEntries(sites.map((s) => [s.id, s.name]));

  const filtered = assets.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.asset_tag?.toLowerCase().includes(q) ||
        a.serial_number?.toLowerCase().includes(q) ||
        a.make?.toLowerCase().includes(q) ||
        a.model?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyAsset);
    setDialogOpen(true);
  };

  const openEdit = (asset: Asset) => {
    setEditing(asset);
    setForm({
      name: asset.name,
      asset_tag: asset.asset_tag || "",
      category: asset.category,
      make: asset.make || "",
      model: asset.model || "",
      serial_number: asset.serial_number || "",
      site_id: asset.site_id || "",
      install_date: asset.install_date || "",
      warranty_expiry: asset.warranty_expiry || "",
      status: asset.status,
      notes: asset.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    const payload = {
      name: form.name.trim(),
      asset_tag: form.asset_tag || null,
      category: form.category,
      make: form.make || null,
      model: form.model || null,
      serial_number: form.serial_number || null,
      site_id: form.site_id || null,
      install_date: form.install_date || null,
      warranty_expiry: form.warranty_expiry || null,
      status: form.status,
      notes: form.notes || null,
    };

    if (editing) {
      const { error } = await supabase.from("assets").update(payload).eq("id", editing.id);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Asset updated" });
    } else {
      const { error } = await supabase.from("assets").insert(payload as any);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Asset created" });
    }
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("assets").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Asset deleted" });
    fetchData();
  };

  const statusCounts = {
    operational: assets.filter((a) => a.status === "operational").length,
    maintenance: assets.filter((a) => a.status === "maintenance").length,
    faulty: assets.filter((a) => a.status === "faulty").length,
    decommissioned: assets.filter((a) => a.status === "decommissioned").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assets</h1>
          <p className="text-sm text-muted-foreground">
            Track equipment, systems, and infrastructure across your estate.
          </p>
        </div>
        {userRole === "admin" && (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Add Asset
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <Card key={key} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}>
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className={`h-5 w-5 ${key === "operational" ? "text-green-500" : key === "faulty" ? "text-destructive" : key === "maintenance" ? "text-amber-500" : "text-muted-foreground"}`} />
                <div>
                  <p className="text-2xl font-bold">{statusCounts[key as keyof typeof statusCounts]}</p>
                  <p className="text-xs text-muted-foreground">{cfg.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
              </SelectItem>
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
              {assets.length === 0 ? "No assets yet. Add your first asset to get started." : "No assets match your filters."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Tag</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Make / Model</TableHead>
                  <TableHead>Status</TableHead>
                  {userRole === "admin" && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((asset) => {
                  const sc = STATUS_CONFIG[asset.status];
                  return (
                    <TableRow key={asset.id}>
                      <TableCell className="font-medium">
                        <Link to={`/assets/${asset.id}`} className="text-primary hover:underline">
                          {asset.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs font-mono">
                        {asset.asset_tag || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-xs">
                          {asset.category.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {asset.site_id ? siteLookup[asset.site_id] || "Unknown" : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[asset.make, asset.model].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={sc?.variant || "secondary"} className="capitalize text-xs">
                          {asset.status}
                        </Badge>
                      </TableCell>
                      {userRole === "admin" && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(asset)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(asset.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} Asset</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Boiler Unit #3"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Asset Tag</label>
                <Input
                  value={form.asset_tag}
                  onChange={(e) => setForm((f) => ({ ...f, asset_tag: e.target.value }))}
                  placeholder="e.g. AST-001"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Category</label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Status</label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Make</label>
                <Input value={form.make} onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Model</label>
                <Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Serial Number</label>
                <Input value={form.serial_number} onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Site</label>
                <Select value={form.site_id} onValueChange={(v) => setForm((f) => ({ ...f, site_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                  <SelectContent>
                    {sites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.site_type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Install Date</label>
                <Input type="date" value={form.install_date} onChange={(e) => setForm((f) => ({ ...f, install_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Warranty Expiry</label>
                <Input type="date" value={form.warranty_expiry} onChange={(e) => setForm((f) => ({ ...f, warranty_expiry: e.target.value }))} />
              </div>
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
