import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Globe,
  Building,
  Layers,
  MapPin,
  Plus,
  ChevronRight,
  ChevronDown,
  Search,
  Pencil,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";

type Site = {
  id: string;
  name: string;
  site_type: string;
  parent_id: string | null;
  address: string | null;
  postcode: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  created_at: string;
};

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  region: { label: "Region", icon: Globe, color: "text-blue-500" },
  site: { label: "Site", icon: MapPin, color: "text-green-500" },
  building: { label: "Building", icon: Building, color: "text-amber-500" },
  zone: { label: "Zone", icon: Layers, color: "text-purple-500" },
};

const CHILD_TYPES: Record<string, string> = {
  region: "site",
  site: "building",
  building: "zone",
};

const emptySite = {
  name: "",
  site_type: "region",
  parent_id: null as string | null,
  address: "",
  postcode: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  notes: "",
};

export default function Sites() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [form, setForm] = useState(emptySite);

  const fetchSites = async () => {
    const { data, error } = await supabase
      .from("sites")
      .select("*")
      .order("name");
    if (error) {
      toast({ title: "Error", description: "Failed to load sites.", variant: "destructive" });
    }
    setSites((data as Site[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchSites();
  }, []);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getChildren = (parentId: string | null) =>
    sites.filter((s) => s.parent_id === parentId);

  const filteredRoots = search.trim()
    ? sites.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.postcode?.toLowerCase().includes(search.toLowerCase()) ||
          s.address?.toLowerCase().includes(search.toLowerCase())
      )
    : getChildren(null);

  const openCreate = (parentId: string | null = null, type: string = "region") => {
    setEditing(null);
    setForm({ ...emptySite, parent_id: parentId, site_type: type });
    setDialogOpen(true);
  };

  const openEdit = (site: Site) => {
    setEditing(site);
    setForm({
      name: site.name,
      site_type: site.site_type,
      parent_id: site.parent_id,
      address: site.address || "",
      postcode: site.postcode || "",
      contact_name: site.contact_name || "",
      contact_phone: site.contact_phone || "",
      contact_email: site.contact_email || "",
      notes: site.notes || "",
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
      site_type: form.site_type,
      parent_id: form.parent_id || null,
      address: form.address || null,
      postcode: form.postcode || null,
      contact_name: form.contact_name || null,
      contact_phone: form.contact_phone || null,
      contact_email: form.contact_email || null,
      notes: form.notes || null,
    };

    if (editing) {
      const { error } = await supabase.from("sites").update(payload).eq("id", editing.id);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Site updated" });
    } else {
      const { error } = await supabase.from("sites").insert(payload as any);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Site created" });
    }
    setDialogOpen(false);
    fetchSites();
  };

  const handleDelete = async (id: string) => {
    const children = getChildren(id);
    if (children.length > 0) {
      toast({
        title: "Cannot delete",
        description: "Remove child sites first.",
        variant: "destructive",
      });
      return;
    }
    const { error } = await supabase.from("sites").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Site deleted" });
    fetchSites();
  };

  const counts = {
    region: sites.filter((s) => s.site_type === "region").length,
    site: sites.filter((s) => s.site_type === "site").length,
    building: sites.filter((s) => s.site_type === "building").length,
    zone: sites.filter((s) => s.site_type === "zone").length,
  };

  const renderTreeRow = (site: Site, depth: number): React.ReactNode => {
    const children = getChildren(site.id);
    const isExpanded = expanded.has(site.id);
    const config = TYPE_CONFIG[site.site_type];
    const Icon = config?.icon || MapPin;
    const childType = CHILD_TYPES[site.site_type];

    return (
      <div key={site.id}>
        <div
          className="flex items-center gap-2 py-2 px-3 border-b border-border/50 hover:bg-muted/50 transition-colors"
          style={{ paddingLeft: `${depth * 24 + 12}px` }}
        >
          {children.length > 0 || childType ? (
            <button onClick={() => toggle(site.id)} className="shrink-0">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          ) : (
            <div className="w-4" />
          )}
          <Icon className={`h-4 w-4 shrink-0 ${config?.color || ""}`} />
          <span className="font-medium text-sm flex-1 min-w-0 truncate">{site.name}</span>
          <Badge variant="secondary" className="text-[10px] capitalize shrink-0">
            {site.site_type}
          </Badge>
          {site.postcode && (
            <span className="text-xs text-muted-foreground shrink-0">{site.postcode}</span>
          )}
          {userRole === "admin" && (
            <div className="flex items-center gap-1 shrink-0 ml-2">
              {childType && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    openCreate(site.id, childType);
                  }}
                  title={`Add ${childType}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => openEdit(site)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => handleDelete(site.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        {isExpanded && children.map((child) => renderTreeRow(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sites</h1>
          <p className="text-sm text-muted-foreground">
            Manage your estate hierarchy — regions, sites, buildings, and zones.
          </p>
        </div>
        {userRole === "admin" && (
          <Button onClick={() => openCreate(null, "region")}>
            <Plus className="mr-2 h-4 w-4" /> Add Region
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Object.entries(TYPE_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <Card key={key}>
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className={`h-5 w-5 ${cfg.color}`} />
                <div>
                  <p className="text-2xl font-bold">{counts[key as keyof typeof counts]}</p>
                  <p className="text-xs text-muted-foreground">{cfg.label}s</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search sites..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tree */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
          ) : filteredRoots.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {search ? "No sites match your search." : "No sites yet. Add a region to get started."}
            </p>
          ) : (
            <div>{filteredRoots.map((site) => renderTreeRow(site, 0))}</div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} {TYPE_CONFIG[form.site_type]?.label || "Site"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. North West Region"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Type</label>
                <Select
                  value={form.site_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, site_type: v }))}
                  disabled={!!editing}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="region">Region</SelectItem>
                    <SelectItem value="site">Site</SelectItem>
                    <SelectItem value="building">Building</SelectItem>
                    <SelectItem value="zone">Zone</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Address</label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Postcode</label>
                <Input
                  value={form.postcode}
                  onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Contact Name</label>
                <Input
                  value={form.contact_name}
                  onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Phone</label>
                <Input
                  value={form.contact_phone}
                  onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email</label>
                <Input
                  value={form.contact_email}
                  onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>{editing ? "Update" : "Create"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
