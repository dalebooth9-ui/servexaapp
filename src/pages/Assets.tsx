import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useUndoAction } from "@/hooks/useUndoAction";
import { useAssetCategories } from "@/hooks/useAssetCategories";
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
  Settings2,
  Upload,
  ScanLine,
  Download,
  FolderOpen,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import BulkImportAssetsDialog from "@/components/BulkImportAssetsDialog";
import ScanAssetsDialog from "@/components/ScanAssetsDialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { fuzzyFilter } from "@/lib/fuzzyMatch";
import { UKDateInput } from "@/components/ui/uk-date-input";

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
type CustomerRow = { id: string; name: string };
type CustomerSiteRow = { customer_id: string; site_id: string };

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

// Categories now loaded dynamically via useAssetCategories hook

export default function Assets() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const { deleteWithUndo, editWithUndo } = useUndoAction();
  const { categories: assetCategories, refetch: refetchCategories } = useAssetCategories();
  const CATEGORIES = assetCategories.map((c) => c.slug);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [customerSites, setCustomerSites] = useState<CustomerSiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState(emptyAsset);
  const [catOpen, setCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [viewMode, setViewMode] = useState<"folders" | "all">("folders");
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [showEmptySites, setShowEmptySites] = useState(false);
  const [folderSearch, setFolderSearch] = useState("");

  const toSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const handleAddCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    const slug = toSlug(name);
    if (assetCategories.some((c) => c.slug === slug)) {
      toast({ title: "Category already exists", variant: "destructive" });
      return;
    }
    setAddingCat(true);
    const maxOrder = assetCategories.reduce((m, c) => Math.max(m, c.sort_order), -1);
    const { error } = await supabase.from("asset_categories" as any).insert({ name, slug, sort_order: maxOrder + 1 } as any);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { setNewCatName(""); toast({ title: "Category added" }); refetchCategories(); }
    setAddingCat(false);
  };

  const handleRenameCategory = async (id: string, oldName: string) => {
    const name = editCatName.trim();
    if (!name || name === oldName) { setEditingCatId(null); return; }
    const slug = toSlug(name);
    const { error } = await supabase.from("asset_categories" as any).update({ name, slug } as any).eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Category renamed" }); refetchCategories(); }
    setEditingCatId(null);
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    const { error } = await supabase.from("asset_categories" as any).delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: `"${name}" removed` }); refetchCategories(); }
  };
  const fetchData = async () => {
    const [assetRes, siteRes, custRes, csRes] = await Promise.all([
      supabase.from("assets").select("*").order("name"),
      supabase.from("sites").select("id, name, site_type").order("name"),
      supabase.from("customers").select("id, name").order("name"),
      supabase.from("customer_sites").select("customer_id, site_id"),
    ]);
    setAssets((assetRes.data as Asset[]) || []);
    setSites((siteRes.data as SiteOption[]) || []);
    setCustomers((custRes.data as CustomerRow[]) || []);
    setCustomerSites((csRes.data as CustomerSiteRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const siteLookup = Object.fromEntries(sites.map((s) => [s.id, s.name]));
  const customerBySite: Record<string, CustomerRow | undefined> = {};
  {
    const custLookup = Object.fromEntries(customers.map((c) => [c.id, c]));
    for (const cs of customerSites) customerBySite[cs.site_id] = custLookup[cs.customer_id];
  }

  // Assets scoped to current view (site folder or all)
  const scopedAssets = viewMode === "folders" && selectedSiteId
    ? assets.filter((a) => a.site_id === selectedSiteId)
    : assets;

  const filteredBase = scopedAssets.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
    return true;
  });
  const filtered = fuzzyFilter(filteredBase, search, (a) => [
    a.name,
    a.asset_tag,
    a.serial_number,
    a.make,
    a.model,
    (a as any).location_notes,
    siteLookup[(a as any).site_id],
  ]);

  // Site folders grouped by customer
  const assetCountBySite: Record<string, number> = {};
  for (const a of assets) {
    if (a.site_id) assetCountBySite[a.site_id] = (assetCountBySite[a.site_id] || 0) + 1;
  }
  const foldersByCustomer: { customerName: string; sites: SiteOption[] }[] = (() => {
    const groups = new Map<string, SiteOption[]>();
    for (const s of sites) {
      const cust = customerBySite[s.id]?.name || "Unassigned";
      if (!groups.has(cust)) groups.set(cust, []);
      groups.get(cust)!.push(s);
    }
    const q = folderSearch.trim().toLowerCase();
    return Array.from(groups.entries())
      .map(([customerName, siteList]) => ({
        customerName,
        sites: siteList
          .filter((s) => (showEmptySites ? true : (assetCountBySite[s.id] || 0) > 0))
          .filter((s) => {
            if (!q) return true;
            return s.name.toLowerCase().includes(q) || customerName.toLowerCase().includes(q);
          })
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((g) => g.sites.length > 0)
      .sort((a, b) => a.customerName.localeCompare(b.customerName));
  })();

  const selectedSite = selectedSiteId ? sites.find((s) => s.id === selectedSiteId) : null;
  const selectedSiteCustomer = selectedSiteId ? customerBySite[selectedSiteId]?.name : null;

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
      const oldAsset = assets.find((a) => a.id === editing.id);
      const oldPayload = oldAsset ? {
        name: oldAsset.name, asset_tag: oldAsset.asset_tag, category: oldAsset.category,
        make: oldAsset.make, model: oldAsset.model, serial_number: oldAsset.serial_number,
        site_id: oldAsset.site_id, install_date: oldAsset.install_date,
        warranty_expiry: oldAsset.warranty_expiry, status: oldAsset.status, notes: oldAsset.notes,
      } : null;
      const editId = editing.id;
      const { error } = await supabase.from("assets").update(payload).eq("id", editId);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
      setDialogOpen(false);
      fetchData();
      editWithUndo({
        label: "Asset updated",
        onUndo: async () => {
          if (oldPayload) {
            await supabase.from("assets").update(oldPayload).eq("id", editId);
            fetchData();
          }
        },
      });
      return;
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
    const deletedAsset = assets.find((a) => a.id === id);
    if (!deletedAsset) return;
    setAssets((prev) => prev.filter((a) => a.id !== id));
    deleteWithUndo({
      key: id,
      label: "Asset deleted",
      onConfirm: async () => {
        const { error } = await supabase.from("assets").delete().eq("id", id);
        if (error) {
          toast({ title: "Error", description: error.message, variant: "destructive" });
          setAssets((prev) => [...prev, deletedAsset]);
        }
      },
      onUndo: () => setAssets((prev) => [...prev, deletedAsset]),
    });
  };

  const statusCounts = {
    operational: assets.filter((a) => a.status === "operational").length,
    maintenance: assets.filter((a) => a.status === "maintenance").length,
    faulty: assets.filter((a) => a.status === "faulty").length,
    decommissioned: assets.filter((a) => a.status === "decommissioned").length,
  };

  const handleExportCsv = () => {
    if (filtered.length === 0) {
      toast({ title: "Nothing to export", description: "No assets match the current filters.", variant: "destructive" });
      return;
    }
    const headers = ["Name", "Asset Tag", "Category", "Site", "Make", "Model", "Serial Number", "Status", "Install Date", "Warranty Expiry", "Notes"];
    const esc = (v: any) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    filtered.forEach((a) => {
      lines.push([
        a.name, a.asset_tag, a.category,
        a.site_id ? (siteLookup[a.site_id] || "") : "",
        a.make, a.model, a.serial_number, a.status,
        a.install_date, a.warranty_expiry, a.notes,
      ].map(esc).join(","));
    });
    const csv = "\uFEFF" + lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const siteSlug = viewMode === "folders" && selectedSiteId
      ? `-${(siteLookup[selectedSiteId] || "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`
      : "";
    const scopeSite = statusFilter === "all" && categoryFilter === "all" && !search.trim() ? "" :
      (categoryFilter !== "all" ? `-${categoryFilter}` : "") +
      (statusFilter !== "all" ? `-${statusFilter}` : "");
    const dateStr = format(new Date(), "yyyy-MM-dd");
    const a = document.createElement("a");
    a.href = url;
    a.download = `assets${siteSlug}${scopeSite}-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inSiteFolder = viewMode === "folders" && !!selectedSiteId;
  const showFolderList = viewMode === "folders" && !selectedSiteId;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assets</h1>
          <p className="text-sm text-muted-foreground">
            Track equipment, systems, and infrastructure across your estate.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!showFolderList && (
            <Button variant="outline" onClick={handleExportCsv} disabled={filtered.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Download CSV
            </Button>
          )}
          {userRole === "admin" && (
            <>
              <Button variant="outline" onClick={() => setScanOpen(true)}>
                <ScanLine className="mr-2 h-4 w-4" /> Scan Asset List
              </Button>
              <Button variant="outline" onClick={() => setBulkImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" /> Bulk Import
              </Button>
              <Button onClick={() => {
                openCreate();
                if (inSiteFolder && selectedSiteId) {
                  setForm({ ...emptyAsset, site_id: selectedSiteId });
                }
              }}>
                <Plus className="mr-2 h-4 w-4" /> Add Asset
              </Button>
            </>
          )}
        </div>
      </div>

      {/* View mode tabs */}
      <Tabs
        value={viewMode}
        onValueChange={(v) => { setViewMode(v as any); setSelectedSiteId(null); }}
      >
        <TabsList>
          <TabsTrigger value="folders">
            <FolderOpen className="mr-1.5 h-4 w-4" /> By site
          </TabsTrigger>
          <TabsTrigger value="all">All assets</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Breadcrumb when inside a site folder */}
      {inSiteFolder && selectedSite && (
        <div className="flex items-center gap-2 text-sm">
          <Button variant="ghost" size="sm" onClick={() => setSelectedSiteId(null)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> All sites
          </Button>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          {selectedSiteCustomer && (
            <>
              <span className="text-muted-foreground">{selectedSiteCustomer}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </>
          )}
          <span className="font-medium">{selectedSite.name}</span>
          <Badge variant="secondary" className="ml-1">{assetCountBySite[selectedSite.id] || 0} assets</Badge>
        </div>
      )}

      {/* Folder list (default view) */}
      {showFolderList ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search sites or customers..."
                value={folderSearch}
                onChange={(e) => setFolderSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={showEmptySites}
                onChange={(e) => setShowEmptySites(e.target.checked)}
                className="rounded border-input"
              />
              Show empty sites
            </label>
          </div>
          {loading ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading...</CardContent></Card>
          ) : foldersByCustomer.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No sites with assets yet.</CardContent></Card>
          ) : (
            <div className="space-y-4">
              {foldersByCustomer.map((group) => (
                <div key={group.customerName} className="space-y-1.5">
                  <div className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.customerName}
                  </div>
                  <Card>
                    <CardContent className="p-0 divide-y">
                      {group.sites.map((s) => {
                        const count = assetCountBySite[s.id] || 0;
                        const isEmpty = count === 0;
                        return (
                          <button
                            key={s.id}
                            onClick={() => setSelectedSiteId(s.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors ${isEmpty ? "opacity-60" : ""}`}
                          >
                            <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">
                                {group.customerName !== "Unassigned" ? `${group.customerName.toUpperCase()} — ${s.name}` : s.name}
                              </div>
                              <div className="text-xs text-muted-foreground capitalize">{s.site_type}</div>
                            </div>
                            <Badge variant={isEmpty ? "outline" : "secondary"}>
                              {count} {count === 1 ? "asset" : "assets"}
                            </Badge>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </button>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>




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
        {userRole === "admin" && (
          <Collapsible open={catOpen} onOpenChange={setCatOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="mr-1 h-4 w-4" /> Manage Categories
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        )}
      </div>

      {userRole === "admin" && catOpen && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="New category name"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                className="max-w-xs"
              />
              <Button onClick={handleAddCategory} disabled={addingCat || !newCatName.trim()} size="sm">
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>
            {assetCategories.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assetCategories.map((cat, i) => (
                    <TableRow key={cat.id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        {editingCatId === cat.id ? (
                          <Input
                            value={editCatName}
                            onChange={(e) => setEditCatName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenameCategory(cat.id, cat.name);
                              if (e.key === "Escape") setEditingCatId(null);
                            }}
                            onBlur={() => handleRenameCategory(cat.id, cat.name)}
                            autoFocus
                            className="h-7 text-sm max-w-[200px]"
                          />
                        ) : (
                          <span
                            className="cursor-pointer hover:underline"
                            onDoubleClick={() => { setEditingCatId(cat.id); setEditCatName(cat.name); }}
                            title="Double-click to rename"
                          >
                            {cat.name}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs font-mono">{cat.slug}</TableCell>
                      <TableCell>
                        <button onClick={() => handleDeleteCategory(cat.id, cat.name)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

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
        </>
      )}



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
                <UKDateInput  value={form.install_date} onChange={(e) => setForm((f) => ({ ...f, install_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Warranty Expiry</label>
                <UKDateInput  value={form.warranty_expiry} onChange={(e) => setForm((f) => ({ ...f, warranty_expiry: e.target.value }))} />
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

      <BulkImportAssetsDialog
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
        onImported={fetchData}
      />

      <ScanAssetsDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onImported={fetchData}
        sites={sites}
        defaultSiteId={inSiteFolder ? selectedSiteId : null}
      />

    </div>
  );
}
