import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BulkImportSitesDialog from "@/components/BulkImportSitesDialog";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useUndoAction } from "@/hooks/useUndoAction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Globe, Building, Layers, MapPin, Plus, ChevronRight, ChevronDown,
  Search, Pencil, FileSpreadsheet, Trash2, FolderOpen, Users, LinkIcon, GripVertical, X, Briefcase, Loader2,
} from "lucide-react";
import SiteDocumentDropZone from "@/components/SiteDocumentDropZone";
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
  outlets_count: number | null;
  riser_location: string | null;
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
  outlets_count: "" as string,
  riser_location: "",
};

type CustomerFolder = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  sites: Site[];
  jobCountsBySite?: Record<string, number>;
};

// ── DnD helper components ───────────────────────────────────────────────────

function DraggableSiteChip({ site, typeConfig }: { site: Site; typeConfig: typeof TYPE_CONFIG }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: site.id, data: { site } });
  const cfg = typeConfig[site.site_type];
  const Icon = cfg?.icon || MapPin;
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 rounded-md border bg-card px-3 py-2 cursor-grab active:cursor-grabbing transition-opacity select-none ${isDragging ? "opacity-40" : "hover:border-primary/50"}`}
    >
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg?.color || ""}`} />
      <span className="text-sm font-medium truncate flex-1">{site.name}</span>
      {site.postcode && <span className="text-xs text-muted-foreground shrink-0">{site.postcode}</span>}
      <Badge variant="secondary" className="text-[10px] capitalize shrink-0">{site.site_type}</Badge>
    </div>
  );
}

function DroppableCustomerFolder({ folder, children, isOver }: { folder: CustomerFolder; children: React.ReactNode; isOver: boolean }) {
  const { setNodeRef } = useDroppable({ id: `folder-${folder.id}`, data: { customerId: folder.id } });
  return (
    <div ref={setNodeRef} className={`transition-colors rounded-lg ${isOver ? "ring-2 ring-primary/50 bg-primary/5" : ""}`}>
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

export default function Sites() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const { deleteWithUndo, editWithUndo } = useUndoAction();
  const navigate = useNavigate();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [form, setForm] = useState(emptySite);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customerFolders, setCustomerFolders] = useState<CustomerFolder[]>([]);
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [assignSiteOpen, setAssignSiteOpen] = useState(false);
  const [assignCustomer, setAssignCustomer] = useState<CustomerFolder | null>(null);
  const [assignSelectedSites, setAssignSelectedSites] = useState<Set<string>>(new Set());
  const [assignSaving, setAssignSaving] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [activeDragSite, setActiveDragSite] = useState<Site | null>(null);
  const [collapsedSites, setCollapsedSites] = useState<Set<string>>(new Set());
  const [selectedFolderSites, setSelectedFolderSites] = useState<Map<string, Set<string>>>(new Map());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [highlightedSiteId, setHighlightedSiteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("hierarchy");

  // Create job from site
  const [createJobDialogOpen, setCreateJobDialogOpen] = useState(false);
  const [createJobSite, setCreateJobSite] = useState<Site | null>(null);
  const [createJobCustomerId, setCreateJobCustomerId] = useState<string>("");
  const [createJobForm, setCreateJobForm] = useState({ name: "", priority: "medium", category: "general" });
  const [createJobSaving, setCreateJobSaving] = useState(false);
  const [allCustomers, setAllCustomers] = useState<{ id: string; name: string }[]>([]);

  const openCreateJob = (site: Site, customerId?: string) => {
    setCreateJobSite(site);
    // Auto-detect customer from folder if not explicitly provided
    const resolvedCustomerId = customerId
      || customerFolders.find((f) => f.sites.some((s) => s.id === site.id))?.id
      || "";
    setCreateJobCustomerId(resolvedCustomerId);
    setCreateJobForm({ name: site.name, priority: "medium", category: "general" });
    setCreateJobDialogOpen(true);
  };

  const handleCreateJob = async () => {
    if (!createJobForm.name.trim() || !createJobSite) return;
    setCreateJobSaving(true);
    const { data, error } = await supabase.from("jobs").insert({
      name: createJobForm.name.trim(),
      priority: createJobForm.priority,
      category: createJobForm.category,
      site_id: createJobSite.id,
      address: createJobSite.address || null,
      customer_id: createJobCustomerId || null,
      status: "active",
    } as any).select("id").single();
    setCreateJobSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Job created", description: `${createJobForm.name} linked to ${createJobSite.name}.` });
    setCreateJobDialogOpen(false);
    navigate(`/jobs/${data.id}`);
  };

  // Navigate to a site in the hierarchy: switch tab, clear search, expand all ancestors, highlight the target
  const navigateToSite = (siteId: string) => {
    setActiveTab("hierarchy");
    setSearch("");
    // Collect all ancestor IDs
    const ancestors: string[] = [];
    let current = sites.find((s) => s.id === siteId);
    while (current?.parent_id) {
      ancestors.push(current.parent_id);
      current = sites.find((s) => s.id === current!.parent_id);
    }
    setExpanded((prev) => {
      const next = new Set(prev);
      ancestors.forEach((id) => next.add(id));
      return next;
    });
    setHighlightedSiteId(siteId);
    setTimeout(() => {
      document.getElementById(`site-row-${siteId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    setTimeout(() => setHighlightedSiteId(null), 1800);
  };

  const toggleSiteCollapse = (siteId: string) => {
    setCollapsedSites((prev) => {
      const next = new Set(prev);
      next.has(siteId) ? next.delete(siteId) : next.add(siteId);
      return next;
    });
  };

  const toggleFolderSiteSelect = (folderId: string, siteId: string) => {
    setSelectedFolderSites((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(folderId) || []);
      set.has(siteId) ? set.delete(siteId) : set.add(siteId);
      next.set(folderId, set);
      return next;
    });
  };

  const toggleSelectAllFolderSites = (folderId: string, siteIds: string[]) => {
    setSelectedFolderSites((prev) => {
      const next = new Map(prev);
      const current = next.get(folderId) || new Set<string>();
      const allSelected = siteIds.every((id) => current.has(id));
      next.set(folderId, allSelected ? new Set() : new Set(siteIds));
      return next;
    });
  };

  const handleBulkUnlinkSites = async (folder: CustomerFolder, siteIds: string[]) => {
    try {
      for (const siteId of siteIds) {
        await supabase.from("jobs").delete().eq("customer_id", folder.id).eq("site_id", siteId);
      }
      setSelectedFolderSites((prev) => { const next = new Map(prev); next.delete(folder.id); return next; });
      // Refresh without resetting accordion state
      const { data: jobs } = await supabase.from("jobs").select("customer_id, site_id, name").not("customer_id", "is", null).not("site_id", "is", null);
      const { data: allSites } = await supabase.from("sites").select("*").order("name");
      if (!jobs || !allSites) return;
      const siteMap = new Map<string, Site>((allSites as Site[]).map((s) => [s.id, s]));
      const customerSiteMap = new Map<string, Set<string>>();
      const jobCountMap = new Map<string, Map<string, number>>();
      for (const job of jobs) {
        if (!job.customer_id || !job.site_id) continue;
        if (!customerSiteMap.has(job.customer_id)) customerSiteMap.set(job.customer_id, new Set());
        customerSiteMap.get(job.customer_id)!.add(job.site_id);
        const isPlaceholder = (job.name as string)?.startsWith("Site link —");
        if (!isPlaceholder) {
          if (!jobCountMap.has(job.customer_id)) jobCountMap.set(job.customer_id, new Map());
          const sc = jobCountMap.get(job.customer_id)!;
          sc.set(job.site_id, (sc.get(job.site_id) || 0) + 1);
        }
      }
      setCustomerFolders((prev) => prev.map((f) => {
        const linkedSiteIds = [...(customerSiteMap.get(f.id) || [])];
        const linkedSites = linkedSiteIds.map((sid) => siteMap.get(sid)).filter(Boolean) as Site[];
        const linkedSiteIdSet = new Set(linkedSiteIds);
        const extraChildren = (allSites as Site[]).filter((s) => s.parent_id && linkedSiteIdSet.has(s.parent_id) && !linkedSiteIdSet.has(s.id));
        return { ...f, sites: [...linkedSites, ...extraChildren], jobCountsBySite: Object.fromEntries(jobCountMap.get(f.id) || new Map()) };
      }));
      toast({ title: "Sites removed", description: `${siteIds.length} site(s) unlinked from ${folder.name}.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragStart = (event: DragStartEvent) => {
    const site = event.active.data.current?.site as Site;
    if (site) setActiveDragSite(site);
  };

  const handleDragOver = (event: any) => {
    const over = event.over;
    if (over && String(over.id).startsWith("folder-")) {
      setDragOverFolderId(String(over.id).replace("folder-", ""));
    } else {
      setDragOverFolderId(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragSite(null);
    setDragOverFolderId(null);
    const { active, over } = event;
    if (!over || !String(over.id).startsWith("folder-")) return;
    const customerId = String(over.id).replace("folder-", "");
    const site = active.data.current?.site as Site;
    if (!site) return;
    const folder = customerFolders.find((f) => f.id === customerId);
    if (!folder) return;
    // Check both displayed sites and child sites (whose parent is linked)
    const allLinkedIds = new Set(folder.sites.map((s) => s.id));
    if (allLinkedIds.has(site.id)) {
      toast({ title: "Already linked", description: `${site.name} is already in ${folder.name}.` });
      return;
    }
    try {
      const { error } = await supabase.from("jobs").insert({
        name: `Site link — ${folder.name}`,
        customer_id: customerId,
        site_id: site.id,
        status: "active",
        category: "general",
        priority: "medium",
      } as any);
      if (error) throw error;
      toast({ title: "Site assigned", description: `${site.name} linked to ${folder.name}.` });
      fetchCustomerFolders();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === sites.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sites.map((s) => s.id)));
    }
  };

  const handleBulkDelete = async () => {
    const hasChildren = [...selected].some((id) => sites.some((s) => s.parent_id === id));
    if (hasChildren) {
      toast({ title: "Cannot delete", description: "Some selected sites have children. Remove child sites first.", variant: "destructive" });
      return;
    }
    const count = selected.size;
    const deletedSites = sites.filter((s) => selected.has(s.id));
    setSites((prev) => prev.filter((s) => !selected.has(s.id)));
    setSelected(new Set());
    deleteWithUndo({
      key: "bulk-delete",
      label: `${count} site(s) deleted`,
      onConfirm: async () => {
        const { error } = await supabase.from("sites").delete().in("id", deletedSites.map((s) => s.id));
        if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setSites((prev) => [...prev, ...deletedSites]); }
      },
      onUndo: () => setSites((prev) => [...prev, ...deletedSites]),
    });
  };

  const fetchSites = async () => {
    const { data, error } = await supabase.from("sites").select("*").order("name");
    if (error) toast({ title: "Error", description: "Failed to load sites.", variant: "destructive" });
    setSites((data as Site[]) || []);
    setLoading(false);
  };

  const fetchCustomerFolders = async () => {
    setFoldersLoading(true);
    const { data: customers } = await supabase.from("customers").select("id, name, email, phone, address").order("name");
    const { data: jobs } = await supabase.from("jobs").select("customer_id, site_id, name").not("customer_id", "is", null).not("site_id", "is", null);
    const { data: allSites } = await supabase.from("sites").select("*").order("name");
    if (!customers || !allSites) { setFoldersLoading(false); return; }
    const siteMap = new Map<string, Site>((allSites as Site[]).map((s) => [s.id, s]));
    const customerSiteMap = new Map<string, Set<string>>();
    const jobCountMap = new Map<string, Map<string, number>>();
    for (const job of (jobs || [])) {
      if (!job.customer_id || !job.site_id) continue;
      if (!customerSiteMap.has(job.customer_id)) customerSiteMap.set(job.customer_id, new Set());
      customerSiteMap.get(job.customer_id)!.add(job.site_id);
      // Don't count "Site link —" placeholder jobs in the job count badge
      const isPlaceholder = (job.name as string)?.startsWith("Site link —");
      if (!isPlaceholder) {
        if (!jobCountMap.has(job.customer_id)) jobCountMap.set(job.customer_id, new Map());
        const siteCount = jobCountMap.get(job.customer_id)!;
        siteCount.set(job.site_id, (siteCount.get(job.site_id) || 0) + 1);
      }
    }
    const folders: CustomerFolder[] = (customers as any[]).map((c) => {
      const linkedSiteIds = [...(customerSiteMap.get(c.id) || [])];
      const linkedSites = linkedSiteIds.map((sid) => siteMap.get(sid)).filter(Boolean) as Site[];
      // Include child sites (building/zone) whose parent is a linked site, even if not directly linked
      const linkedSiteIdSet = new Set(linkedSiteIds);
      const extraChildren = (allSites as Site[]).filter(
        (s) => s.parent_id && linkedSiteIdSet.has(s.parent_id) && !linkedSiteIdSet.has(s.id)
      );
      const allSitesForFolder = [...linkedSites, ...extraChildren];
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        address: c.address,
        sites: allSitesForFolder,
        jobCountsBySite: Object.fromEntries(jobCountMap.get(c.id) || new Map()),
      };
    });
    setCustomerFolders(folders);
    setOpenFolders(folders.filter((f) => f.sites.length <= 2).map((f) => f.id));
    // Auto-collapse parent sites that have more than 2 child buildings
    const autoCollapsed = new Set<string>();
    for (const folder of folders) {
      const childCountBySite = new Map<string, number>();
      for (const s of folder.sites) {
        if (s.parent_id && folder.sites.some((p) => p.id === s.parent_id)) {
          childCountBySite.set(s.parent_id, (childCountBySite.get(s.parent_id) || 0) + 1);
        }
      }
      for (const [siteId, count] of childCountBySite.entries()) {
        if (count > 2) autoCollapsed.add(siteId);
      }
    }
    setCollapsedSites(autoCollapsed);
    setFoldersLoading(false);
  };

  const openAssignSite = (folder: CustomerFolder) => {
    setAssignCustomer(folder);
    setAssignSelectedSites(new Set());
    setAssignSiteOpen(true);
  };

  const handleAssignSites = async () => {
    if (!assignCustomer || assignSelectedSites.size === 0) return;
    setAssignSaving(true);
    try {
      const inserts = [...assignSelectedSites].map((siteId) => ({
        name: `Site link — ${assignCustomer.name}`,
        customer_id: assignCustomer.id,
        site_id: siteId,
        status: "active",
        category: "general",
        priority: "medium",
      }));
      const { error } = await supabase.from("jobs").insert(inserts as any);
      if (error) throw error;
      toast({ title: "Sites assigned", description: `${assignSelectedSites.size} site(s) linked to ${assignCustomer.name}.` });
      setAssignSiteOpen(false);
      fetchCustomerFolders();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAssignSaving(false);
    }
  };

  useEffect(() => {
    fetchSites();
    fetchCustomerFolders();
    supabase.from("customers").select("id, name").order("name").then(({ data }) => setAllCustomers(data || []));
  }, []);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getChildren = (parentId: string | null) => sites.filter((s) => s.parent_id === parentId);

  const filteredRoots = search.trim()
    ? sites.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.postcode?.toLowerCase().includes(search.toLowerCase()) || s.address?.toLowerCase().includes(search.toLowerCase()))
    : getChildren(null);

  const openCreate = (parentId: string | null = null, type: string = "region") => {
    setEditing(null);
    setForm({ ...emptySite, parent_id: parentId, site_type: type });
    setDialogOpen(true);
  };

  const openEdit = (site: Site) => {
    setEditing(site);
    setForm({
      name: site.name, site_type: site.site_type, parent_id: site.parent_id,
      address: site.address || "", postcode: site.postcode || "",
      contact_name: site.contact_name || "", contact_phone: site.contact_phone || "",
      contact_email: site.contact_email || "", notes: site.notes || "",
      outlets_count: site.outlets_count != null ? String(site.outlets_count) : "",
      riser_location: (site as any).riser_location || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    const payload = {
      name: form.name.trim(), site_type: form.site_type, parent_id: form.parent_id || null,
      address: form.address || null, postcode: form.postcode || null,
      contact_name: form.contact_name || null, contact_phone: form.contact_phone || null,
      contact_email: form.contact_email || null, notes: form.notes || null,
      outlets_count: form.outlets_count !== "" ? Number(form.outlets_count) : null,
      riser_location: form.riser_location || null,
    };
    if (editing) {
      const oldSite = sites.find((s) => s.id === editing.id);
      const oldPayload = oldSite ? { name: oldSite.name, site_type: oldSite.site_type, parent_id: oldSite.parent_id, address: oldSite.address, postcode: oldSite.postcode, contact_name: oldSite.contact_name, contact_phone: oldSite.contact_phone, contact_email: oldSite.contact_email, notes: oldSite.notes } : null;
      const editId = editing.id;
      const { error } = await supabase.from("sites").update(payload).eq("id", editId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      setDialogOpen(false);
      fetchSites();
      editWithUndo({ label: "Site updated", onUndo: async () => { if (oldPayload) { await supabase.from("sites").update(oldPayload).eq("id", editId); fetchSites(); } } });
      return;
    } else {
      const { error } = await supabase.from("sites").insert(payload as any);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Site created" });
    }
    setDialogOpen(false);
    fetchSites();
  };

  // Recursively collect all descendant IDs
  const getAllDescendantIds = (id: string): string[] => {
    const children = getChildren(id);
    return children.flatMap((c) => [c.id, ...getAllDescendantIds(c.id)]);
  };

  const handleDelete = (id: string) => {
    const children = getChildren(id);
    if (children.length > 0) {
      // Has children — ask for confirmation before cascading
      setConfirmDeleteId(id);
    } else {
      executeSiteDelete(id, []);
    }
  };

  const executeSiteDelete = (id: string, descendantIds: string[]) => {
    const allIds = [id, ...descendantIds];
    const deletedSites = sites.filter((s) => allIds.includes(s.id));
    if (!deletedSites.length) return;
    // Optimistically remove from both hierarchy and customer folder views
    setSites((prev) => prev.filter((s) => !allIds.includes(s.id)));
    setCustomerFolders((prev) => prev.map((f) => ({ ...f, sites: f.sites.filter((s) => !allIds.includes(s.id)) })));
    deleteWithUndo({
      key: id,
      label: descendantIds.length > 0 ? `Site and ${descendantIds.length} child record(s) deleted` : "Site deleted",
      onConfirm: async () => {
        // Delete deepest descendants first to avoid FK constraint issues
        for (const did of [...descendantIds].reverse()) {
          await supabase.from("sites").delete().eq("id", did);
        }
        const { error } = await supabase.from("sites").delete().eq("id", id);
        if (error) {
          toast({ title: "Error", description: error.message, variant: "destructive" });
          setSites((prev) => [...prev, ...deletedSites]);
          setCustomerFolders((prev) => prev.map((f) => ({ ...f, sites: [...f.sites, ...deletedSites.filter((ds) => f.sites.some((s) => s.id === ds.parent_id) || ds.id === id)] })));
        }
      },
      onUndo: () => {
        setSites((prev) => [...prev, ...deletedSites]);
        setCustomerFolders((prev) => prev.map((f) => ({ ...f, sites: [...f.sites, ...deletedSites.filter((ds) => f.sites.some((s) => s.id === ds.parent_id) || ds.id === id)] })));
      },
    });
  };

  const counts = {
    region: sites.filter((s) => s.site_type === "region").length,
    site: sites.filter((s) => s.site_type === "site").length,
    building: sites.filter((s) => s.site_type === "building").length,
    zone: sites.filter((s) => s.site_type === "zone").length,
  };

  const getSiteBreadcrumb = (s: Site): string[] => {
    const parts: string[] = [s.name];
    let current = s;
    while (current.parent_id) {
      const parent = sites.find((p) => p.id === current.parent_id);
      if (!parent) break;
      parts.unshift(parent.name);
      current = parent;
    }
    return parts;
  };

  const renderTreeRow = (site: Site, depth: number): React.ReactNode => {
    const children = getChildren(site.id);
    const isExpanded = expanded.has(site.id);
    const config = TYPE_CONFIG[site.site_type];
    const Icon = config?.icon || MapPin;
    const childType = CHILD_TYPES[site.site_type];
    const isSearching = !!search.trim();
    // Build breadcrumb with IDs so we can navigate on click
    const breadcrumbWithIds: { name: string; id: string }[] = [];
    if (isSearching) {
      let current: Site | undefined = site;
      while (current) {
        breadcrumbWithIds.unshift({ name: current.name, id: current.id });
        current = current.parent_id ? sites.find((p) => p.id === current!.parent_id) : undefined;
      }
    }
    const showBreadcrumb = breadcrumbWithIds.length > 1;
    const isHighlighted = highlightedSiteId === site.id;
    return (
      <div key={site.id} id={`site-row-${site.id}`}>
        <div
          className={`flex items-center gap-2 py-2 px-3 border-b border-border/50 hover:bg-muted/50 transition-colors cursor-pointer ${selected.has(site.id) ? "bg-primary/5" : ""} ${isHighlighted ? "ring-2 ring-inset ring-primary/60 bg-primary/5" : ""}`}
          style={{ paddingLeft: `${depth * 24 + 12}px` }}
          onClick={() => { if (children.length > 0) toggle(site.id); }}
        >
          {userRole === "admin" && (
            <input type="checkbox" checked={selected.has(site.id)} onChange={() => toggleSelect(site.id)} className="h-4 w-4 shrink-0 rounded border-input accent-primary cursor-pointer" onClick={(e) => e.stopPropagation()} />
          )}
          {children.length > 0 ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); toggle(site.id); }} className="shrink-0">
              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
          ) : childType ? (
            <div className="w-4 shrink-0"><ChevronRight className="h-4 w-4 text-muted-foreground/30" /></div>
          ) : <div className="w-4" />}
          <Icon className={`h-4 w-4 shrink-0 ${config?.color || ""}`} />
          <div className="flex-1 min-w-0">
            {showBreadcrumb && (
              <p className="text-[11px] text-muted-foreground/70 truncate flex items-center gap-0.5 leading-tight mb-0.5">
                {breadcrumbWithIds.slice(0, -1).map((crumb, i) => (
                  <span key={crumb.id} className="flex items-center gap-0.5">
                    {i > 0 && <ChevronRight className="h-2.5 w-2.5 shrink-0" />}
                    <button
                      type="button"
                      className="hover:text-primary hover:underline transition-colors cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); navigateToSite(crumb.id); }}
                      title={`Go to ${crumb.name}`}
                    >
                      {crumb.name}
                    </button>
                  </span>
                ))}
                <ChevronRight className="h-2.5 w-2.5 shrink-0" />
              </p>
            )}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-medium text-sm truncate">{site.name}</span>
              {children.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0 bg-muted text-muted-foreground">
                  {children.length} {childType || "building"}{children.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </div>
          <Badge variant="secondary" className="text-[10px] capitalize shrink-0">{site.site_type}</Badge>
          {site.postcode && <span className="text-xs text-muted-foreground shrink-0">{site.postcode}</span>}
          {userRole === "admin" && (
            <div className="flex items-center gap-1 shrink-0 ml-2">
              <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:text-primary" onClick={(e) => { e.stopPropagation(); openCreateJob(site); }} title="Create job for this site">
                <Briefcase className="h-3.5 w-3.5" />
              </Button>
              {childType && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openCreate(site.id, childType); }} title={`Add ${childType}`}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(site); }}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(site.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
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
          <p className="text-sm text-muted-foreground">Manage your estate hierarchy — regions, sites, buildings, and zones.</p>
        </div>
        {userRole === "admin" && (
          <div className="flex gap-2">
            {selected.size > 0 && (
              <Button variant="destructive" onClick={handleBulkDelete}><Trash2 className="mr-2 h-4 w-4" /> Delete {selected.size} Selected</Button>
            )}
            <Button variant="outline" onClick={() => setBulkOpen(true)}><FileSpreadsheet className="mr-2 h-4 w-4" /> Bulk Import</Button>
            <Button onClick={() => openCreate(null, "region")}><Plus className="mr-2 h-4 w-4" /> Add Region</Button>
          </div>
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
        <Input placeholder="Search sites..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="hierarchy"><Globe className="mr-2 h-4 w-4" /> Hierarchy</TabsTrigger>
          <TabsTrigger value="by-customer"><Users className="mr-2 h-4 w-4" /> By Customer</TabsTrigger>
        </TabsList>

        {/* Hierarchy Tab */}
        <TabsContent value="hierarchy" className="mt-4">
          {userRole === "admin" && (
            <div className="mb-4">
              <SiteDocumentDropZone onSiteCreated={fetchSites} />
            </div>
          )}
          <Card>
            <CardContent className="p-0">
              {!loading && filteredRoots.length > 0 && userRole === "admin" && (
                <div className="flex items-center gap-2 py-2 px-3 border-b border-border">
                  <input type="checkbox" checked={selected.size === sites.length && sites.length > 0} onChange={toggleSelectAll} className="h-4 w-4 shrink-0 rounded border-input accent-primary cursor-pointer" />
                  <span className="text-xs text-muted-foreground">{selected.size > 0 ? `${selected.size} of ${sites.length} selected` : "Select all"}</span>
                </div>
              )}
              {loading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
              ) : filteredRoots.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{search ? "No sites match your search." : "No sites yet. Add a region to get started."}</p>
              ) : (
                <div>{filteredRoots.map((site) => renderTreeRow(site, 0))}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Customer Tab */}
        <TabsContent value="by-customer" className="mt-4">
          {!foldersLoading && customerFolders.length > 0 && (
            <div className="flex justify-end mb-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground h-7"
                onClick={() =>
                  setOpenFolders(
                    openFolders.length === customerFolders.length
                      ? []
                      : customerFolders.map((f) => f.id)
                  )
                }
              >
                {openFolders.length === customerFolders.length ? "Collapse all" : "Expand all"}
              </Button>
            </div>
          )}
          {foldersLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
          ) : (
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
              <div className="flex gap-4 items-start">
                {/* Customer folders */}
                <div className="flex-1 min-w-0 space-y-2">
                  {customerFolders.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No customers found.</p>
                  ) : (
                    <Accordion type="multiple" value={openFolders} onValueChange={setOpenFolders} className="space-y-2">
                      {customerFolders
                        .filter((f) => !search.trim() || f.name.toLowerCase().includes(search.toLowerCase()) || f.sites.some((s) => s.name.toLowerCase().includes(search.toLowerCase())))
                        .map((folder) => (
                          <DroppableCustomerFolder key={folder.id} folder={folder} isOver={dragOverFolderId === folder.id}>
                            <AccordionItem value={folder.id} className="rounded-lg border bg-card">
                              <AccordionTrigger className="px-4 hover:no-underline">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                                  <span className="font-semibold truncate">{folder.name}</span>
                                  {folder.email && <span className="hidden sm:inline text-xs text-muted-foreground truncate">{folder.email}</span>}
                                  {folder.phone && <span className="hidden md:inline text-xs text-muted-foreground shrink-0">{folder.phone}</span>}
                                  <Badge variant="secondary" className="ml-auto mr-2 text-xs shrink-0">
                                    {(() => {
                                      const parents = folder.sites.filter((s) => !s.parent_id || !folder.sites.some((p) => p.id === s.parent_id));
                                      const childCount = folder.sites.length - parents.length;
                                      return `${parents.length} site${parents.length !== 1 ? "s" : ""}${childCount > 0 ? ` · ${childCount} building${childCount !== 1 ? "s" : ""}` : ""}`;
                                    })()}
                                  </Badge>
                                  {userRole === "admin" && (
                                    <Button variant="outline" size="sm" className="mr-2 h-7 text-xs shrink-0" onClick={(e) => { e.stopPropagation(); openAssignSite(folder); }}>
                                      <LinkIcon className="mr-1 h-3 w-3" /> Assign Site
                                    </Button>
                                  )}
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="px-0 pb-0">
                                {folder.sites.length === 0 ? (
                                  <div className={`px-4 py-6 text-center rounded-b-lg border-t border-dashed transition-colors ${dragOverFolderId === folder.id ? "bg-primary/5 border-primary/40 text-primary" : "border-muted-foreground/30 text-muted-foreground"}`}>
                                    <p className="text-sm">Drop a site here to link it</p>
                                  </div>
                                ) : (() => {
                                  const folderSelected = selectedFolderSites.get(folder.id) || new Set<string>();
                                  const parentSites = folder.sites.filter((s) => !s.parent_id || !folder.sites.some((p) => p.id === s.parent_id));
                                  const parentSiteIds = parentSites.map((s) => s.id);
                                  const allParentsSelected = parentSiteIds.length > 0 && parentSiteIds.every((id) => folderSelected.has(id));
                                  const someParentsSelected = parentSiteIds.some((id) => folderSelected.has(id));
                                  const childrenBySite = new Map<string, Site[]>();
                                  for (const s of folder.sites) {
                                    if (s.parent_id && folder.sites.some((p) => p.id === s.parent_id)) {
                                      if (!childrenBySite.has(s.parent_id)) childrenBySite.set(s.parent_id, []);
                                      childrenBySite.get(s.parent_id)!.push(s);
                                    }
                                  }
                   const getBreadcrumb = (s: Site): { name: string; id: string }[] => {
                                       const parts: { name: string; id: string }[] = [{ name: s.name, id: s.id }];
                                       let current = s;
                                       while (current.parent_id) {
                                         const parent = sites.find((p) => p.id === current.parent_id);
                                         if (!parent) break;
                                         parts.unshift({ name: parent.name, id: parent.id });
                                         current = parent;
                                       }
                                       return parts;
                                     };
                                   const renderSiteRow = (site: Site, isChild = false) => {
                                     const config = TYPE_CONFIG[site.site_type];
                                     const Icon = config?.icon || MapPin;
                                     const jobCount = folder.jobCountsBySite?.[site.id] ?? 0;
                                     const addressLine = [site.address, site.postcode].filter(Boolean).join(", ");
                                     const riser = (site as any).riser_location;
                                     const children = childrenBySite.get(site.id) || [];
                                     const hasChildren = children.length > 0;
                                     const isCollapsed = collapsedSites.has(site.id);
                                     const isSelected = !isChild && folderSelected.has(site.id);
                                     const breadcrumb = getBreadcrumb(site);
                                     const showBreadcrumb = breadcrumb.length > 1;
                                     return (
                                       <div key={site.id} className={`flex items-center gap-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors group ${isChild ? "pl-10 pr-4 bg-muted/20 border-l-2 border-border/40" : "px-4"} ${isSelected ? "bg-primary/5" : ""}`} onClick={() => openEdit(site)} title="Click to edit">
                                         {userRole === "admin" && !isChild && (
                                           <input
                                             type="checkbox"
                                             checked={isSelected}
                                             className="h-4 w-4 shrink-0 rounded border-input accent-primary cursor-pointer"
                                             onClick={(e) => e.stopPropagation()}
                                             onChange={() => toggleFolderSiteSelect(folder.id, site.id)}
                                           />
                                         )}
                                         {isChild
                                           ? <div className="w-3 h-px bg-border/60 shrink-0 -ml-1" />
                                           : hasChildren
                                             ? <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground transition-colors" onClick={(e) => { e.stopPropagation(); toggleSiteCollapse(site.id); }} title={isCollapsed ? "Show systems" : "Hide systems"}>
                                                 {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                               </button>
                                             : <div className="w-4 shrink-0" />
                                         }
                                         <Icon className={`h-4 w-4 shrink-0 ${config?.color || ""}`} />
                                         <div className="flex-1 min-w-0">
                                           <div className="flex items-center gap-2 flex-wrap">
                                             <span className={`font-medium text-sm ${isChild ? "text-muted-foreground" : ""}`}>{site.name}</span>
                                             {isChild && <Badge variant="outline" className="text-[10px] px-1 py-0 capitalize">{site.site_type}</Badge>}
                                             {hasChildren && !isChild && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{children.length} building{children.length !== 1 ? "s" : ""}</Badge>}
                                             {jobCount > 0 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{jobCount} job{jobCount !== 1 ? "s" : ""}</Badge>}
                                             {site.outlets_count != null && <span className="text-xs text-muted-foreground">{site.outlets_count} outlets</span>}
                                             {riser && <span className="text-xs text-muted-foreground truncate max-w-[180px]">· Riser: {riser}</span>}
                                           </div>
                                           {showBreadcrumb && (
                                             <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5 flex items-center gap-0.5">
                                               {breadcrumb.slice(0, -1).map((crumb, i) => (
                                                 <span key={crumb.id} className="flex items-center gap-0.5">
                                                   {i > 0 && <ChevronRight className="h-2.5 w-2.5 shrink-0" />}
                                                   <button
                                                     type="button"
                                                     className="hover:text-primary hover:underline transition-colors cursor-pointer"
                                                     onClick={(e) => { e.stopPropagation(); navigateToSite(crumb.id); }}
                                                     title={`Go to ${crumb.name}`}
                                                   >
                                                     {crumb.name}
                                                   </button>
                                                 </span>
                                               ))}
                                               <ChevronRight className="h-2.5 w-2.5 shrink-0" />
                                             </p>
                                           )}
                                           {(addressLine || site.contact_name) && (
                                             <p className="text-xs text-muted-foreground truncate mt-0.5">{[addressLine, site.contact_name].filter(Boolean).join(" · ")}</p>
                                           )}
                                         </div>
                                         <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                           {userRole === "admin" && (
                                             <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:text-primary" title="Create job" onClick={(e) => { e.stopPropagation(); openCreateJob(site, folder.id); }}>
                                               <Briefcase className="h-3.5 w-3.5" />
                                             </Button>
                                           )}
                                           <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(site); }} title="Edit site">
                                             <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                           </Button>
                                         {userRole === "admin" && !isChild && (
                                             <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Remove from customer"
                                               onClick={(e) => { e.stopPropagation(); handleBulkUnlinkSites(folder, [site.id]); }}
                                             >
                                               <X className="h-3.5 w-3.5" />
                                             </Button>
                                           )}
                                           {userRole === "admin" && isChild && (
                                             <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete building"
                                               onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(site.id); }}
                                             >
                                               <Trash2 className="h-3.5 w-3.5" />
                                             </Button>
                                           )}
                                         </div>
                                      </div>
                                    );
                                  };
                                  return (
                                    <div className="divide-y divide-border/50">
                                      {userRole === "admin" && (
                                        <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 border-b border-border/50">
                                          <input
                                            type="checkbox"
                                            checked={allParentsSelected}
                                            ref={(el) => { if (el) el.indeterminate = !allParentsSelected && someParentsSelected; }}
                                            className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                                            onChange={() => toggleSelectAllFolderSites(folder.id, parentSiteIds)}
                                          />
                                          {folderSelected.size > 0 ? (
                                            <Button variant="destructive" size="sm" className="h-6 text-xs px-2"
                                              onClick={() => handleBulkUnlinkSites(folder, [...folderSelected])}
                                            >
                                              <Trash2 className="h-3 w-3 mr-1" />
                                              Remove {folderSelected.size} selected
                                            </Button>
                                          ) : (
                                            <span className="text-xs text-muted-foreground">Select to bulk remove</span>
                                          )}
                                        </div>
                                      )}
                                      {parentSites.map((site) => {
                                        const children = childrenBySite.get(site.id) || [];
                                        const isCollapsed = collapsedSites.has(site.id);
                                        return (
                                          <div key={site.id}>
                                            {renderSiteRow(site, false)}
                                            {!isCollapsed && children.map((child) => renderSiteRow(child, true))}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })()}
                              </AccordionContent>
                            </AccordionItem>
                          </DroppableCustomerFolder>
                        ))}
                    </Accordion>
                  )}
                </div>

                {/* Draggable site chips panel */}
                {(() => {
                  const linkedSiteIds = new Set(customerFolders.flatMap((f) => f.sites.map((s) => s.id)));
                  const unlinkedSites = sites
                    .filter((s) => !s.parent_id)
                    .filter((s) => !linkedSiteIds.has(s.id))
                    .filter((s) => !search.trim() || s.name.toLowerCase().includes(search.toLowerCase()));
                  return (
                    <div className="w-56 shrink-0 space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex-1">Drag to link</p>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{unlinkedSites.length} unlinked</Badge>
                      </div>
                      <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
                        {unlinkedSites.length === 0 ? (
                          <p className="text-xs text-muted-foreground px-1">All sites are linked.</p>
                        ) : (
                          unlinkedSites.map((site) => (
                            <DraggableSiteChip key={site.id} site={site} typeConfig={TYPE_CONFIG} />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <DragOverlay>
                {activeDragSite && (() => {
                  const cfg = TYPE_CONFIG[activeDragSite.site_type];
                  const Icon = cfg?.icon || MapPin;
                  return (
                    <div className="flex items-center gap-2 rounded-md border bg-card shadow-lg px-3 py-2 opacity-90 w-48">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg?.color || ""}`} />
                      <span className="text-sm font-medium truncate">{activeDragSite.name}</span>
                    </div>
                  );
                })()}
              </DragOverlay>
            </DndContext>
          )}
        </TabsContent>
      </Tabs>

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
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. North West Region" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Type</label>
                <Select value={form.site_type} onValueChange={(v) => setForm((f) => ({ ...f, site_type: v }))} disabled={!!editing}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Postcode</label>
                <Input value={form.postcode} onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Contact Name</label>
                <Input value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Phone</label>
                <Input value={form.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email</label>
                <Input value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Number of Outlets</label>
                <Input type="number" min={0} value={(form as any).outlets_count} onChange={(e) => setForm((f) => ({ ...f, outlets_count: e.target.value }))} placeholder="e.g. 12" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Riser Location</label>
                <Input value={(form as any).riser_location} onChange={(e) => setForm((f) => ({ ...f, riser_location: e.target.value }))} placeholder="e.g. Floor 2, east stairwell" />
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

      {/* Assign Site Dialog */}
      <Dialog open={assignSiteOpen} onOpenChange={(o) => { if (!o) setAssignSiteOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Sites to {assignCustomer?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">Select sites to link to this customer. Already-linked sites are hidden.</p>
            <div className="max-h-72 overflow-y-auto space-y-1 rounded-md border p-2">
              {sites.filter((s) => !assignCustomer?.sites.some((cs) => cs.id === s.id)).map((s) => {
                const config = TYPE_CONFIG[s.site_type];
                const Icon = config?.icon || MapPin;
                const checked = assignSelectedSites.has(s.id);
                return (
                  <label key={s.id} className="flex items-center gap-3 rounded-md px-2 py-2 cursor-pointer hover:bg-muted/50 transition-colors">
                    <input type="checkbox" checked={checked} onChange={() => { setAssignSelectedSites((prev) => { const next = new Set(prev); checked ? next.delete(s.id) : next.add(s.id); return next; }); }} className="h-4 w-4 accent-primary" />
                    <Icon className={`h-4 w-4 shrink-0 ${config?.color || ""}`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate">{s.name}</span>
                      {s.postcode && <span className="ml-2 text-xs text-muted-foreground">{s.postcode}</span>}
                    </div>
                    <Badge variant="secondary" className="text-[10px] capitalize shrink-0">{s.site_type}</Badge>
                  </label>
                );
              })}
              {sites.filter((s) => !assignCustomer?.sites.some((cs) => cs.id === s.id)).length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">All sites already linked.</p>
              )}
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-sm text-muted-foreground">{assignSelectedSites.size} selected</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setAssignSiteOpen(false)}>Cancel</Button>
                <Button onClick={handleAssignSites} disabled={assignSelectedSites.size === 0 || assignSaving}>
                  {assignSaving ? "Saving…" : <><LinkIcon className="mr-2 h-4 w-4" />Assign</>}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <BulkImportSitesDialog open={bulkOpen} onOpenChange={setBulkOpen} onImported={fetchSites} />

      {/* Cascade delete confirmation dialog */}
      {confirmDeleteId && (() => {
        const site = sites.find((s) => s.id === confirmDeleteId);
        const descendantIds = getAllDescendantIds(confirmDeleteId);
        return (
          <Dialog open onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Delete "{site?.name}"?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                This will also permanently delete <span className="font-semibold text-foreground">{descendantIds.length} child record{descendantIds.length !== 1 ? "s" : ""}</span> (zones / sub-sites). This action can be undone within 8 seconds.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                <Button variant="destructive" onClick={() => { setConfirmDeleteId(null); executeSiteDelete(confirmDeleteId, descendantIds); }}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete all
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Create Job from Site dialog */}
      <Dialog open={createJobDialogOpen} onOpenChange={(o) => { if (!o) setCreateJobDialogOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Job for {createJobSite?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Job Name *</label>
              <Input
                placeholder="e.g. Annual Inspection"
                value={createJobForm.name}
                onChange={(e) => setCreateJobForm((f) => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateJob(); }}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Customer</label>
              <Select value={createJobCustomerId} onValueChange={(val) => setCreateJobCustomerId(val === "none" ? "" : val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No customer</SelectItem>
                  {allCustomers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Priority</label>
                <Select value={createJobForm.priority} onValueChange={(v) => setCreateJobForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Category</label>
                <Select value={createJobForm.category} onValueChange={(v) => setCreateJobForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="inspection">Inspection</SelectItem>
                    <SelectItem value="installation">Installation</SelectItem>
                    <SelectItem value="repair">Repair</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateJobDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateJob} disabled={createJobSaving || !createJobForm.name.trim()}>
              {createJobSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Briefcase className="mr-2 h-4 w-4" />}
              Create Job
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
