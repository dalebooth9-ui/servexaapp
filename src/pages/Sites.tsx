import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BulkImportSitesDialog from "@/components/BulkImportSitesDialog";
import FolderSiteImportDialog from "@/components/FolderSiteImportDialog";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useUndoAction } from "@/hooks/useUndoAction";
import { useWhat3Words } from "@/hooks/useWhat3Words";
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
  type AutoScrollOptions,
} from "@dnd-kit/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Globe, Building, Layers, MapPin, Plus, ChevronRight, ChevronDown,
  Search, Pencil, FileSpreadsheet, Trash2, FolderOpen, Users, LinkIcon, GripVertical, X, Briefcase, Loader2, ArrowUpDown, PanelRightOpen, PanelRightClose, ArrowRightLeft, MoreHorizontal,
} from "lucide-react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import SiteDocumentDropZone from "@/components/SiteDocumentDropZone";
import SiteFireLog from "@/components/SiteFireLog";
import { Flame } from "lucide-react";
import { useJobCategories } from "@/hooks/useJobCategories";
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
  category: "",
  quantity: "" as string,
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

function DraggableSiteChip({ site, typeConfig, onAssign, onDelete }: { site: Site; typeConfig: typeof TYPE_CONFIG; onAssign?: (site: Site) => void; onDelete?: (site: Site) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: site.id, data: { site } });
  const cfg = typeConfig[site.site_type];
  const Icon = cfg?.icon || MapPin;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={`flex items-center gap-1.5 rounded-md border bg-card px-2 py-1.5 transition-all select-none group ${isDragging ? "opacity-30 scale-95" : "hover:border-primary/40 hover:shadow-sm"}`}>
          <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className="flex items-center gap-2 flex-1 min-w-0 cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
            <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg?.color || ""}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{site.name}</p>
              {(site.address || site.postcode) && (
                <p className="text-[11px] text-muted-foreground truncate">{[site.address, site.postcode].filter(Boolean).join(", ")}</p>
              )}
            </div>
          </div>
          {onAssign && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => { e.stopPropagation(); onAssign(site); }}
              title="Assign to customer"
            >
              <LinkIcon className="h-3 w-3" />
            </Button>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        {onAssign && (
          <ContextMenuItem onClick={() => onAssign(site)}>
            <LinkIcon className="mr-2 h-3.5 w-3.5" /> Assign to customer
          </ContextMenuItem>
        )}
        {onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onDelete(site)} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete site
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function DroppableCustomerFolder({ folder, children, isOver, isDragging }: { folder: CustomerFolder; children: React.ReactNode; isOver: boolean; isDragging?: boolean }) {
  const { setNodeRef: setDropRef } = useDroppable({ id: `folder-${folder.id}`, data: { customerId: folder.id } });
  return (
    <div ref={setDropRef} className={`transition-all duration-200 rounded-lg ${isDragging ? "opacity-40" : ""} ${isOver ? "ring-2 ring-primary bg-primary/5 scale-[1.01]" : ""}`}>
      {children}
    </div>
  );
}

function DroppableUnlinkedZone({ children, isOver, isDragging }: { children: React.ReactNode; isOver: boolean; isDragging: boolean }) {
  const { setNodeRef } = useDroppable({ id: "unlinked-drop-zone" });
  return (
    <div ref={setNodeRef} className={`transition-all duration-200 ${isDragging ? (isOver ? "ring-2 ring-primary bg-primary/5 rounded-lg scale-[1.01]" : "") : ""}`}>
      {children}
    </div>
  );
}

function DraggableFolderHandle({ folderId, folderName }: { folderId: string; folderName: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drag-customer-${folderId}`,
    data: { isCustomerFolder: true, customerId: folderId, customerName: folderName },
  });
  return (
    <span
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`cursor-grab text-muted-foreground hover:text-foreground touch-none shrink-0 ${isDragging ? "opacity-40" : ""}`}
      onClick={(e) => e.stopPropagation()}
      title="Drag to merge into another customer"
    >
      <GripVertical className="h-3.5 w-3.5" />
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────────

export default function Sites() {
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const { deleteWithUndo, editWithUndo } = useUndoAction();
  const { categories: jobCategories } = useJobCategories();
  const { convert: convertW3W } = useWhat3Words();
  const navigate = useNavigate();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);

  const [editing, setEditing] = useState<Site | null>(null);
  const [form, setForm] = useState(emptySite);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [folderImportOpen, setFolderImportOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customerFolders, setCustomerFolders] = useState<CustomerFolder[]>([]);
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [assignSiteOpen, setAssignSiteOpen] = useState(false);
  const [assignCustomer, setAssignCustomer] = useState<CustomerFolder | null>(null);
  const [assignSelectedSites, setAssignSelectedSites] = useState<Set<string>>(new Set());
  const [assignSaving, setAssignSaving] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverUnlinked, setDragOverUnlinked] = useState(false);
  const [activeDragSite, setActiveDragSite] = useState<Site | null>(null);
  const [activeDragCustomer, setActiveDragCustomer] = useState<{ id: string; name: string } | null>(null);
  const [collapsedSites, setCollapsedSites] = useState<Set<string>>(new Set());
  const [selectedFolderSites, setSelectedFolderSites] = useState<Map<string, Set<string>>>(new Map());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [highlightedSiteId, setHighlightedSiteId] = useState<string | null>(null);
  const [focusedFolderIndex, setFocusedFolderIndex] = useState<number>(-1);
  const [focusedUnlinkedIndex, setFocusedUnlinkedIndex] = useState<number>(-1);
  const [activeTab, setActiveTab] = useState("by-customer");
  const [editingW3W, setEditingW3W] = useState<string | null>(null);
  const [unlinkedExpanded, setUnlinkedExpanded] = useState(false);
  const [unlinkedSearch, setUnlinkedSearch] = useState("");
  const [folderSort, setFolderSort] = useState<"name" | "sites-asc" | "sites-desc">("name");
  const [quickAssignSite, setQuickAssignSite] = useState<Site | null>(null);
  const [quickAssignCustomerId, setQuickAssignCustomerId] = useState("");
  const [quickAssignSaving, setQuickAssignSaving] = useState(false);
  const [deletingUnlinked, setDeletingUnlinked] = useState(false);
  const [deleteCustomerId, setDeleteCustomerId] = useState<string | null>(null);
  const [deleteCustomerLoading, setDeleteCustomerLoading] = useState(false);
  const customerFoldersScrollRef = useRef<HTMLDivElement | null>(null);
  const unlinkedSitesScrollRef = useRef<HTMLDivElement | null>(null);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  const [exitingFolderIds, setExitingFolderIds] = useState<Set<string>>(new Set());

  // Move sites to another customer
  const [moveSitesOpen, setMoveSitesOpen] = useState(false);
  const [moveSitesSource, setMoveSitesSource] = useState<CustomerFolder | null>(null);
  const [moveSiteIds, setMoveSiteIds] = useState<string[]>([]);
  const [moveTargetCustomerId, setMoveTargetCustomerId] = useState("");
  const [moveSaving, setMoveSaving] = useState(false);

  // Create job from site
  const [createJobDialogOpen, setCreateJobDialogOpen] = useState(false);
  const [createJobSite, setCreateJobSite] = useState<Site | null>(null);
  const [createJobSelectedSiteId, setCreateJobSelectedSiteId] = useState<string>("");
  const [createJobSelectedSiteIds, setCreateJobSelectedSiteIds] = useState<Set<string>>(new Set());
  const [createJobCustomerId, setCreateJobCustomerId] = useState<string>("");
  const [createJobForm, setCreateJobForm] = useState({ name: "", reference_number: "", priority: "medium", category: "general", pressure_test_qty: 0, visual_qty: 0, other_qty: 0, other_service_type: "", due_date: "" });
  const [createJobSaving, setCreateJobSaving] = useState(false);
  const [allCustomers, setAllCustomers] = useState<{ id: string; name: string }[]>([]);

  // Fire log dialog
  const [fireLogSite, setFireLogSite] = useState<Site | null>(null);

  // Get a site and all its descendants (recursively)
  const getSiteAndDescendants = (rootId: string): Site[] => {
    const result: Site[] = [];
    const queue = [rootId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const site = sites.find((s) => s.id === id);
      if (site) {
        result.push(site);
        sites.filter((s) => s.parent_id === id).forEach((s) => queue.push(s.id));
      }
    }
    return result;
  };

  const openCreateJob = (site: Site, customerId?: string) => {
    setCreateJobSite(site);
    setCreateJobSelectedSiteId(site.id);
    // Pre-select parent + all descendants
    const getAllIds = (siteId: string): string[] => {
      const ids = [siteId];
      sites.filter((s) => s.parent_id === siteId).forEach((c) => ids.push(...getAllIds(c.id)));
      return ids;
    };
    setCreateJobSelectedSiteIds(new Set(getAllIds(site.id)));
    // Auto-detect customer from folder if not explicitly provided
    const resolvedCustomerId = customerId
      || customerFolders.find((f) => f.sites.some((s) => s.id === site.id))?.id
      || "";
    setCreateJobCustomerId(resolvedCustomerId);
    const getAllDescIds = (id: string): string[] => {
      const children = sites.filter((x) => x.parent_id === id);
      return [...children.map((c) => c.id), ...children.flatMap((c) => getAllDescIds(c.id))];
    };
    const buildingCount = sites.filter((s) => getAllDescIds(site.id).includes(s.id) && s.site_type === "building").length || 1;
    const defaultCategory = jobCategories[0]?.slug || "general";
    const slug = defaultCategory.toLowerCase();
    const isPT = slug.includes("pressure") || slug.includes("wet") || slug.includes("sprinkler") || slug.includes("hydrant");
    const isVis = slug.includes("visual") || slug.includes("inspect");
    setCreateJobForm({
      name: site.name,
      reference_number: "",
      priority: "medium",
      category: defaultCategory,
      pressure_test_qty: isPT || (!isPT && !isVis) ? buildingCount : 0,
      visual_qty: isVis || (!isPT && !isVis) ? buildingCount : 0,
      other_qty: 0,
      other_service_type: "",
      due_date: "",
    });
    setCreateJobDialogOpen(true);
  };

  const handleCreateJob = async (statusOverride?: string) => {
    if (!createJobForm.name.trim() || !createJobSite) return;
    const selectedSite = sites.find((s) => s.id === createJobSelectedSiteId) || createJobSite;
    const selectedCustomer = allCustomers.find((c) => c.id === createJobCustomerId);
    setCreateJobSaving(true);
    const { data, error } = await supabase.from("jobs").insert({
      name: createJobForm.name.trim(),
      ...(createJobForm.reference_number.trim() ? { reference_number: createJobForm.reference_number.trim() } : {}),
      priority: createJobForm.priority,
      category: createJobForm.category,
      site_id: selectedSite.id,
      address: selectedSite.address || null,
      customer_id: createJobCustomerId || null,
      customer: selectedCustomer?.name || null,
      pressure_test_qty: createJobForm.pressure_test_qty,
      visual_qty: createJobForm.visual_qty,
      other_qty: createJobForm.other_qty,
      other_service_type: createJobForm.other_service_type || null,
      due_date: createJobForm.due_date || null,
      status: statusOverride || "active",
      created_by: user?.id,
    } as any).select("id, reference_number").single();
    if (error) {
      setCreateJobSaving(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    // Auto-create job sheet drafts (same logic as Jobs page)
    if (data) {
      const categoriesToFetch = new Set<string>();
      categoriesToFetch.add(createJobForm.category);
      if (createJobForm.pressure_test_qty > 0) categoriesToFetch.add("pressure_test");
      if (createJobForm.visual_qty > 0) categoriesToFetch.add("visual");
      const { data: matchingTemplates } = await supabase
        .from("job_sheet_templates")
        .select("id, name, fields")
        .in("category", Array.from(categoriesToFetch));
      if (matchingTemplates && matchingTemplates.length > 0) {
        const customerName = selectedCustomer?.name || "";
        const address = selectedSite.address || "";
        for (const tpl of matchingTemplates) {
          const tplName = (tpl.name || "").toLowerCase();
          let copies = 1;
          if (tplName.includes("pressure") && createJobForm.pressure_test_qty > 0) copies = createJobForm.pressure_test_qty;
          else if (tplName.includes("visual") && createJobForm.visual_qty > 0) copies = createJobForm.visual_qty;
          else if (tplName.includes("pressure") && createJobForm.pressure_test_qty === 0) continue;
          else if (tplName.includes("visual") && createJobForm.visual_qty === 0) continue;
          const fields = (typeof tpl.fields === "string" ? JSON.parse(tpl.fields) : tpl.fields) as any[];
          for (let i = 0; i < copies; i++) {
            const prefilled: Record<string, any> = {};
            fields.forEach((f: any) => {
              const label = (f.label || "").toLowerCase();
              if (label.includes("riser") && label.includes("location")) prefilled[f.id] = copies > 1 ? `Riser ${i + 1}` : "";
              else if (label.includes("customer") && (label.includes("detail") || label.includes("name") || label.includes("site"))) prefilled[f.id] = customerName;
              else if ((label.includes("site") && label.includes("detail")) || label === "site address" || label === "address") prefilled[f.id] = address;
              else if (label.includes("po number") || label.includes("reference")) prefilled[f.id] = data.reference_number || "";
              else if (label === "date" || label === "inspection date") prefilled[f.id] = new Date().toISOString().split("T")[0];
            });
            await supabase.from("job_sheet_responses").insert({ job_id: data.id, template_id: tpl.id, submitted_by: user!.id, status: "draft", responses: prefilled } as any);
          }
        }
      }
    }
    setCreateJobSaving(false);
    toast({ title: statusOverride === "scheduled" ? "Job created & submitted to planner" : "Job created", description: `${createJobForm.name} linked to ${selectedSite.name}.` });
    setCreateJobDialogOpen(false);
    navigate(`/jobs/${data!.id}`);
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
      const removedIds = new Set<string>();
      const stack = [...siteIds];
      while (stack.length > 0) {
        const currentId = stack.pop()!;
        if (removedIds.has(currentId)) continue;
        removedIds.add(currentId);
        sites.filter((site) => site.parent_id === currentId).forEach((site) => stack.push(site.id));
      }

      // Animate out, then remove from state + DB
      setExitingIds((prev) => new Set([...prev, ...removedIds]));
      toast({ title: "Sites removed", description: `${siteIds.length} site(s) unlinked from ${folder.name}.` });
      setTimeout(async () => {
        setExitingIds((prev) => { const next = new Set(prev); removedIds.forEach((id) => next.delete(id)); return next; });
        setCustomerFolders((prev) => prev.map((ef) => {
          if (ef.id !== folder.id) return ef;
          return { ...ef, sites: ef.sites.filter((s) => !removedIds.has(s.id)), jobCountsBySite: ef.jobCountsBySite ? Object.fromEntries(Object.entries(ef.jobCountsBySite).filter(([sid]) => !removedIds.has(sid))) : ef.jobCountsBySite };
        }));
        setSelectedFolderSites((prev) => { const next = new Map(prev); next.delete(folder.id); return next; });
        for (const siteId of siteIds) { await supabase.from("customer_sites" as any).delete().eq("customer_id", folder.id).eq("site_id", siteId); }
        fetchCustomerFolders({ ensureOpenFolderIds: [folder.id], preserveCustomerScroll: true, preserveUnlinkedScroll: true, background: true });
      }, 260);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const openMoveSites = (folder: CustomerFolder, siteIds: string[]) => {
    setMoveSitesSource(folder);
    setMoveSiteIds(siteIds);
    setMoveTargetCustomerId("");
    setMoveSitesOpen(true);
  };

  const handleMoveSites = async () => {
    if (!moveSitesSource || moveSiteIds.length === 0 || !moveTargetCustomerId) return;
    if (moveTargetCustomerId === moveSitesSource.id) {
      toast({ title: "Same customer", description: "Sites are already in this folder.", variant: "destructive" });
      return;
    }
    setMoveSaving(true);
    try {
      const sourceId = moveSitesSource.id;
      const sourceName = moveSitesSource.name;
      const targetName = allCustomers.find((c) => c.id === moveTargetCustomerId)?.name || "";
      // Unlink from source, link to target
      for (const siteId of moveSiteIds) {
        await supabase.from("customer_sites" as any).delete().eq("customer_id", sourceId).eq("site_id", siteId);
        const { error } = await supabase.from("customer_sites" as any).insert({ customer_id: moveTargetCustomerId, site_id: siteId });
        if (error && !error.message.includes("duplicate")) throw error;
      }
      const siteNames = moveSiteIds.map((id) => moveSitesSource.sites.find((s) => s.id === id)?.name || id);
      editWithUndo({
        label: `Moved ${moveSiteIds.length} site${moveSiteIds.length !== 1 ? "s" : ""} to ${targetName}`,
        onUndo: async () => {
          for (const siteId of moveSiteIds) {
            await supabase.from("customer_sites" as any).delete().eq("customer_id", moveTargetCustomerId).eq("site_id", siteId);
            await supabase.from("customer_sites" as any).insert({ customer_id: sourceId, site_id: siteId });
          }
          fetchCustomerFolders({ ensureOpenFolderIds: [sourceId], background: true, preserveCustomerScroll: true, preserveUnlinkedScroll: true });
        },
      });
      setMoveSitesOpen(false);
      setSelectedFolderSites((prev) => { const next = new Map(prev); next.delete(sourceId); return next; });
      fetchCustomerFolders({ ensureOpenFolderIds: [sourceId, moveTargetCustomerId], background: true, preserveCustomerScroll: true, preserveUnlinkedScroll: true });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setMoveSaving(false);
    }
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const autoScrollOptions: AutoScrollOptions = {
    threshold: { x: 0, y: 0.15 },
    acceleration: 15,
    interval: 5,
  };

  const handleDragStart = (event: DragStartEvent) => {
    const site = event.active.data.current?.site as Site;
    if (site) setActiveDragSite(site);
    const isCustomerFolder = event.active.data.current?.isCustomerFolder;
    if (isCustomerFolder) {
      setActiveDragCustomer({ id: event.active.data.current?.customerId, name: event.active.data.current?.customerName });
    }
  };

  const handleDragOver = (event: any) => {
    const over = event.over;
    if (over && String(over.id).startsWith("folder-")) {
      setDragOverFolderId(String(over.id).replace("folder-", ""));
      setDragOverUnlinked(false);
    } else if (over && String(over.id) === "unlinked-drop-zone") {
      setDragOverFolderId(null);
      setDragOverUnlinked(true);
    } else {
      setDragOverFolderId(null);
      setDragOverUnlinked(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragSite(null);
    setActiveDragCustomer(null);
    setDragOverFolderId(null);
    setDragOverUnlinked(false);
    const { active, over } = event;
    if (!over) return;

    // Handle drop onto unlinked zone — unlink site from its customer
    if (String(over.id) === "unlinked-drop-zone") {
      const site = active.data.current?.site as Site;
      if (!site) return;
      // Find which customer folder this site belongs to
      const sourceFolder = customerFolders.find((f) => f.sites.some((s) => s.id === site.id));
      if (!sourceFolder) {
        toast({ title: "Already unlinked", description: `${site.name} is not linked to any customer.` });
        return;
      }
      try {
        await supabase.from("customer_sites" as any).delete().eq("customer_id", sourceFolder.id).eq("site_id", site.id);
        editWithUndo({
          label: `${site.name} unlinked from ${sourceFolder.name}`,
          onUndo: async () => {
            await supabase.from("customer_sites" as any).insert({ customer_id: sourceFolder.id, site_id: site.id });
            fetchCustomerFolders({ background: true, preserveCustomerScroll: true, preserveUnlinkedScroll: true });
          },
        });
        fetchCustomerFolders({ ensureOpenFolderIds: [sourceFolder.id], background: true, preserveCustomerScroll: true, preserveUnlinkedScroll: true });
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
      return;
    }

    if (!String(over.id).startsWith("folder-")) return;
    const targetCustomerId = String(over.id).replace("folder-", "");

    // Handle customer folder dropped onto another customer folder (merge)
    if (active.data.current?.isCustomerFolder) {
      const sourceId = active.data.current.customerId as string;
      if (sourceId === targetCustomerId) return;
      const sourceFolder = customerFolders.find((f) => f.id === sourceId);
      const targetFolder = customerFolders.find((f) => f.id === targetCustomerId);
      if (!sourceFolder || !targetFolder) return;
      const confirmed = window.confirm(
        `Merge "${sourceFolder.name}" into "${targetFolder.name}"?\n\nThis will:\n• Create "${sourceFolder.name}" as a site under ${targetFolder.name}\n• Move all existing sites across\n• Delete the "${sourceFolder.name}" customer entry`
      );
      if (!confirmed) return;
      try {
        // 1. Create a new site from the customer name
        const { data: newSite, error: siteErr } = await supabase.from("sites").insert({
          name: sourceFolder.name,
          site_type: "site",
          address: sourceFolder.address || null,
        }).select("id").single();
        if (siteErr) throw siteErr;
        // 2. Link the new site to the target customer
        await supabase.from("customer_sites" as any).insert({ customer_id: targetCustomerId, site_id: newSite.id });
        // 3. Move existing linked sites to target customer
        for (const s of sourceFolder.sites) {
          await supabase.from("customer_sites" as any).delete().eq("customer_id", sourceId).eq("site_id", s.id);
          const { error: linkErr } = await supabase.from("customer_sites" as any).insert({ customer_id: targetCustomerId, site_id: s.id });
          if (linkErr && !linkErr.message.includes("duplicate")) throw linkErr;
        }
        // 4. Delete the source customer
        await supabase.from("customers").delete().eq("id", sourceId);
        toast({ title: "Merged", description: `"${sourceFolder.name}" merged into "${targetFolder.name}" as a site.` });
        fetchCustomerFolders({ ensureOpenFolderIds: [targetCustomerId], background: true, preserveCustomerScroll: true, preserveUnlinkedScroll: true });
        fetchSites();
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
      return;
    }

    // Handle site dropped onto customer folder
    const site = active.data.current?.site as Site;
    if (!site) return;
    const folder = customerFolders.find((f) => f.id === targetCustomerId);
    if (!folder) return;
    const allLinkedIds = new Set(folder.sites.map((s) => s.id));
    if (allLinkedIds.has(site.id)) {
      toast({ title: "Already linked", description: `${site.name} is already in ${folder.name}.` });
      return;
    }
    try {
      const { error } = await supabase.from("customer_sites" as any).insert({
        customer_id: targetCustomerId,
        site_id: site.id,
      });
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

  async function fetchAllPages<T>(
    loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
  ): Promise<T[]> {
    const pageSize = 1000;
    const rows: T[] = [];

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await loadPage(from, from + pageSize - 1);
      if (error) throw error;

      const batch = data ?? [];
      rows.push(...batch);

      if (batch.length < pageSize) break;
    }

    return rows;
  }

  const fetchSites = async () => {
    try {
      const allSites = await fetchAllPages<Site>((from, to) =>
        supabase.from("sites").select("*").order("name").order("id").range(from, to)
      );
      setSites(allSites);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load sites.", variant: "destructive" });
      setSites([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllUnlinked = async () => {
    setDeletingUnlinked(true);
    try {
      const linkedSiteIds = new Set(customerFolders.flatMap((f) => f.sites.map((s) => s.id)));
      const unlinked = sites
        .filter((s) => s.site_type !== "region" && !s.parent_id)
        .filter((s) => !linkedSiteIds.has(s.id));
      if (unlinked.length === 0) return;

      // Find which have children or jobs
      const unlinkedIds = unlinked.map((s) => s.id);
      const childParentIds = new Set(sites.filter((s) => s.parent_id && unlinkedIds.includes(s.parent_id)).map((s) => s.parent_id));
      const { data: jobLinks } = await supabase.from("jobs").select("site_id").in("site_id", unlinkedIds);
      const jobSiteIds = new Set((jobLinks || []).map((j: any) => j.site_id));

      const deletable = unlinked.filter((s) => !childParentIds.has(s.id) && !jobSiteIds.has(s.id));
      if (deletable.length === 0) {
        toast({ title: "Nothing to delete", description: "All unlinked sites have children or jobs." });
        return;
      }

      const deleteIds = deletable.map((s) => s.id);
      const { error } = await supabase.from("sites").delete().in("id", deleteIds);
      if (error) throw error;

      toast({ title: "Deleted", description: `${deleteIds.length} unlinked site(s) removed.` });
      fetchSites();
      fetchCustomerFolders();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeletingUnlinked(false);
    }
  };

  const fetchCustomerFolders = async (options?: {
    ensureOpenFolderIds?: string[];
    preserveCustomerScroll?: boolean;
    preserveUnlinkedScroll?: boolean;
    background?: boolean;
  }) => {
    const scrollY = window.scrollY;
    const customerScrollTop = customerFoldersScrollRef.current?.scrollTop ?? 0;
    const unlinkedScrollTop = unlinkedSitesScrollRef.current?.scrollTop ?? 0;
    const shouldShowLoading = !options?.background;

    if (shouldShowLoading) setFoldersLoading(true);

    try {
      const [customers, customerSiteLinks, allSites, jobsBySite] = await Promise.all([
        fetchAllPages<any>((from, to) =>
          supabase.from("customers").select("id, name, email, phone, address").order("name").order("id").range(from, to)
        ),
        fetchAllPages<any>((from, to) =>
          supabase.from("customer_sites" as any).select("customer_id, site_id").order("customer_id").order("site_id").range(from, to)
        ),
        fetchAllPages<Site>((from, to) =>
          supabase.from("sites").select("*").order("name").order("id").range(from, to)
        ),
        fetchAllPages<any>((from, to) =>
          supabase.from("jobs").select("customer_id, site_id").not("customer_id", "is", null).not("site_id", "is", null).order("customer_id").order("site_id").range(from, to)
        ),
      ]);

      const siteMap = new Map<string, Site>(allSites.map((s) => [s.id, s]));
      const customerSiteMap = new Map<string, Set<string>>();
      for (const link of customerSiteLinks || []) {
        if (!link.customer_id || !link.site_id) continue;
        if (!customerSiteMap.has(link.customer_id)) customerSiteMap.set(link.customer_id, new Set());
        customerSiteMap.get(link.customer_id)!.add(link.site_id);
      }
      const jobCountMap = new Map<string, Map<string, number>>();
      for (const job of jobsBySite || []) {
        if (!job.customer_id || !job.site_id) continue;
        if (!jobCountMap.has(job.customer_id)) jobCountMap.set(job.customer_id, new Map());
        const sc = jobCountMap.get(job.customer_id)!;
        sc.set(job.site_id, (sc.get(job.site_id) || 0) + 1);
      }
      const folders: CustomerFolder[] = customers.map((c) => {
        const linkedSiteIds = [...(customerSiteMap.get(c.id) || [])];
        const linkedSites = linkedSiteIds.map((sid) => siteMap.get(sid)).filter(Boolean) as Site[];
        const linkedSiteIdSet = new Set(linkedSiteIds);
        const extraChildren = allSites.filter(
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
      setOpenFolders((prev) => {
        const validFolderIds = new Set(folders.map((f) => f.id));
        const next = prev.length > 0 ? prev.filter((id) => validFolderIds.has(id)) : [];

        for (const folderId of options?.ensureOpenFolderIds || []) {
          if (validFolderIds.has(folderId) && !next.includes(folderId)) next.push(folderId);
        }

        return next;
      });
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
      setCollapsedSites((prev) => {
        const validIds = new Set(folders.flatMap((folder) => folder.sites.map((site) => site.id)));
        const next = new Set([...prev].filter((id) => validIds.has(id)));
        autoCollapsed.forEach((id) => next.add(id));
        return next;
      });
    } catch (error) {
      toast({ title: "Error", description: "Failed to load customer folders.", variant: "destructive" });
      setCustomerFolders([]);
    } finally {
      if (shouldShowLoading) setFoldersLoading(false);
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollY);
        if (options?.preserveCustomerScroll && customerFoldersScrollRef.current) {
          customerFoldersScrollRef.current.scrollTop = customerScrollTop;
        }
        if (options?.preserveUnlinkedScroll && unlinkedSitesScrollRef.current) {
          unlinkedSitesScrollRef.current.scrollTop = unlinkedScrollTop;
        }
      });
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    setDeleteCustomerId(null);
    setExitingFolderIds((prev) => new Set([...prev, customerId]));
    setTimeout(async () => {
      setExitingFolderIds((prev) => { const next = new Set(prev); next.delete(customerId); return next; });
      setCustomerFolders((prev) => prev.filter((f) => f.id !== customerId));
      setOpenFolders((prev) => prev.filter((id) => id !== customerId));
      try {
        await supabase.from("customer_sites").delete().eq("customer_id", customerId);
        await supabase.from("customer_documents").delete().eq("customer_id", customerId);
        const { error } = await supabase.from("customers").delete().eq("id", customerId);
        if (error) throw error;
        toast({ title: "Customer deleted", description: "Customer and all site links removed." });
        fetchCustomerFolders({ background: true, preserveCustomerScroll: true, preserveUnlinkedScroll: true });
      } catch (error: any) {
        toast({ title: "Error", description: error.message || "Failed to delete customer.", variant: "destructive" });
        fetchCustomerFolders();
      }
    }, 290);
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
        customer_id: assignCustomer.id,
        site_id: siteId,
      }));
      const { error } = await supabase.from("customer_sites" as any).insert(inserts);
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
    : sites.filter((s) => s.site_type !== "region" && (!s.parent_id || !sites.some((p) => p.id === s.parent_id && p.site_type !== "region")));

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
      category: (site as any).category || "",
      quantity: site.outlets_count != null ? String(site.outlets_count) : "",
    });
    setEditingW3W(null);
    setDialogOpen(true);
    // Resolve W3W in the background using GPS pin if available, else address
    const address = site.address || site.postcode;
    if (address) {
      supabase.functions.invoke("w3w-convert", { body: { address } })
        .then(({ data }) => { if (data?.words) setEditingW3W(data.words); });
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    const payload = {
      name: form.name.trim(), site_type: form.site_type, parent_id: form.parent_id || null,
      address: form.address || null, postcode: form.postcode || null,
      contact_name: form.contact_name || null, contact_phone: form.contact_phone || null,
      contact_email: form.contact_email || null, notes: form.notes || null,
      outlets_count: (form as any).quantity !== "" ? Number((form as any).quantity) : (form.outlets_count !== "" ? Number(form.outlets_count) : null),
      riser_location: form.riser_location || null,
      category: (form as any).category || null,
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
    // Animate out first, then optimistically remove
    const idSet = new Set(allIds);
    setExitingIds((prev) => new Set([...prev, ...idSet]));
    setTimeout(() => {
      setExitingIds((prev) => { const next = new Set(prev); idSet.forEach((i) => next.delete(i)); return next; });
      setSites((prev) => prev.filter((s) => !idSet.has(s.id)));
      setCustomerFolders((prev) => prev.map((f) => ({ ...f, sites: f.sites.filter((s) => !idSet.has(s.id)) })));
      deleteWithUndo({
        key: id,
        label: descendantIds.length > 0 ? `Site and ${descendantIds.length} child record(s) deleted` : "Site deleted",
        onConfirm: async () => {
          for (const did of [...descendantIds].reverse()) { await supabase.from("sites").delete().eq("id", did); }
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
    }, 260);
  };

  const regionIds = new Set(sites.filter((s) => s.site_type === "region").map((s) => s.id));
  const buildingRecords = sites.filter((s) => s.site_type === "building");
  const distinctBuildingCount = new Set(
    buildingRecords.map((b) => b.parent_id || b.id)
  ).size;
  const unitCount = buildingRecords.length - distinctBuildingCount;

  const siteRecords = sites.filter((s) => s.site_type === "site");
  // Sites under regions are real sites, not sub-sites
  const topLevelSites = siteRecords.filter((s) => !s.parent_id || regionIds.has(s.parent_id));
  const subSites = siteRecords.filter((s) => s.parent_id && !regionIds.has(s.parent_id));

  const counts = {
    region: regionIds.size,
    site: topLevelSites.length,
    building: distinctBuildingCount,
    zone: sites.filter((s) => s.site_type === "zone").length,
  };
  const siteSubCount = subSites.length;

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
      <div key={site.id} id={`site-row-${site.id}`} className={exitingIds.has(site.id) ? "animate-site-exit" : ""}>
        <div
          className={`flex items-center gap-2 py-2 px-3 border-b border-border/50 hover:bg-muted/50 transition-all duration-200 cursor-pointer ${selected.has(site.id) ? "bg-primary/5" : ""} ${isHighlighted ? "ring-2 ring-inset ring-primary/60 bg-primary/5" : ""}`}
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
            <Button variant="outline" onClick={() => setFolderImportOpen(true)}><FolderOpen className="mr-2 h-4 w-4" /> Import from Folders</Button>
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
                  <p className="text-xs text-muted-foreground">{cfg.label}s{key === "building" && unitCount > 0 ? ` (${unitCount} units)` : ""}{key === "site" && siteSubCount > 0 ? ` (${siteSubCount} sub-sites)` : ""}</p>
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
            <div className="flex justify-between items-center mb-2 gap-2">
              <div className="flex items-center gap-2">
                <Select value={folderSort} onValueChange={(v) => setFolderSort(v as any)}>
                  <SelectTrigger className="h-7 text-xs w-auto gap-1.5">
                    <ArrowUpDown className="h-3 w-3" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Sort: A–Z</SelectItem>
                    <SelectItem value="sites-desc">Most sites</SelectItem>
                    <SelectItem value="sites-asc">Fewest sites</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} autoScroll={autoScrollOptions}>
              <div className="flex gap-4 items-start">
                {/* Customer folders */}
                <div
                  ref={customerFoldersScrollRef}
                  className="flex-1 min-w-0 space-y-2 max-h-[75vh] overflow-y-auto pr-1 focus:outline-none"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    const visibleFolders = customerFolders
                      .filter((f) => !search.trim() || f.name.toLowerCase().includes(search.toLowerCase()) || f.sites.some((s) => s.name.toLowerCase().includes(search.toLowerCase())))
                      .sort((a, b) => {
                        if (folderSort === "sites-desc") return b.sites.length - a.sites.length;
                        if (folderSort === "sites-asc") return a.sites.length - b.sites.length;
                        return a.name.localeCompare(b.name);
                      });
                    if (visibleFolders.length === 0) return;
                    if (e.key === "ArrowDown") {
                      if (focusedFolderIndex >= 0) e.preventDefault();
                      setFocusedFolderIndex((prev) => Math.min(prev + 1, visibleFolders.length - 1));
                    } else if (e.key === "ArrowUp") {
                      if (focusedFolderIndex > 0) e.preventDefault();
                      setFocusedFolderIndex((prev) => Math.max(prev - 1, 0));
                    } else if ((e.key === "ArrowRight" || e.key === "Enter") && focusedFolderIndex >= 0) {
                      e.preventDefault();
                      const folderId = visibleFolders[focusedFolderIndex]?.id;
                      if (folderId && !openFolders.includes(folderId)) setOpenFolders((prev) => [...prev, folderId]);
                    } else if (e.key === "ArrowLeft" && focusedFolderIndex >= 0) {
                      e.preventDefault();
                      const folderId = visibleFolders[focusedFolderIndex]?.id;
                      if (folderId && openFolders.includes(folderId)) setOpenFolders((prev) => prev.filter((id) => id !== folderId));
                    } else if (e.key === "Escape") {
                      setFocusedFolderIndex(-1);
                    }
                  }}
                >
                  {customerFolders.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No customers found.</p>
                  ) : (
                    <Accordion type="multiple" value={openFolders} onValueChange={setOpenFolders} className="space-y-2">
                      {customerFolders
                        .filter((f) => !search.trim() || f.name.toLowerCase().includes(search.toLowerCase()) || f.sites.some((s) => s.name.toLowerCase().includes(search.toLowerCase())))
                        .sort((a, b) => {
                          if (folderSort === "sites-desc") return b.sites.length - a.sites.length;
                          if (folderSort === "sites-asc") return a.sites.length - b.sites.length;
                          return a.name.localeCompare(b.name);
                        })
                        .map((folder, idx) => (
                          <DroppableCustomerFolder key={folder.id} folder={folder} isOver={dragOverFolderId === folder.id}>
                            <AccordionItem value={folder.id} className={`rounded-lg border bg-card transition-all duration-200 ${focusedFolderIndex === idx ? "ring-2 ring-primary/50" : ""} ${exitingFolderIds.has(folder.id) ? "animate-folder-exit" : ""}`}>
                              <AccordionTrigger className="px-4 hover:no-underline">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  {userRole === "admin" && <DraggableFolderHandle folderId={folder.id} folderName={folder.name} />}
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
                                    <div className="flex items-center gap-1 mr-2 shrink-0">
                                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); openAssignSite(folder); }}>
                                        <LinkIcon className="mr-1 h-3 w-3" /> Assign Site
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete customer"
                                        onClick={(e) => { e.stopPropagation(); setDeleteCustomerId(folder.id); }}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
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
                                   const SiteContextMenuItems = ({ site, isChild }: { site: Site; isChild: boolean }) => (
                                     <>
                                       <ContextMenuItem onClick={() => openEdit(site)}>
                                         <Pencil className="mr-2 h-3.5 w-3.5" /> Edit site
                                       </ContextMenuItem>
                                       {userRole === "admin" && (
                                         <ContextMenuItem onClick={() => openCreateJob(site, folder.id)}>
                                           <Briefcase className="mr-2 h-3.5 w-3.5" /> Create job
                                         </ContextMenuItem>
                                       )}
                                       {userRole === "admin" && !isChild && (
                                         <>
                                           <ContextMenuSeparator />
                                           <ContextMenuItem onClick={() => openMoveSites(folder, [site.id])}>
                                             <ArrowRightLeft className="mr-2 h-3.5 w-3.5" /> Move to another customer
                                           </ContextMenuItem>
                                           <ContextMenuItem onClick={() => handleBulkUnlinkSites(folder, [site.id])} className="text-destructive focus:text-destructive">
                                             <X className="mr-2 h-3.5 w-3.5" /> Unlink from customer
                                           </ContextMenuItem>
                                         </>
                                       )}
                                       {userRole === "admin" && isChild && (
                                         <>
                                           <ContextMenuSeparator />
                                           <ContextMenuItem onClick={() => setConfirmDeleteId(site.id)} className="text-destructive focus:text-destructive">
                                             <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                                           </ContextMenuItem>
                                         </>
                                       )}
                                     </>
                                   );
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

                                     const rowContent = (
                                       <div className={`flex items-center gap-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-all duration-200 group ${isChild ? "pl-10 pr-4 bg-muted/20 border-l-2 border-border/40" : "px-4"} ${isSelected ? "bg-primary/5" : ""} ${exitingIds.has(site.id) ? "animate-site-exit" : ""}`} onClick={() => { if (!exitingIds.has(site.id)) openEdit(site); }}>
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
                                             {site.outlets_count != null && <span className="text-xs text-muted-foreground">{site.outlets_count} {((site as any).category || "").toLowerCase().includes("sprinkler") ? "heads" : "outlets"}</span>}
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
                                         {/* Compact ⋯ menu — visible on hover */}
                                         <DropdownMenu>
                                           <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                             <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground">
                                               <MoreHorizontal className="h-4 w-4" />
                                             </Button>
                                           </DropdownMenuTrigger>
                                           <DropdownMenuContent align="end" className="w-48">
                                             <DropdownMenuItem onClick={() => openEdit(site)}>
                                               <Pencil className="mr-2 h-3.5 w-3.5" /> Edit site
                                             </DropdownMenuItem>
                                             {userRole === "admin" && (
                                               <DropdownMenuItem onClick={() => openCreateJob(site, folder.id)}>
                                                 <Briefcase className="mr-2 h-3.5 w-3.5" /> Create job
                                               </DropdownMenuItem>
                                             )}
                                             {userRole === "admin" && !isChild && (
                                               <>
                                                 <DropdownMenuSeparator />
                                                 <DropdownMenuItem onClick={() => openMoveSites(folder, [site.id])}>
                                                   <ArrowRightLeft className="mr-2 h-3.5 w-3.5" /> Move to customer
                                                 </DropdownMenuItem>
                                                 <DropdownMenuItem onClick={() => handleBulkUnlinkSites(folder, [site.id])} className="text-destructive focus:text-destructive">
                                                   <X className="mr-2 h-3.5 w-3.5" /> Unlink
                                                 </DropdownMenuItem>
                                               </>
                                             )}
                                             {userRole === "admin" && isChild && (
                                               <>
                                                 <DropdownMenuSeparator />
                                                 <DropdownMenuItem onClick={() => setConfirmDeleteId(site.id)} className="text-destructive focus:text-destructive">
                                                   <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                                                 </DropdownMenuItem>
                                               </>
                                             )}
                                           </DropdownMenuContent>
                                         </DropdownMenu>
                                       </div>
                                     );

                                     return (
                                       <ContextMenu key={site.id}>
                                         <ContextMenuTrigger asChild>
                                           {rowContent}
                                         </ContextMenuTrigger>
                                         <ContextMenuContent className="w-48">
                                           <SiteContextMenuItems site={site} isChild={isChild} />
                                         </ContextMenuContent>
                                       </ContextMenu>
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
                                            <div className="flex items-center gap-1.5">
                                              <Button variant="outline" size="sm" className="h-6 text-xs px-2"
                                                onClick={() => openMoveSites(folder, [...folderSelected])}
                                              >
                                                <ArrowRightLeft className="h-3 w-3 mr-1" />
                                                Move {folderSelected.size}
                                              </Button>
                                              <Button variant="destructive" size="sm" className="h-6 text-xs px-2"
                                                onClick={() => handleBulkUnlinkSites(folder, [...folderSelected])}
                                              >
                                                <Trash2 className="h-3 w-3 mr-1" />
                                                Remove {folderSelected.size}
                                              </Button>
                                            </div>
                                          ) : (
                                            <span className="text-xs text-muted-foreground">Select to move or remove</span>
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
                  const allUnlinked = sites
                    .filter((s) => s.site_type !== "region" && !s.parent_id)
                    .filter((s) => !linkedSiteIds.has(s.id));
                  const filteredUnlinked = allUnlinked
                    .filter((s) => !unlinkedSearch.trim() || s.name.toLowerCase().includes(unlinkedSearch.toLowerCase()) || s.postcode?.toLowerCase().includes(unlinkedSearch.toLowerCase()));
                  return (
                    <DroppableUnlinkedZone isOver={dragOverUnlinked} isDragging={!!(activeDragSite || activeDragCustomer)}>
                    <div className={`shrink-0 space-y-2 transition-all ${unlinkedExpanded ? "w-96" : "w-72"}`}>
                      <div className="flex items-center gap-2 px-1">
                        <button
                          type="button"
                          className="flex items-center gap-1.5 flex-1 text-left"
                          onClick={() => setUnlinkedExpanded((p) => !p)}
                        >
                          {unlinkedExpanded ? <PanelRightClose className="h-3.5 w-3.5 text-muted-foreground" /> : <PanelRightOpen className="h-3.5 w-3.5 text-muted-foreground" />}
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Drag to link</p>
                        </button>
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 cursor-help">
                                  {allUnlinked.length} unlinked
                                </Badge>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs max-h-64 overflow-y-auto">
                              <p className="font-semibold text-xs mb-1">{allUnlinked.length} unlinked sites</p>
                              {allUnlinked.length === 0 ? (
                                <p className="text-xs text-muted-foreground">All sites are linked to customers.</p>
                              ) : (
                                <ul className="space-y-0.5">
                                  {allUnlinked.slice(0, 30).map((s) => (
                                    <li key={s.id} className="text-xs flex items-center gap-1.5">
                                      <MapPin className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                                      <span className="truncate">{s.name}</span>
                                      {s.postcode && <span className="text-muted-foreground shrink-0">{s.postcode}</span>}
                                    </li>
                                  ))}
                                  {allUnlinked.length > 30 && (
                                    <li className="text-xs text-muted-foreground pt-1">…and {allUnlinked.length - 30} more</li>
                                  )}
                                </ul>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        {allUnlinked.length > 0 && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete all unlinked sites?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete all unlinked sites that have no children or jobs. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={handleDeleteAllUnlinked}
                                  disabled={deletingUnlinked}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  {deletingUnlinked ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                  Delete All
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                      {allUnlinked.length > 5 && (
                        <div className="relative px-1">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                          <Input
                            placeholder="Search unlinked…"
                            value={unlinkedSearch}
                            onChange={(e) => setUnlinkedSearch(e.target.value)}
                            className="h-7 text-xs pl-7 pr-2"
                          />
                        </div>
                      )}
                      <div
                        ref={unlinkedSitesScrollRef}
                        className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1 focus:outline-none"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (filteredUnlinked.length === 0) return;
                          if (e.key === "ArrowDown") {
                            if (focusedUnlinkedIndex >= 0) e.preventDefault();
                            setFocusedUnlinkedIndex((prev) => Math.min(prev + 1, filteredUnlinked.length - 1));
                          } else if (e.key === "ArrowUp") {
                            if (focusedUnlinkedIndex > 0) e.preventDefault();
                            setFocusedUnlinkedIndex((prev) => Math.max(prev - 1, 0));
                          } else if ((e.key === "Enter" || e.key === "ArrowRight") && focusedUnlinkedIndex >= 0) {
                            e.preventDefault();
                            const site = filteredUnlinked[focusedUnlinkedIndex];
                            if (site) { setQuickAssignSite(site); setQuickAssignCustomerId(""); }
                          } else if (e.key === "Escape") {
                            setFocusedUnlinkedIndex(-1);
                          }
                        }}
                      >
                        {filteredUnlinked.length === 0 ? (
                          <p className="text-xs text-muted-foreground px-1">{allUnlinked.length === 0 ? "All sites are linked." : "No matches."}</p>
                        ) : (
                          filteredUnlinked.map((site, idx) => (
                            <div key={site.id} className={`rounded-md ${focusedUnlinkedIndex === idx ? "ring-2 ring-primary/50" : ""}`}>
                              <DraggableSiteChip site={site} typeConfig={TYPE_CONFIG} onAssign={(s) => { setQuickAssignSite(s); setQuickAssignCustomerId(""); }} onDelete={async (s) => {
                                const children = sites.filter((c) => c.parent_id === s.id);
                                if (children.length > 0) { toast({ title: "Cannot delete", description: "This site has children. Remove them first.", variant: "destructive" }); return; }
                                const { data: jobs } = await supabase.from("jobs").select("id", { count: "exact", head: true }).eq("site_id", s.id);
                                if ((jobs as any)?.length > 0) { toast({ title: "Cannot delete", description: "This site has associated jobs.", variant: "destructive" }); return; }
                                const { error } = await supabase.from("sites").delete().eq("id", s.id);
                                if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
                                setSites((prev) => prev.filter((x) => x.id !== s.id));
                                toast({ title: "Site deleted" });
                              }} />
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    </DroppableUnlinkedZone>
                  );
                })()}
              </div>

              <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
                {activeDragSite && (() => {
                  const cfg = TYPE_CONFIG[activeDragSite.site_type];
                  const Icon = cfg?.icon || MapPin;
                  return (
                    <div className="flex items-center gap-2 rounded-lg border-2 border-primary/30 bg-card shadow-2xl px-3 py-2.5 w-52 scale-105 rotate-1">
                      <Icon className={`h-4 w-4 shrink-0 ${cfg?.color || ""}`} />
                      <span className="text-sm font-semibold truncate">{activeDragSite.name}</span>
                    </div>
                  );
                })()}
                {activeDragCustomer && (
                  <div className="flex items-center gap-2 rounded-lg border-2 border-primary/30 bg-card shadow-2xl px-3 py-2.5 w-56 scale-105 -rotate-1">
                    <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-semibold truncate">{activeDragCustomer.name}</span>
                  </div>
                )}
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
                <label className="text-sm font-medium">Category / System</label>
                <Select value={(form as any).category || ""} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {jobCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.slug}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Quantity</label>
                <Input type="number" min={0} value={(form as any).quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="e.g. 12" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{((form as any).category || "").toLowerCase().includes("sprinkler") ? "Number of Heads" : "Number of Outlets"}</label>
                <Input type="number" min={0} value={(form as any).outlets_count} onChange={(e) => setForm((f) => ({ ...f, outlets_count: e.target.value }))} placeholder="e.g. 12" />
              </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Riser Location</label>
              <Input value={(form as any).riser_location} onChange={(e) => setForm((f) => ({ ...f, riser_location: e.target.value }))} placeholder="e.g. Floor 2, east stairwell" />
            </div>
          </div>
          {editingW3W && (
            <div className="flex items-center gap-1.5 rounded-md border border-[#e11f26]/30 bg-[#e11f26]/5 px-3 py-1.5 text-sm">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="#e11f26"><path d="M11.994 0C5.367 0 0 5.367 0 11.994 0 18.622 5.367 24 11.994 24 18.622 24 24 18.622 24 11.994 24 5.367 18.622 0 11.994 0zm-2.6 17.4l-1.5-5.1-1.5 5.1H4.7L2.5 9.6h1.8l1.5 5.4 1.5-5.4h1.8l1.5 5.4 1.5-5.4h1.8l-2.2 7.8h-1.7zm7.8 0l-1.5-5.1-1.5 5.1h-1.7l-2.2-7.8h1.8l1.5 5.4 1.5-5.4h1.8l1.5 5.4 1.5-5.4h1.8l-2.2 7.8h-1.7z"/></svg>
              <a
                href={`https://what3words.com/${editingW3W.replace(/^\/\/\//, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:underline"
                style={{ color: "#e11f26" }}
              >
                {editingW3W}
              </a>
              <span className="text-xs text-muted-foreground ml-1">— location reference</span>
            </div>
          )}
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

      {/* Quick assign unlinked site to customer */}
      <Dialog open={!!quickAssignSite} onOpenChange={(o) => { if (!o) setQuickAssignSite(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign "{quickAssignSite?.name}" to Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            {quickAssignSite?.address && <p className="text-sm text-muted-foreground">{quickAssignSite.address}{quickAssignSite.postcode ? `, ${quickAssignSite.postcode}` : ""}</p>}
            <Select value={quickAssignCustomerId} onValueChange={setQuickAssignCustomerId}>
              <SelectTrigger><SelectValue placeholder="Select customer…" /></SelectTrigger>
              <SelectContent>
                {allCustomers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setQuickAssignSite(null)}>Cancel</Button>
              <Button
                disabled={!quickAssignCustomerId || quickAssignSaving}
                onClick={async () => {
                  if (!quickAssignSite || !quickAssignCustomerId) return;
                  setQuickAssignSaving(true);
                  try {
                    const { error } = await supabase.from("customer_sites" as any).insert({ customer_id: quickAssignCustomerId, site_id: quickAssignSite.id });
                    if (error) throw error;
                    const customerName = allCustomers.find((c) => c.id === quickAssignCustomerId)?.name || "";
                    toast({ title: "Site assigned", description: `${quickAssignSite.name} linked to ${customerName}.` });
                    setQuickAssignSite(null);
                    fetchCustomerFolders();
                  } catch (err: any) {
                    toast({ title: "Error", description: err.message, variant: "destructive" });
                  } finally {
                    setQuickAssignSaving(false);
                  }
                }}
              >
                {quickAssignSaving ? "Saving…" : <><LinkIcon className="mr-2 h-4 w-4" />Assign</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move Sites to Customer Dialog */}
      <Dialog open={moveSitesOpen} onOpenChange={(o) => { if (!o) setMoveSitesOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Move {moveSiteIds.length} site{moveSiteIds.length !== 1 ? "s" : ""} to another customer</DialogTitle>
            <DialogDescription>
              {moveSitesSource && <>From <strong>{moveSitesSource.name}</strong></>}
              {moveSiteIds.length <= 3 && (
                <span className="block mt-1 text-xs">
                  {moveSiteIds.map((id) => moveSitesSource?.sites.find((s) => s.id === id)?.name).filter(Boolean).join(", ")}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <Select value={moveTargetCustomerId} onValueChange={setMoveTargetCustomerId}>
              <SelectTrigger><SelectValue placeholder="Select target customer…" /></SelectTrigger>
              <SelectContent>
                {allCustomers.filter((c) => c.id !== moveSitesSource?.id).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMoveSitesOpen(false)}>Cancel</Button>
              <Button disabled={!moveTargetCustomerId || moveSaving} onClick={handleMoveSites}>
                {moveSaving ? "Moving…" : <><ArrowRightLeft className="mr-2 h-4 w-4" />Move</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <BulkImportSitesDialog open={bulkOpen} onOpenChange={setBulkOpen} onImported={fetchSites} />

      <FolderSiteImportDialog
        open={folderImportOpen}
        onOpenChange={setFolderImportOpen}
        onImported={() => { fetchSites(); fetchCustomerFolders(); }}
      />

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

      {/* Delete customer confirmation dialog */}
      {deleteCustomerId && (() => {
        const folder = customerFolders.find((f) => f.id === deleteCustomerId);
        return (
          <Dialog open onOpenChange={(open) => { if (!open) setDeleteCustomerId(null); }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Delete "{folder?.name}"?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                This will permanently delete this customer and unlink <span className="font-semibold text-foreground">{folder?.sites.length ?? 0} site{(folder?.sites.length ?? 0) !== 1 ? "s" : ""}</span>. The sites themselves will not be deleted.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDeleteCustomerId(null)}>Cancel</Button>
                <Button variant="destructive" onClick={() => handleDeleteCustomer(deleteCustomerId)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete Customer
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}


      <Dialog open={createJobDialogOpen} onOpenChange={(o) => { if (!o) setCreateJobDialogOpen(false); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Create Job for {createJobSite?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
            {/* Site / Building selector — single selection, full tree */}
            {createJobSite && (() => {
              const treeItems: { site: Site; depth: number }[] = [];
              const addWithChildren = (siteId: string, depth: number) => {
                const s = sites.find((x) => x.id === siteId);
                if (!s) return;
                treeItems.push({ site: s, depth });
                sites.filter((x) => x.parent_id === siteId).forEach((c) => addWithChildren(c.id, depth + 1));
              };
              addWithChildren(createJobSite.id, 0);
              if (treeItems.length <= 1) return null;
              return (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Site / Building</label>
                  <div className="rounded-md border divide-y divide-border max-h-56 overflow-y-auto">
                    {treeItems.map(({ site: s, depth }) => {
                      const Ic = TYPE_CONFIG[s.site_type]?.icon || MapPin;
                      const isSelected = createJobSelectedSiteId === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          className={`w-full flex items-center gap-2 py-2 pr-3 text-sm text-left hover:bg-muted/50 transition-colors ${isSelected ? "bg-primary/10 font-medium" : ""}`}
                          style={{ paddingLeft: `${12 + depth * 16}px` }}
                          onClick={() => {
                            setCreateJobSelectedSiteId(s.id);
                            setCreateJobForm((f) => ({ ...f, name: s.name }));
                          }}
                        >
                          <Ic className={`h-3.5 w-3.5 shrink-0 ${TYPE_CONFIG[s.site_type]?.color || ""}`} />
                          <span className="flex-1 truncate">{s.name}</span>
                          {s.postcode && <span className="text-xs text-muted-foreground">{s.postcode}</span>}
                          {isSelected && <span className="text-primary text-xs font-semibold">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Job Name *</label>
              <Input
                placeholder="e.g. Annual Inspection"
                value={createJobForm.name}
                onChange={(e) => setCreateJobForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reference Number <span className="text-muted-foreground text-xs font-normal">(auto-generated if blank)</span></label>
              <Input
                placeholder="Auto: VFP-00001"
                value={createJobForm.reference_number}
                onChange={(e) => setCreateJobForm((f) => ({ ...f, reference_number: e.target.value }))}
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
                <Select value={createJobForm.category} onValueChange={(v) => {
                  // Recalculate qtys when category changes
                  const targetSite = sites.find((s) => s.id === createJobSelectedSiteId) || createJobSite;
                  const buildingCount = targetSite ? sites.filter((s) => {
                    const getAllDescIds = (id: string): string[] => {
                      const children = sites.filter((x) => x.parent_id === id);
                      return [...children.map((c) => c.id), ...children.flatMap((c) => getAllDescIds(c.id))];
                    };
                    return getAllDescIds(targetSite.id).includes(s.id) && s.site_type === "building";
                  }).length || 1 : 1;
                  const slug = v.toLowerCase();
                  const isPT = slug.includes("pressure") || slug.includes("wet") || slug.includes("sprinkler") || slug.includes("hydrant");
                  const isVis = slug.includes("visual") || slug.includes("inspect");
                   setCreateJobForm((f) => ({
                    ...f,
                    category: v,
                    pressure_test_qty: isPT || (!isPT && !isVis) ? buildingCount : 0,
                    visual_qty: isVis || (!isPT && !isVis) ? buildingCount : 0,
                    other_qty: f.other_qty,
                    other_service_type: f.other_service_type,
                  }));
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {jobCategories.length > 0
                      ? jobCategories.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)
                      : <>
                          <SelectItem value="general">General</SelectItem>
                          <SelectItem value="maintenance">Maintenance</SelectItem>
                          <SelectItem value="inspection">Inspection</SelectItem>
                        </>
                    }
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(createJobForm.pressure_test_qty > 0 || createJobForm.visual_qty > 0 || (createJobForm.other_qty > 0 && createJobForm.other_service_type)) && (
              <div className="rounded-md bg-muted/50 border px-3 py-2 space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">⚡ Auto-calculated from buildings</p>
                <div className="flex flex-wrap gap-2">
                  {createJobForm.pressure_test_qty > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                      Pressure Test <span className="font-bold">&times; {createJobForm.pressure_test_qty}</span>
                    </span>
                  )}
                  {createJobForm.visual_qty > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-secondary border border-border px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      Visual Inspection <span className="font-bold">&times; {createJobForm.visual_qty}</span>
                    </span>
                  )}
                  {createJobForm.other_qty > 0 && createJobForm.other_service_type && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-accent border border-border px-2 py-0.5 text-xs font-medium text-accent-foreground">
                      {createJobForm.other_service_type} <span className="font-bold">&times; {createJobForm.other_qty}</span>
                    </span>
                  )}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Other Service Type</label>
                <Input
                  placeholder="e.g. Wet Riser"
                  value={createJobForm.other_service_type}
                  onChange={(e) => setCreateJobForm((f) => ({ ...f, other_service_type: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Other Qty</label>
                <Input
                  type="number" min={0}
                  value={createJobForm.other_qty}
                  onChange={(e) => setCreateJobForm((f) => ({ ...f, other_qty: Math.max(0, parseInt(e.target.value) || 0) }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Due Date <span className="text-muted-foreground text-xs font-normal">(optional)</span></label>
              <Input type="date" value={createJobForm.due_date} onChange={(e) => setCreateJobForm((f) => ({ ...f, due_date: e.target.value }))} />
            </div>
          </div>{/* end scrollable area */}
          <div className="flex gap-2 pt-2 shrink-0 border-t">
            <Button
              className="flex-1"
              onClick={() => handleCreateJob()}
              disabled={createJobSaving || !createJobForm.name.trim()}
            >
              {createJobSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Briefcase className="mr-2 h-4 w-4" />}
              Create Job
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleCreateJob("scheduled")}
              disabled={createJobSaving || !createJobForm.name.trim()}
            >
              Submit to Planner
            </Button>
            <Button variant="outline" onClick={() => setCreateJobDialogOpen(false)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
