import MapAddress from "@/components/MapAddress";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import SiteDryRisers from "@/components/assets/SiteDryRisers";
import SiteAccessCard from '@/components/sites/SiteAccessCard';
const StickerPackDialog = lazy(() => import('@/components/assets/StickerPackDialog'));
const PrintQrLabels = lazy(() => import('@/components/assets/PrintQrLabels'));
import NewVisitDialog from '@/components/riser-visits/NewVisitDialog';
import SiteJobDialog from '@/components/sites/SiteJobDialog';
import BuildingDuplicateWarning from '@/components/sites/BuildingDuplicateWarning';
import { buildingDuplicatePairs } from '@/lib/buildingDuplicates';
import { SITES_PAGE_SIZE, SITES_SEARCH_DELAY, visiblePage, mergeSiteRows } from '@/lib/sitesPaging';
import ServicingControl from '@/components/riser-visits/ServicingControl';
import BulkImportSitesDialog from "@/components/BulkImportSitesDialog";
import FolderSiteImportDialog from "@/components/FolderSiteImportDialog";
import HistoricReportsList from "@/components/HistoricReportsList";
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
import { Flame, Combine } from "lucide-react";
import MergeDuplicateSitesDialog from "@/components/sites/MergeDuplicateSitesDialog";
import CustomerCleanupDialog from '@/components/sites/CustomerCleanupDialog';
import { useJobCategories } from "@/hooks/useJobCategories";
import { format } from "date-fns";
import { fuzzyMatch, fuzzyFilter } from "@/lib/fuzzyMatch";
import { UKDateInput } from "@/components/ui/uk-date-input";
import { filteredSummarySites, siteAncestors, siteSummaryCounts, type SiteSummaryType } from '@/lib/siteSummary';

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
  child_count?: number;
  job_count?: number;
  asset_count?: number;
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
  what3words: "",
};

type CustomerFolder = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  sites: Site[];
  site_count?: number;
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
                <MapAddress address={site.address} postcode={site.postcode} siteId={site.id} className="text-[11px] text-muted-foreground" />
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
  const [navigationParams] = useSearchParams();
  const [sites, setSites] = useState<Site[]>([]);
  const [sitePageIds, setSitePageIds] = useState<string[]>([]);
  const [siteMore, setSiteMore] = useState(false);
  const [folderMore, setFolderMore] = useState(false);
  const [unlinkedRows, setUnlinkedRows] = useState<Site[]>([]);
  const [unlinkedMore, setUnlinkedMore] = useState(false);
  const [unlinkedLoading, setUnlinkedLoading] = useState(false);
  const [totals, setTotals] = useState<Record<string,number> | null>(null);
  const [serverSearch, setServerSearch] = useState('');
  const [serverUnlinkedSearch, setServerUnlinkedSearch] = useState('');
  const [childPages, setChildPages] = useState<Record<string,{offset:number;more:boolean}>>({});
  const [folderPages, setFolderPages] = useState<Record<string,{offset:number;more:boolean}>>({});
  const [folderBusy, setFolderBusy] = useState<Record<string,boolean>>({});
  const [duplicateContexts, setDuplicateContexts] = useState<Record<string,Site[]>>({});
  const siteRequest = useRef(0);
  const folderRequest = useRef(0);
  const unlinkedRequest = useRef(0);
  const duplicateBuildingWarning = (site: Site) => {
    const rows=duplicateContexts[site.id] ?? [];
    const counts=new Map(rows.map(row=>[row.id,{assets:row.asset_count ?? 0}]));
    const pair=buildingDuplicatePairs(rows,counts).find(p=>p.source.id===site.id);
    return userRole==='admin' && pair ? <BuildingDuplicateWarning source={pair.source} keep={pair.keep} onChanged={()=>{void fetchSites();void fetchCustomerFolders();setDuplicateContexts({});}}/> : null;
  };
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [summaryType, setSummaryType] = useState<SiteSummaryType | null>(null);
  const [summaryRegionId, setSummaryRegionId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [accessSite,setAccessSite]=useState<Site|null>(null);

  const [editing, setEditing] = useState<Site | null>(null);
  const [form, setForm] = useState(emptySite);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
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
  useEffect(() => {const tab=navigationParams.get('tab');if(tab==='hierarchy'||tab==='by-customer')setActiveTab(tab);},[navigationParams]);
  const [editingW3W, setEditingW3W] = useState<string | null>(null);
  const [unlinkedExpanded, setUnlinkedExpanded] = useState(false);
  const [unlinkedSearch, setUnlinkedSearch] = useState("");
  const [folderSort, setFolderSort] = useState<"name" | "sites-asc" | "sites-desc">("name");
  const [quickAssignSite, setQuickAssignSite] = useState<Site | null>(null);
  const [quickAssignCustomerId, setQuickAssignCustomerId] = useState("");
  const [quickAssignSaving, setQuickAssignSaving] = useState(false);
  const [deletingUnlinked, setDeletingUnlinked] = useState(false);
  const [deleteUnlinkedConfirm, setDeleteUnlinkedConfirm] = useState("");
  const [deleteCustomerId, setDeleteCustomerId] = useState<string | null>(null);
  const [deleteCustomerLoading, setDeleteCustomerLoading] = useState(false);
  const [pickedCustomers, setPickedCustomers] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [custMergeOpen, setCustMergeOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [mergeKeepId, setMergeKeepId] = useState<string>("");
  const [customerActionBusy, setCustomerActionBusy] = useState(false);
  const togglePickedCustomer = (id: string) =>
    setPickedCustomers((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const runBulkDeleteCustomers = async () => {
    setCustomerActionBusy(true);
    const { data, error } = await supabase.rpc("delete_empty_customers" as any, { _customer_ids: [...pickedCustomers] });
    setCustomerActionBusy(false);
    if (error) { toast({ title: "Couldn't delete", description: error.message, variant: "destructive" }); return; }
    const res = data as any;
    const kept = (res?.kept || []).length;
    toast({ title: `Deleted ${(res?.deleted || []).length} customer(s)`, description: kept ? `${kept} kept because they still have jobs, documents or other records.` : undefined });
    setBulkDeleteOpen(false); setPickedCustomers(new Set());
    fetchCustomerFolders({ background: true, preserveCustomerScroll: true, preserveUnlinkedScroll: true });
  };
  const runMergeCustomers = async () => {
    if (!mergeKeepId) return;
    setCustomerActionBusy(true);
    const { data, error } = await supabase.rpc("merge_customers" as any, { _target_id: mergeKeepId, _source_ids: [...pickedCustomers].filter((id) => id !== mergeKeepId) });
    setCustomerActionBusy(false);
    if (error) { toast({ title: "Couldn't merge", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Merged ${(data as any)?.merged ?? 0} duplicate(s)`, description: "Sites, jobs and documents now sit under the kept customer." });
    setCustMergeOpen(false); setPickedCustomers(new Set());
    fetchCustomerFolders({ background: true, preserveCustomerScroll: true, preserveUnlinkedScroll: true, ensureOpenFolderIds: [mergeKeepId] });
  };
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
    setCreateJobDialogOpen(true);
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

  const browserPage = async (mode:string, query='',offset=0,parent?:string,customer?:string,type?:string) => {
    const {data,error}=await supabase.rpc('sites_browser_page',{_mode:mode,_search:query,_offset:offset,_parent:parent ?? undefined,_customer:customer ?? undefined,_type:type ?? undefined});
    if(error) throw error;
    return data as unknown as {rows:Site[];context:Site[]};
  };
  const refreshTotals = async () => {
    const {data,error}=await supabase.rpc('sites_browser_page',{_mode:'totals'});
    if(!error) setTotals(data as unknown as Record<string,number>);
  };
  const fetchSites = async (append=false) => {
    const request=++siteRequest.current;
    setLoading(true);
    try {
      const data=await browserPage('sites',serverSearch,append?sitePageIds.length:0,summaryRegionId ?? undefined,undefined,summaryType ?? undefined);
      if(request!==siteRequest.current) return;
      const page=visiblePage(data.rows ?? []);
      setSiteMore(page.hasMore);
      setSitePageIds(prev=>append?[...prev,...page.rows.map(s=>s.id)]:page.rows.map(s=>s.id));
      setSites(prev=>mergeSiteRows(append?prev:[],[...(data.context ?? []),...page.rows]));
      if(!append){setChildPages({});setDuplicateContexts({});void refreshTotals();}
    } catch {toast({title:'Could not load sites',variant:'destructive'});} finally {if(request===siteRequest.current)setLoading(false);}
  };
  const fetchUnlinked = async (append=false) => {
    const request=++unlinkedRequest.current;setUnlinkedLoading(true);
    try {
      const data=await browserPage('unlinked',serverUnlinkedSearch,append?unlinkedRows.length:0);
      if(request!==unlinkedRequest.current)return;
      const page=visiblePage(data.rows ?? []);setUnlinkedMore(page.hasMore);
      setUnlinkedRows(prev=>append?mergeSiteRows(prev,page.rows):page.rows);
    } catch {toast({title:'Could not load unlinked sites',variant:'destructive'});} finally {if(request===unlinkedRequest.current)setUnlinkedLoading(false);}
  };
  const loadChildren = async (id:string,append=false) => {
    const offset=append?(childPages[id]?.offset ?? 0):0;
    const data=await browserPage('children','',offset,id);
    const page=visiblePage(data.rows ?? []);
    setSites(prev=>mergeSiteRows(prev,[...(data.context ?? []),...page.rows]));
    setChildPages(prev=>({...prev,[id]:{offset:offset+page.rows.length,more:page.hasMore}}));
    if(userRole==='admin') for(const row of page.rows.filter(row=>row.site_type==='building')) {
      setDuplicateContexts(prev=>({...prev,[row.id]:page.rows}));
    }
  };
  const loadFolderSites = async (id:string,append=false) => {
    setFolderBusy(prev=>({...prev,[id]:true}));
    try {
      const offset=append?(folderPages[id]?.offset ?? 0):0;
      const data=await browserPage('folder',serverSearch,offset,undefined,id);
      const page=visiblePage(data.rows ?? []);
      setCustomerFolders(prev=>prev.map(f=>f.id===id?{...f,sites:mergeSiteRows(append?f.sites:[],[...(data.context ?? []).filter(row=>row.site_type!=='region'),...page.rows]),jobCountsBySite:Object.fromEntries(page.rows.map(row=>[row.id,row.job_count ?? 0]))}:f));
      setFolderPages(prev=>({...prev,[id]:{offset:offset+page.rows.length,more:page.hasMore}}));
      setSites(prev=>mergeSiteRows(prev,[...(data.context ?? []),...page.rows]));
      for(const row of page.rows.filter(row=>row.site_type==='building'))setDuplicateContexts(prev=>({...prev,[row.id]:page.rows}));
    } catch {toast({title:'Could not load customer sites',variant:'destructive'});} finally {setFolderBusy(prev=>({...prev,[id]:false}));}
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

  const fetchCustomerFolders = async (options?: {ensureOpenFolderIds?:string[];preserveCustomerScroll?:boolean;preserveUnlinkedScroll?:boolean;background?:boolean;append?:boolean}) => {
    const request=++folderRequest.current;
    setFoldersLoading(true);
    try {
      const data=await browserPage('customers',serverSearch,options?.append?customerFolders.length:0);
      if(request!==folderRequest.current)return;
      const page=visiblePage((data.rows ?? []) as unknown as CustomerFolder[]);
      setFolderMore(page.hasMore);
      setCustomerFolders(prev=>options?.append?mergeSiteRows(prev,page.rows.map(row=>({...row,sites:[]}))):page.rows.map(row=>({...row,sites:[]})));
      if(!options?.append) {
        setFolderPages({});setOpenFolders(options?.ensureOpenFolderIds ?? []);
        for(const id of options?.ensureOpenFolderIds ?? [])void loadFolderSites(id);
        void refreshTotals();void fetchUnlinked();
      }
    } catch {toast({title:'Could not load customers',variant:'destructive'});} finally {if(request===folderRequest.current)setFoldersLoading(false);}
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

  useEffect(()=>{const timer=setTimeout(()=>setServerSearch(search.trim()),SITES_SEARCH_DELAY);return()=>clearTimeout(timer);},[search]);
  useEffect(()=>{const timer=setTimeout(()=>setServerUnlinkedSearch(unlinkedSearch.trim()),SITES_SEARCH_DELAY);return()=>clearTimeout(timer);},[unlinkedSearch]);
  useEffect(()=>{if(userRole)void fetchSites();},[serverSearch,summaryType,summaryRegionId,userRole]);
  useEffect(()=>{if(userRole && activeTab==='by-customer')void fetchCustomerFolders();},[serverSearch,activeTab,userRole]);
  useEffect(()=>{if(userRole && activeTab==='by-customer')void fetchUnlinked();},[serverUnlinkedSearch,activeTab,userRole]);
  useEffect(()=>{for(const id of openFolders)if(!folderPages[id] && !folderBusy[id])void loadFolderSites(id);},[openFolders]);
  useEffect(()=>{if(!quickAssignSite && !moveSitesOpen)return;void supabase.from('customers').select('id,name').order('name').limit(50).then(({data})=>setAllCustomers(data ?? []));},[quickAssignSite,moveSitesOpen]);
  const toggle = (id:string) => {
    if(!expanded.has(id) && !childPages[id])void loadChildren(id).catch(()=>toast({title:'Could not load buildings',variant:'destructive'}));
    setExpanded(prev=>{const next=new Set(prev);next.has(id)?next.delete(id):next.add(id);return next;});
  };

  const getChildren = (parentId: string | null) => sites.filter((s) => s.parent_id === parentId);

  const filteredRoots = sitePageIds.map(id=>sites.find(s=>s.id===id)).filter((s):s is Site=>!!s);

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
      what3words: (site as any).what3words || "",
    });
    setEditingW3W((site as any).what3words || null);
    setDialogOpen(true);
    // Only run an address-based lookup as a hint when the site has no
    // stored what3words yet — never overwrite a value that's been captured
    // on site or manually set by an admin.
    if (!(site as any).what3words) {
      const address = site.address || site.postcode;
      if (address) {
        supabase.functions.invoke("w3w-convert", { body: { address } })
          .then(({ data }) => { if (data?.words) setEditingW3W(data.words); });
      }
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    const w3wInput = ((form as any).what3words || "").trim();
    const payload: any = {
      name: form.name.trim(), site_type: form.site_type, parent_id: form.parent_id || null,
      address: form.address || null, postcode: form.postcode || null,
      contact_name: form.contact_name || null, contact_phone: form.contact_phone || null,
      contact_email: form.contact_email || null, notes: form.notes || null,
      outlets_count: (form as any).quantity !== "" ? Number((form as any).quantity) : (form.outlets_count !== "" ? Number(form.outlets_count) : null),
      riser_location: form.riser_location || null,
      category: (form as any).category || null,
      what3words: w3wInput ? w3wInput.replace(/^\/\/\//, "") : null,
    };
    if (editing && w3wInput && w3wInput.replace(/^\/\/\//, "") !== ((editing as any).what3words || "")) {
      payload.w3w_updated_at = new Date().toISOString();
    }
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

  const summarySites = filteredRoots;
  const counts = totals ?? {region:0,site:0,building:0,zone:0};
  const summaryRegion = sites.find(site=>site.id===summaryRegionId);
  const summaryList = filteredRoots;

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
    const childCount = site.child_count ?? children.length;
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
          className={`flex flex-wrap items-center gap-2 py-2 px-3 border-b border-border/50 hover:bg-muted/50 transition-all duration-200 cursor-pointer ${selected.has(site.id) ? "bg-primary/5" : ""} ${isHighlighted ? "ring-2 ring-inset ring-primary/60 bg-primary/5" : ""}`}
          style={{ paddingLeft: `${depth * 24 + 12}px` }}
          onClick={() => { if (childCount > 0) toggle(site.id); }}
        >
          {userRole === "admin" && (
            <input type="checkbox" checked={selected.has(site.id)} onChange={() => toggleSelect(site.id)} className="h-4 w-4 shrink-0 rounded border-input accent-primary cursor-pointer" onClick={(e) => e.stopPropagation()} />
          )}
          {childCount > 0 ? (
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
              {childCount > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0 bg-muted text-muted-foreground">
                  {childCount} {childType || "building"}{childCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </div>
          <Badge variant="secondary" className="text-[10px] capitalize shrink-0">{site.site_type}</Badge>
          {duplicateBuildingWarning(site)}
          {(site.address || site.postcode) && <MapAddress address={site.address} postcode={site.postcode} label={site.postcode || site.address || undefined} siteId={site.id} className="text-xs text-muted-foreground" />}
          <Button variant="ghost" size="sm" onClick={e=>{e.stopPropagation();setAccessSite(site);}}>Access info</Button>
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
        {isExpanded && childPages[site.id]?.more && <Button variant="outline" onClick={()=>void loadChildren(site.id,true)}>Load more buildings</Button>}
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
            <Button variant="outline" onClick={() => setMergeOpen(true)}><Combine className="mr-2 h-4 w-4" /> Merge duplicate sites</Button>
            <Button onClick={() => openCreate(null, "region")} data-setup="add-site"><Plus className="mr-2 h-4 w-4" /> Add Region</Button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Object.entries(TYPE_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <Button key={key} variant="outline" aria-label={`Show ${cfg.label}s`} aria-pressed={summaryType === key}
              onClick={() => { setSummaryType(key as SiteSummaryType); setSummaryRegionId(null); }}
              className={`h-auto min-h-24 w-full justify-start whitespace-normal bg-card p-4 text-left cursor-pointer hover:bg-muted hover:text-foreground hover:shadow-sm ${summaryType === key ? 'ring-2 ring-primary border-primary' : 'border-border'}`}>
                <Icon className={`h-5 w-5 ${cfg.color}`} />
                <div>
                  <p className="text-2xl font-bold">{totals ? counts[key as keyof typeof counts] : '—'}</p>
                  <p className="text-xs text-muted-foreground">{cfg.label}s</p>
                </div>
            </Button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search sites..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {summaryType && (
        <section aria-label="Site summary list" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">{summaryRegion ? `${summaryRegion.name} — Sites` : `${TYPE_CONFIG[summaryType].label}s`}</h2>
            <Button variant="ghost" size="sm" onClick={() => { setSummaryType(null); setSummaryRegionId(null); }}><X className="h-4 w-4" />Clear</Button>
          </div>
          {loading && summaryList.length===0 ? <p className="py-8 text-center text-muted-foreground">Loading...</p> : summaryList.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-muted-foreground">{summaryType === 'zone' ? (search.trim() ? 'No zones match your search.' : 'No zones yet') : `No ${summaryRegionId ? 'sites' : `${TYPE_CONFIG[summaryType].label.toLowerCase()}s`}${search.trim() ? ' match your search.' : ' yet.'}`}</p>
              {summaryType === 'zone' && userRole === 'admin' && <Button onClick={() => openCreate(null, 'zone')}><Plus className="h-4 w-4" />Add a zone</Button>}
            </div>
          ) : (
            <div className="divide-y divide-border border-y border-border">
              {summaryList.map(site => {
                const ancestors = siteAncestors(site, sites);
                const owner = ancestors.find(parent => parent.site_type === 'site');
                const regionSiteCount = site.site_type === 'region' ? summarySites.filter(record => record.site_type === 'site' && siteAncestors(record, sites).some(parent => parent.id === site.id)).length : 0;
                return <Button key={site.id} variant="ghost" className="w-full h-auto min-h-14 justify-between rounded-none py-3 px-3 whitespace-normal text-left gap-3"
                  onClick={() => {
                    if (site.site_type === 'region') { setSummaryRegionId(site.id); }
                    else { setSummaryType(null); setSummaryRegionId(null); navigateToSite(site.id); }
                  }}>
                  <span className="min-w-0 break-words"><span className="block font-medium">{site.name}</span>
                    {(owner || ancestors.length > 0) && <span className="block text-xs text-muted-foreground">{owner ? owner.name : ancestors.map(parent => parent.name).reverse().join(' / ')}</span>}
                    {(site.address || site.postcode) && <span className="block text-xs text-muted-foreground">{[site.address, site.postcode].filter(Boolean).join(', ')}</span>}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">{site.site_type === 'region' && <span className="text-xs text-muted-foreground">{regionSiteCount} {regionSiteCount === 1 ? 'site' : 'sites'}</span>}<ChevronRight className="h-4 w-4" /></span>
                </Button>;
              })}
            </div>
          )}
          <div className="h-14"><Button variant="outline" disabled={loading || !siteMore} onClick={()=>void fetchSites(true)}>{loading?"Loading…":"Load more"}</Button></div>
        </section>
      )}
      <Tabs value={activeTab} onValueChange={setActiveTab} className={summaryType ? 'hidden' : undefined}>
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
            <CardContent className="p-0 min-h-[420px]">
              {!loading && filteredRoots.length > 0 && userRole === "admin" && (
                <div className="flex items-center gap-2 py-2 px-3 border-b border-border">
                  <input type="checkbox" checked={selected.size === sites.length && sites.length > 0} onChange={toggleSelectAll} className="h-4 w-4 shrink-0 rounded border-input accent-primary cursor-pointer" />
                  <span className="text-xs text-muted-foreground">{selected.size > 0 ? `${selected.size} of ${sites.length} selected` : "Select all"}</span>
                </div>
              )}
              {loading && filteredRoots.length===0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
              ) : filteredRoots.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{search ? "No sites match your search." : "No sites yet. Add a region to get started."}</p>
              ) : (
                <div aria-busy={loading}>{filteredRoots.map((site) => renderTreeRow(site, 0))}</div>
              )}
            </CardContent>
          </Card>
          <div className="h-14 flex items-center justify-center"><Button variant="outline" disabled={loading || !siteMore} onClick={()=>void fetchSites(true)}>{loading?"Loading…":siteMore?"Load more sites":"All matches loaded"}</Button></div>
        </TabsContent>

        {/* By Customer Tab */}
        <TabsContent value="by-customer" className="mt-4">
          {(

            <div className="flex justify-between items-center mb-2 gap-2">
              <div data-assistant-target="Merge customers" className="flex flex-wrap items-center gap-2">
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
                {userRole === "admin" && (
                  <>
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCleanupOpen(true)}><FileSpreadsheet className="mr-1 h-3.5 w-3.5" />Customer clean-up</Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs"
                      onClick={() => setPickedCustomers(new Set(customerFolders.filter((f) => f.sites.length === 0).map((f) => f.id)))}>
                      Tick all with 0 sites
                    </Button>
                    {pickedCustomers.size > 0 && (
                      <>
                        <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => setBulkDeleteOpen(true)}>
                          <Trash2 className="mr-1 h-3 w-3" /> Delete ticked ({pickedCustomers.size})
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={pickedCustomers.size < 2}
                          onClick={() => {
                            const picked = customerFolders.filter((f) => pickedCustomers.has(f.id));
                            setMergeKeepId([...picked].sort((a, b) => (b.site_count ?? 0) - (a.site_count ?? 0))[0]?.id || "");
                            setCustMergeOpen(true);
                          }}>
                          <Combine className="mr-1 h-3 w-3" /> Merge customers
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPickedCustomers(new Set())}>Clear ticks</Button>
                      </>
                    )}
                  </>
                )}
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
          {(

            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} autoScroll={autoScrollOptions}>
              <div className="flex gap-4 items-start">
                {/* Customer folders */}
                <div
                  ref={customerFoldersScrollRef}
                  className="flex-1 min-w-0 space-y-2 min-h-[420px] max-h-[75vh] overflow-y-auto pr-1 focus:outline-none"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    const visibleFolders = customerFolders
                      .filter(() => true)
                      .sort((a, b) => {
                        if (folderSort === "sites-desc") return (b.site_count ?? 0) - (a.site_count ?? 0);
                        if (folderSort === "sites-asc") return (a.site_count ?? 0) - (b.site_count ?? 0);
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
                        .filter(() => true)
                        .sort((a, b) => {
                          if (folderSort === "sites-desc") return (b.site_count ?? 0) - (a.site_count ?? 0);
                          if (folderSort === "sites-asc") return (a.site_count ?? 0) - (b.site_count ?? 0);
                          return a.name.localeCompare(b.name);
                        })
                        .map((folder, idx) => (
                          <DroppableCustomerFolder key={folder.id} folder={folder} isOver={dragOverFolderId === folder.id}>
                            <AccordionItem value={folder.id} className={`rounded-lg border bg-card transition-all duration-200 ${focusedFolderIndex === idx ? "ring-2 ring-primary/50" : ""} ${exitingFolderIds.has(folder.id) ? "animate-folder-exit" : ""}`}>
                              <AccordionTrigger className="px-4 hover:no-underline">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  {userRole === "admin" && (
                                    <input type="checkbox" aria-label={`Tick ${folder.name}`} className="h-4 w-4 shrink-0 accent-primary"
                                      checked={pickedCustomers.has(folder.id)}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={() => togglePickedCustomer(folder.id)} />
                                  )}
                                  {userRole === "admin" && <DraggableFolderHandle folderId={folder.id} folderName={folder.name} />}
                                  <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                                  <span className="font-semibold truncate">{folder.name}</span>
                                  {folder.email && <span className="hidden sm:inline text-xs text-muted-foreground truncate">{folder.email}</span>}
                                  {folder.phone && <span className="hidden md:inline text-xs text-muted-foreground shrink-0">{folder.phone}</span>}
                                  <Badge variant="secondary" className="ml-auto mr-2 text-xs shrink-0">
                                    {(() => {
                                      const parents = folder.sites.filter((s) => !s.parent_id || !folder.sites.some((p) => p.id === s.parent_id));
                                      const childCount = folder.sites.length - parents.length;
                                      return `${folder.site_count ?? parents.length} sites`;
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
                                {folderBusy[folder.id] && folder.sites.length===0 ? <div className="h-48 flex items-center justify-center text-muted-foreground">Loading sites…</div> : folder.sites.length === 0 ? (
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
                                       <ContextMenuItem onClick={() => setFireLogSite(site)}>
                                         <Flame className="mr-2 h-3.5 w-3.5" /> Fire log
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
                                           {duplicateBuildingWarning(site)}
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
                                             <div className="text-xs text-muted-foreground mt-0.5">{addressLine && <MapAddress address={site.address} postcode={site.postcode} siteId={site.id} />}{site.contact_name && <span> · {site.contact_name}</span>}</div>
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
                                             <DropdownMenuItem onClick={()=>setAccessSite(site)}>Access info</DropdownMenuItem>
                                             <DropdownMenuItem onClick={() => openEdit(site)}>
                                               <Pencil className="mr-2 h-3.5 w-3.5" /> Edit site
                                             </DropdownMenuItem>
                                             <DropdownMenuItem onClick={() => setFireLogSite(site)}>
                                               <Flame className="mr-2 h-3.5 w-3.5" /> Fire log
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
                                <div className="h-12 flex items-center justify-center"><Button variant="outline" size="sm" disabled={folderBusy[folder.id] || !folderPages[folder.id]?.more} onClick={()=>void loadFolderSites(folder.id,true)}>{folderBusy[folder.id]?"Loading…":"Load more sites"}</Button></div>
                              </AccordionContent>
                            </AccordionItem>
                          </DroppableCustomerFolder>
                        ))}
                    </Accordion>
                  )}
                  <div className="h-14 flex items-center justify-center"><Button variant="outline" disabled={foldersLoading || !folderMore} onClick={()=>void fetchCustomerFolders({append:true})}>{foldersLoading?"Loading…":folderMore?"Load more customers":"All matches loaded"}</Button></div>
                </div>

                {/* Draggable site chips panel */}
                {(() => {
                  const allUnlinked=unlinkedRows;
                  const filteredUnlinked=unlinkedRows;
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
                                  {totals?.unlinked ?? "—"} unlinked
                                </Badge>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs max-h-64 overflow-y-auto">
                              <p className="font-semibold text-xs mb-1">{totals?.unlinked ?? "—"} unlinked sites</p>
                              {allUnlinked.length === 0 ? (
                                <p className="text-xs text-muted-foreground">All sites are linked to customers.</p>
                              ) : (
                                <ul className="space-y-0.5">
                                  {allUnlinked.slice(0, 30).map((s) => (
                                    <li key={s.id} className="text-xs flex items-center gap-1.5">
                                      <span className="truncate">{s.name}</span>
                                      {(s.address || s.postcode) && <MapAddress address={s.address} postcode={s.postcode} siteId={s.id} label={s.postcode || s.address || undefined} />}
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
                          <AlertDialog onOpenChange={(open) => { if (!open) setDeleteUnlinkedConfirm(""); }}>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive">
                                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete all
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete all unlinked sites?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete all {totals?.unlinked ?? "—"} unlinked sites that have no children or jobs. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <div className="space-y-2 py-2">
                                <p className="text-sm text-muted-foreground">Type <strong>DELETE</strong> to confirm.</p>
                                <Input
                                  value={deleteUnlinkedConfirm}
                                  onChange={(e) => setDeleteUnlinkedConfirm(e.target.value)}
                                  placeholder="DELETE"
                                  className="uppercase"
                                  autoComplete="off"
                                />
                              </div>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setDeleteUnlinkedConfirm("")}>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={handleDeleteAllUnlinked}
                                  disabled={deletingUnlinked || deleteUnlinkedConfirm !== "DELETE"}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                                >
                                  {deletingUnlinked ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                  Delete All
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                      {(

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
                        className="space-y-1.5 min-h-[420px] max-h-[70vh] overflow-y-auto pr-1 focus:outline-none"
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
                                const {count:childCount,error:childError}=await supabase.from("sites").select("id",{count:"exact",head:true}).eq("parent_id",s.id);
                                if(childError)throw childError;
                                const children=Array(childCount ?? 0);
                                if (children.length > 0) { toast({ title: "Cannot delete", description: "This site has children. Remove them first.", variant: "destructive" }); return; }
                                const {count:jobCount,error:jobError}=await supabase.from("jobs").select("id",{count:"exact",head:true}).eq("site_id",s.id);
                                if(jobError)throw jobError;
                                if ((jobCount ?? 0) > 0) { toast({ title: "Cannot delete", description: "This site has associated jobs.", variant: "destructive" }); return; }
                                const { error } = await supabase.from("sites").delete().eq("id", s.id);
                                if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
                                setSites((prev) => prev.filter((x) => x.id !== s.id));
                                toast({ title: "Site deleted" });
                              }} />
                            </div>
                          ))
                        )}
                      </div>
                      <div className="h-12"><Button variant="outline" size="sm" disabled={unlinkedLoading || !unlinkedMore} onClick={()=>void fetchUnlinked(true)}>{unlinkedLoading?"Loading…":"Load more sites"}</Button></div>
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
      <Dialog open={!!accessSite} onOpenChange={open=>{if(!open)setAccessSite(null);}}><DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{accessSite?.name} — Access info</DialogTitle></DialogHeader>{accessSite&&<SiteAccessCard siteId={accessSite.id}/>}</DialogContent></Dialog>

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
          {editing?.id && <><SiteAccessCard siteId={editing.id}/><div className="flex flex-wrap gap-4 items-center">{userRole === 'admin' && <><NewVisitDialog siteId={editing.id} siteName={editing.name}/><Suspense fallback={null}><PrintQrLabels siteId={editing.id}/><StickerPackDialog siteId={editing.id} siteName={editing.name||null} customerLogoUrl={(editing as any)?.customers?.logo_url||null}/></Suspense><ServicingControl table="sites" id={editing.id}/></>}</div><SiteDryRisers siteId={editing.id} /></>}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="#e11f26"><path d="M11.994 0C5.367 0 0 5.367 0 11.994 0 18.622 5.367 24 11.994 24 18.622 24 24 18.622 24 11.994 24 5.367 18.622 0 11.994 0zm-2.6 17.4l-1.5-5.1-1.5 5.1H4.7L2.5 9.6h1.8l1.5 5.4 1.5-5.4h1.8l1.5 5.4 1.5-5.4h1.8l-2.2 7.8h-1.7zm7.8 0l-1.5-5.1-1.5 5.1h-1.7l-2.2-7.8h1.8l1.5 5.4 1.5-5.4h1.8l1.5 5.4 1.5-5.4h1.8l-2.2 7.8h-1.7z"/></svg>
              what3words location
            </label>
            <Input
              value={(form as any).what3words || ""}
              onChange={(e) => setForm((f) => ({ ...f, what3words: e.target.value }))}
              placeholder="e.g. filled.count.soap"
            />
            <p className="text-xs text-muted-foreground">
              Auto-captured when an engineer signs off on site. Edit or clear to override.
              {editingW3W && !(form as any).what3words && (
                <>
                  {" "}Suggested from address:{" "}
                  <button
                    type="button"
                    className="underline font-medium"
                    style={{ color: "#e11f26" }}
                    onClick={() => setForm((f) => ({ ...f, what3words: editingW3W!.replace(/^\/\/\//, "") }))}
                  >
                    {editingW3W}
                  </button>
                </>
              )}
            </p>
            {((form as any).what3words || "").trim() && (
              <a
                href={`https://what3words.com/${((form as any).what3words || "").replace(/^\/\/\//, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium hover:underline"
                style={{ color: "#e11f26" }}
              >
                Open ///{((form as any).what3words || "").replace(/^\/\/\//, "")} in what3words →
              </a>
            )}
          </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            {editing && (
              <div className="pt-2 border-t">
                <HistoricReportsList siteId={editing.id} canDelete />
              </div>
            )}
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
      {userRole === "admin" && <MergeDuplicateSitesDialog open={mergeOpen} onOpenChange={setMergeOpen} onChanged={fetchSites} />}
      {userRole === 'admin' && <CustomerCleanupDialog open={cleanupOpen} onOpenChange={setCleanupOpen} onChanged={() => { void fetchSites(); void fetchCustomerFolders(); }} />}

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

      <Dialog open={bulkDeleteOpen} onOpenChange={(o) => !customerActionBusy && setBulkDeleteOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Delete {pickedCustomers.size} customer(s)?</DialogTitle></DialogHeader>
          <div className="max-h-48 overflow-y-auto text-sm space-y-0.5">
            {customerFolders.filter((f) => pickedCustomers.has(f.id)).map((f) => (
              <div key={f.id}>{f.name} <span className="text-muted-foreground">· {f.sites.length} site(s)</span></div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">Any customer that still has sites, jobs, documents, contracts or portal users will be kept, not deleted.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" disabled={customerActionBusy} onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={customerActionBusy} onClick={runBulkDeleteCustomers}>
              <Trash2 className="mr-2 h-4 w-4" /> {customerActionBusy ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={custMergeOpen} onOpenChange={(o) => !customerActionBusy && setCustMergeOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Merge {pickedCustomers.size} customers into one</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Choose the customer to keep. Sites, jobs, documents, contracts and portal access from the others move to it, missing contact details are copied across, then the duplicates are removed.</p>
          <div className="max-h-56 overflow-y-auto space-y-1">
            {customerFolders.filter((f) => pickedCustomers.has(f.id)).map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-sm rounded border px-2 py-1.5 cursor-pointer">
                <input type="radio" name="merge-keep" className="accent-primary" checked={mergeKeepId === f.id} onChange={() => setMergeKeepId(f.id)} />
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-xs text-muted-foreground">{f.sites.length} site(s)</span>
                {mergeKeepId === f.id && <Badge variant="secondary" className="text-xs">Keep</Badge>}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" disabled={customerActionBusy} onClick={() => setCustMergeOpen(false)}>Cancel</Button>
            <Button disabled={customerActionBusy || !mergeKeepId} onClick={runMergeCustomers}>
              <Combine className="mr-2 h-4 w-4" /> {customerActionBusy ? "Merging…" : "Merge"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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


      {createJobSite && <SiteJobDialog siteId={createJobSite.id} siteName={createJobSite.name} open={createJobDialogOpen} onOpenChange={setCreateJobDialogOpen} />}

      {/* Fire Log dialog */}
      <Dialog open={!!fireLogSite} onOpenChange={(o) => !o && setFireLogSite(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fire Log</DialogTitle>
          </DialogHeader>
          {fireLogSite && <SiteFireLog siteId={fireLogSite.id} siteName={fireLogSite.name} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
