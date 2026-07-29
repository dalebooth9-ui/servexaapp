import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useFileUpload } from "@/hooks/useFileUpload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2, Download, MessageCircle, Camera, AlertTriangle, ClipboardCheck,
  FileImage, Upload, GripVertical, Trash2, CheckSquare, X,
} from "lucide-react";
import PhotoLightbox from "@/components/PhotoLightbox";
import { createSubmissionPhotoSignedUrl, fetchJobPhotoMeta } from "@/lib/jobPhotos";
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter,
  useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Source = "whatsapp" | "app" | "defect" | "checklist" | "document";

type PhotoItem = {
  id: string;
  source: Source;
  storagePath: string | null;
  fallbackUrl?: string | null;
  fileName?: string;
  caption?: string;
  engineerId?: string;
  engineerName?: string;
  timestamp: string;
  signedUrl?: string;
  displayOrder?: number | null;
  submissionId?: string;
};

function sourceMeta(s: Source) {
  switch (s) {
    case "whatsapp": return { label: "WhatsApp", icon: MessageCircle, className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" };
    case "app": return { label: "App", icon: Camera, className: "bg-primary/15 text-primary" };
    case "defect": return { label: "Defect", icon: AlertTriangle, className: "bg-destructive/15 text-destructive" };
    case "checklist": return { label: "Checklist", icon: ClipboardCheck, className: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300" };
    case "document": return { label: "Document", icon: FileImage, className: "bg-muted text-foreground" };
  }
}

function toStoragePath(fileUrl?: string | null): string | null {
  return fileUrl || null;
}

function SortablePhotoTile({
  photo,
  onOpen,
  onDownload,
  onDelete,
  canDelete,
  selectMode,
  selected,
  onToggleSelect,
}: {
  photo: PhotoItem;
  onOpen: () => void;
  onDownload: () => void;
  onDelete: () => void;
  canDelete: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: photo.id, disabled: selectMode });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: selectMode ? "auto" : "none",
  };
  const meta = sourceMeta(photo.source);
  const Icon = meta.icon;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-lg overflow-hidden border bg-muted ${
        selected ? "ring-2 ring-primary" : ""
      }`}
    >
      <button
        type="button"
        onClick={selectMode ? onToggleSelect : onOpen}
        className="block w-full aspect-square"
        aria-label={photo.caption || photo.fileName || "Photo"}
      >
        {photo.signedUrl ? (
          <img
            src={photo.signedUrl}
            alt={photo.caption || photo.fileName || "Job photo"}
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs">Unavailable</div>
        )}
      </button>

      {!selectMode && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="absolute top-1.5 left-1.5 rounded bg-background/90 p-1 cursor-grab active:cursor-grabbing shadow-sm opacity-80 group-hover:opacity-100"
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}

      {selectMode && (
        <div
          className="absolute top-1.5 left-1.5 rounded bg-background/95 p-1 shadow-sm"
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        >
          <Checkbox checked={selected} aria-label="Select photo" />
        </div>
      )}

      <div className={`absolute top-1.5 ${selectMode ? "left-10" : "left-9"}`}>
        <Badge className={`gap-1 border-0 ${meta.className}`}>
          <Icon className="h-3 w-3" />
          <span className="text-[10px] font-medium">{meta.label}</span>
        </Badge>
      </div>

      {!selectMode && (
        <div className="absolute top-1.5 right-1.5 flex gap-1 rounded-md bg-black/55 backdrop-blur-sm p-0.5 shadow-sm group-hover:bg-black/70 transition">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDownload(); }}
            className="rounded p-1 text-white hover:bg-white/15 transition"
            aria-label="Download photo"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="rounded p-1 text-red-300 hover:text-red-200 hover:bg-white/15 transition"
              aria-label="Delete photo"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}


      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-white">
        <p className="text-[10px] truncate">
          {photo.engineerName || "Unknown"} · {new Date(photo.timestamp).toLocaleDateString("en-GB")}
        </p>
        {photo.caption && <p className="text-[10px] text-white/70 truncate">{photo.caption}</p>}
      </div>
    </div>
  );
}

export default function JobPhotos({ jobId, engineers = [], isAdmin, canUpload = true, simpleFilters = false }: {
  jobId: string;
  engineers?: { id: string; name: string }[];
  isAdmin?: boolean;
  canUpload?: boolean;
  /** Engineer view: only ever offer All / WhatsApp / App tabs. */
  simpleFilters?: boolean;
}) {
  const { toast } = useToast();
  const { user, profile, orgId } = useAuth();
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [sourceFilter, setSourceFilter] = useState<"all" | Source>("all");
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const { uploading, uploadFilesAsSubmissions } = useFileUpload({ onComplete: () => load() });

  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepth = useRef(0);

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<PhotoItem[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canDeletePhoto = useCallback(
    (p: PhotoItem) => !!user && (isAdmin || (p.engineerId && p.engineerId === user.id)),
    [user, isAdmin],
  );

  const handleFiles = async (files: FileList | File[] | null, { imagesOnly = false }: { imagesOnly?: boolean } = {}) => {
    if (!files || !user) return;
    const arr = Array.from(files as ArrayLike<File>);
    if (arr.length === 0) return;
    let toUpload = arr;
    if (imagesOnly) {
      const images = arr.filter((f) => f.type.startsWith("image/"));
      const rejected = arr.length - images.length;
      if (rejected > 0) {
        toast({
          title: `Skipped ${rejected} non-image file${rejected === 1 ? "" : "s"}`,
          description: "Only image files can be dropped here.",
          variant: "destructive",
        });
      }
      if (images.length === 0) return;
      toUpload = images;
    }
    const uploaded = await uploadFilesAsSubmissions(toUpload, jobId, user.id);
    if (uploaded > 0) {
      toast({ title: `Uploaded ${uploaded} photo${uploaded === 1 ? "" : "s"}` });
    }
  };

  const dtHasFiles = (dt: DataTransfer | null) =>
    !!dt && Array.from(dt.types || []).includes("Files");

  const onDragEnter = (e: React.DragEvent) => {
    if (!canUpload || !dtHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragOver(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!canUpload || !dtHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!canUpload) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragOver(false);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!canUpload) return;
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragOver(false);
    handleFiles(e.dataTransfer?.files ?? null, { imagesOnly: true });
  };

  const engineerName = useCallback((uid?: string) => {
    if (!uid) return undefined;
    return engineers.find((e) => e.id === uid)?.name;
  }, [engineers]);

  const load = useCallback(async () => {
    setLoading(true);
    const meta = await fetchJobPhotoMeta(jobId);
    const out: PhotoItem[] = meta.map((p) => {
      // Legacy fallback only — historic WhatsApp media saved before the
      // intake stamped `whatsapp_message_id` kept a "whatsapp" filename.
      const isWa = p.source === "whatsapp" || /whatsapp/i.test(p.fileName || "");
      const source: Source = p.source === "defect"
        ? "defect"
        : p.source === "checklist"
          ? "checklist"
          : p.source === "document"
            ? "document"
            : isWa
              ? "whatsapp"
              : "app";

      const submissionMatch = p.id.match(/^sub:(.+)$/);
      return {
        id: p.id,
        submissionId: submissionMatch ? submissionMatch[1] : undefined,
        source,
        storagePath: toStoragePath(p.storagePath),
        fallbackUrl: p.fallbackUrl,
        fileName: p.fileName,
        caption: p.caption,
        engineerId: p.engineerId || undefined,
        engineerName: p.engineerName || engineerName(p.engineerId || undefined),
        timestamp: p.createdAt,
        displayOrder: p.displayOrder ?? null,
      };
    });

    out.sort((a, b) => {
      const ao = a.displayOrder ?? null;
      const bo = b.displayOrder ?? null;
      if (ao !== null && bo !== null) return ao - bo;
      if (ao !== null) return -1;
      if (bo !== null) return 1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    const signedUrls = await Promise.all(
      out.map((p) => createSubmissionPhotoSignedUrl(p.storagePath || p.fallbackUrl || "", jobId, 3600)),
    );

    setItems(out.map((p, i) => ({
      ...p,
      signedUrl: signedUrls[i]?.signedUrl || undefined,
    })));
    setLoading(false);
  }, [jobId, engineerName]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => sourceFilter === "all" ? items : items.filter((i) => i.source === sourceFilter),
    [items, sourceFilter]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const i of items) c[i.source] = (c[i.source] || 0) + 1;
    return c;
  }, [items]);

  // Prune stale ids from selection when filter/items change.
  useEffect(() => {
    if (!selectMode) return;
    setSelected((prev) => {
      const validIds = new Set(items.map((i) => i.id));
      const next = new Set<string>();
      prev.forEach((id) => { if (validIds.has(id)) next.add(id); });
      return next.size === prev.size ? prev : next;
    });
  }, [items, selectMode]);

  const download = async (p: PhotoItem) => {
    if (!p.signedUrl) return;
    try {
      const res = await fetch(p.signedUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = p.fileName || `photo-${p.id}.jpg`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message, variant: "destructive" });
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const currentIds = filtered.map((p) => p.id);
    const oldIndex = currentIds.indexOf(String(active.id));
    const newIndex = currentIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const reorderedFiltered = arrayMove(filtered, oldIndex, newIndex);

    const filteredIds = new Set(currentIds);
    const rest = items.filter((p) => !filteredIds.has(p.id));
    const nextItems = [...reorderedFiltered, ...rest];
    setItems(nextItems);

    const updates = reorderedFiltered
      .map((p, i) => ({ id: p.submissionId, display_order: (i + 1) * 10 }))
      .filter((u) => !!u.id) as Array<{ id: string; display_order: number }>;
    const siteResponseGroups = new Map<string, PhotoItem[]>();
    reorderedFiltered.forEach((p) => {
      const match = p.id.match(/^site:([^:]+):\d+$/);
      if (!match) return;
      const group = siteResponseGroups.get(match[1]) || [];
      group.push(p);
      siteResponseGroups.set(match[1], group);
    });
    if (updates.length === 0 && siteResponseGroups.size === 0) return;
    try {
      await Promise.all([
        ...updates.map((u) =>
          supabase.from("submissions").update({ display_order: u.display_order }).eq("id", u.id),
        ),
        ...Array.from(siteResponseGroups.entries()).map(async ([responseId, photos]) => {
          const { data } = await supabase
            .from("job_sheet_responses")
            .select("responses")
            .eq("id", responseId)
            .maybeSingle();
          const existing = ((data as any)?.responses || {}) as Record<string, any>;
          return supabase.from("job_sheet_responses").update({
            responses: {
              ...existing,
              _site_photo_urls: photos.map((p) => p.fallbackUrl || ""),
              _site_photo_paths: photos.map((p) => p.storagePath || ""),
              _site_photo_captions: photos.map((p) => p.caption || ""),
            } as any,
          } as any).eq("id", responseId);
        }),
      ]);
    } catch (e: any) {
      toast({ title: "Reorder failed", description: e?.message, variant: "destructive" });
    }
  };

  // ---------- Deletion ----------

  /**
   * Return true if any photo record OTHER than the ones in `excludeIds`
   * still references the given storage path. If so, we must keep the
   * storage object — deleting it would break the sibling record's tile
   * (the "Unavailable" bug we saw on the ABCA job).
   */
  const otherReferencesExist = async (storagePath: string, excludeIds: Set<string>): Promise<boolean> => {
    const raw = storagePath.replace(/^\/+/, "");
    // Match either the raw or org-prefixed form of the path.
    const tail = raw.split("/").slice(-3).join("/");
    const like = `%${tail}%`;
    const excludedSubIds = [...excludeIds]
      .filter((id) => id.startsWith("sub:"))
      .map((id) => id.slice(4));
    const excludedDocIds = [...excludeIds]
      .filter((id) => id.startsWith("doc:"))
      .map((id) => id.slice(4));
    try {
      const [subs, docs] = await Promise.all([
        supabase
          .from("submissions")
          .select("id", { count: "exact", head: true })
          .ilike("file_url", like)
          .not("id", "in", `(${excludedSubIds.length ? excludedSubIds.map((i) => `"${i}"`).join(",") : '""'})`),
        supabase
          .from("job_documents")
          .select("id", { count: "exact", head: true })
          .ilike("file_url", like)
          .not("id", "in", `(${excludedDocIds.length ? excludedDocIds.map((i) => `"${i}"`).join(",") : '""'})`),
      ]);
      if ((subs.count ?? 0) > 0) return true;
      if ((docs.count ?? 0) > 0) return true;
    } catch {
      // On error, err on the side of safety and treat as "other reference exists".
      return true;
    }
    // Also check job_sheet_responses (site photo paths live inside JSON).
    try {
      const { data: sheetRows } = await supabase
        .from("job_sheet_responses")
        .select("id, responses")
        .eq("job_id", jobId);
      for (const r of (sheetRows || []) as any[]) {
        const paths = Array.isArray(r?.responses?._site_photo_paths) ? r.responses._site_photo_paths : [];
        const urls = Array.isArray(r?.responses?._site_photo_urls) ? r.responses._site_photo_urls : [];
        const any = [...paths, ...urls].some((v: string) => typeof v === "string" && v.includes(tail));
        if (any) return true;
      }
    } catch {
      return true;
    }
    return false;
  };

  const removePhotoStorageIfOrphan = async (p: PhotoItem, excludeIds: Set<string>) => {
    if (!p.storagePath) return;
    if (await otherReferencesExist(p.storagePath, excludeIds)) return; // shared — keep object
    const paths = new Set<string>([p.storagePath.replace(/^\/+/, "")]);
    if (orgId && !p.storagePath.startsWith(`${orgId}/`)) {
      paths.add(`${orgId}/${p.storagePath.replace(/^\/+/, "")}`);
    }
    try {
      await supabase.storage.from("submissions").remove([...paths]);
    } catch {
      // storage may be missing; carry on so the record still goes away
    }
  };

  const deletePhotoRecord = async (p: PhotoItem) => {
    if (p.id.startsWith("sub:")) {
      const id = p.id.slice(4);
      await supabase.from("submissions").delete().eq("id", id);
      return;
    }
    if (p.id.startsWith("site:")) {
      const [, respId, idxStr] = p.id.split(":");
      const idx = Number(idxStr);
      const { data } = await supabase
        .from("job_sheet_responses")
        .select("responses")
        .eq("id", respId)
        .maybeSingle();
      const responses = ((data as any)?.responses || {}) as Record<string, any>;
      const drop = (k: string) =>
        Array.isArray(responses[k]) ? responses[k].filter((_: any, i: number) => i !== idx) : responses[k];
      const next = {
        ...responses,
        _site_photo_urls: drop("_site_photo_urls"),
        _site_photo_paths: drop("_site_photo_paths"),
        _site_photo_captions: drop("_site_photo_captions"),
      };
      await supabase.from("job_sheet_responses").update({ responses: next } as any).eq("id", respId);
      return;
    }
    if (p.id.startsWith("def:")) {
      const [, defId, idxStr] = p.id.split(":");
      const idx = Number(idxStr);
      const { data } = await supabase
        .from("defects")
        .select("photo_url, photos")
        .eq("id", defId)
        .maybeSingle();
      const photos = Array.isArray((data as any)?.photos) ? [...(data as any).photos] : [];
      let photoUrl: string | null = (data as any)?.photo_url ?? null;
      // Loader ordering is [photo_url, ...photos]; but when photo_url is null,
      // index 0 becomes photos[0]. Reconstruct the same ordering:
      const combined: Array<{ src: "col" | "arr"; arrIdx?: number }> = [];
      if (photoUrl) combined.push({ src: "col" });
      photos.forEach((_, i) => combined.push({ src: "arr", arrIdx: i }));
      const target = combined[idx];
      if (target?.src === "col") photoUrl = null;
      else if (target?.src === "arr" && typeof target.arrIdx === "number") photos.splice(target.arrIdx, 1);
      await supabase.from("defects").update({ photo_url: photoUrl, photos } as any).eq("id", defId);
      return;
    }
    if (p.id.startsWith("chk:")) {
      const [, chkId, idxStr] = p.id.split(":");
      const idx = Number(idxStr);
      const col = idx === 0 ? "photo_url" : idx === 1 ? "before_photo_url" : "after_photo_url";
      await supabase.from("job_photo_checklist_responses").update({ [col]: null } as any).eq("id", chkId);
      return;
    }
    if (p.id.startsWith("doc:")) {
      const id = p.id.slice(4);
      await supabase.from("job_documents").delete().eq("id", id);
      return;
    }
  };

  const logDeletion = async (p: PhotoItem) => {
    if (!user) return;
    const actorName = profile?.full_name || user.email || "User";
    const detailBits = [
      `by ${actorName}`,
      p.fileName ? `file: ${p.fileName}` : null,
      p.caption ? `caption: ${p.caption}` : null,
      `source: ${sourceMeta(p.source).label}`,
    ].filter(Boolean);
    try {
      await supabase.from("job_activity_log").insert({
        job_id: jobId,
        user_id: user.id,
        ...(orgId ? { org_id: orgId } : {}),
        action: "photo_removed",
        details: `Photo removed ${detailBits.join(" · ")}`,
      } as any);
    } catch {
      // logging must never block a successful delete
    }
  };

  const runDelete = async (targets: PhotoItem[]) => {
    if (!user || targets.length === 0) return;
    setDeleting(true);
    const targetIds = new Set(targets.map((t) => t.id));
    // Optimistic UI update
    setItems((prev) => prev.filter((p) => !targetIds.has(p.id)));
    let ok = 0;
    let fail = 0;
    const deletedPaths: PhotoItem[] = [];
    // Step 1: delete records first so the reference check can see the new state.
    for (const p of targets) {
      if (!canDeletePhoto(p)) { fail++; continue; }
      try {
        await deletePhotoRecord(p);
        await logDeletion(p);
        deletedPaths.push(p);
        ok++;
      } catch (e: any) {
        fail++;
        // eslint-disable-next-line no-console
        console.error("Photo record delete failed", p.id, e);
      }
    }
    // Step 2: for each unique storage path we deleted, only remove the object
    // if no other photo record still references it. This is the fix for the
    // "Unavailable" bug — a shared storage object must survive deletion of
    // one of its referencing records.
    const seenPaths = new Set<string>();
    for (const p of deletedPaths) {
      if (!p.storagePath) continue;
      const key = p.storagePath.replace(/^\/+/, "").toLowerCase();
      if (seenPaths.has(key)) continue;
      seenPaths.add(key);
      await removePhotoStorageIfOrphan(p, new Set());
    }
    setDeleting(false);
    setPendingDelete(null);
    setSelected(new Set());
    if (ok > 0) toast({ title: `Deleted ${ok} photo${ok === 1 ? "" : "s"}` });
    if (fail > 0) toast({ title: `${fail} photo${fail === 1 ? "" : "s"} failed to delete`, variant: "destructive" });
    // Re-sync from source of truth (also re-signs URLs)
    await load();
  };

  // ---------- Selection helpers ----------

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectableInFilter = useMemo(
    () => filtered.filter(canDeletePhoto),
    [filtered, canDeletePhoto],
  );
  const allFilterSelected =
    selectableInFilter.length > 0 && selectableInFilter.every((p) => selected.has(p.id));
  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (allFilterSelected) {
        const next = new Set(prev);
        selectableInFilter.forEach((p) => next.delete(p.id));
        return next;
      }
      const next = new Set(prev);
      selectableInFilter.forEach((p) => next.add(p.id));
      return next;
    });
  };
  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()); };

  // Only surface a source tab when that source actually has photos on this
  // job. An empty job shows no filter row at all. Engineers get a reduced
  // set (App / WhatsApp) — they don't need Docs/Checklist slicing.
  const allowedSources: Source[] = simpleFilters
    ? ["whatsapp", "app"]
    : ["whatsapp", "app", "defect", "checklist", "document"];
  const labels: Record<Source, string> = {
    whatsapp: "WhatsApp",
    app: "App",
    defect: "Defects",
    checklist: "Checklist",
    document: "Docs",
  };
  const filters: Array<{ key: "all" | Source; label: string }> = useMemo(() => {
    const present = allowedSources.filter((s) => (counts[s] || 0) > 0);
    if (present.length === 0) return [];
    return [{ key: "all" as const, label: "All" }, ...present.map((s) => ({ key: s, label: labels[s] }))];
  }, [counts, simpleFilters]);

  // If the active tab's source vanished (last photo deleted), fall back to All.
  useEffect(() => {
    if (sourceFilter !== "all" && !filters.some((f) => f.key === sourceFilter)) {
      setSourceFilter("all");
    }
  }, [filters, sourceFilter]);


  const selectedItems = useMemo(
    () => items.filter((p) => selected.has(p.id)),
    [items, selected],
  );

  return (
    <div
      className={`relative space-y-4 rounded-lg transition-colors ${
        isDragOver ? "outline outline-2 outline-primary/60 outline-offset-4" : ""
      }`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragOver && canUpload && (
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[1px]">
          <Upload className="h-8 w-8 text-primary" />
          <p className="text-sm font-medium text-primary">Drop photos to add to this job</p>
          <p className="text-xs text-primary/70">Images only · multi-file supported</p>
        </div>
      )}
      {uploading && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Uploading photos…</span>
        </div>
      )}
      {canUpload && (
        <div className="flex flex-wrap gap-2 rounded-lg border border-dashed bg-muted/30 p-3">
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.currentTarget.value = ""; }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*,application/pdf,video/*"
            multiple
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.currentTarget.value = ""; }}
          />
          <Button
            size="sm"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Camera className="mr-1.5 h-4 w-4" />}
            Take photo
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => galleryInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="mr-1.5 h-4 w-4" /> Upload from gallery
          </Button>
          <p className="text-xs text-muted-foreground self-center">Photos are attached to this job as evidence.</p>
        </div>
      )}

      <div className={`flex flex-wrap items-center gap-2 ${items.length === 0 ? "hidden" : ""}`}>
        {filters.map((f) => (
          <Button
            key={f.key}
            variant={sourceFilter === f.key ? "secondary" : "outline"}
            size="sm"
            onClick={() => setSourceFilter(f.key)}
            className="h-8"
          >
            {f.label}
            {counts[f.key] ? (
              <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 justify-center px-1.5 text-[10px]">
                {counts[f.key]}
              </Badge>
            ) : null}
          </Button>
        ))}
        <div className="ml-auto">
          {selectMode ? (
            <Button size="sm" variant="ghost" onClick={exitSelectMode} className="h-8">
              <X className="mr-1.5 h-4 w-4" /> Cancel
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectMode(true)}
              className="h-8"
              disabled={items.length === 0}
            >
              <CheckSquare className="mr-1.5 h-4 w-4" /> Select
            </Button>
          )}
        </div>
      </div>

      {selectMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <Button
            size="sm"
            variant="outline"
            onClick={toggleSelectAll}
            disabled={selectableInFilter.length === 0}
            className="h-8"
          >
            {allFilterSelected ? "Clear selection" : `Select all (${selectableInFilter.length})`}
          </Button>
          <span className="text-muted-foreground">
            {selected.size} selected
          </span>
          <div className="ml-auto">
            <Button
              size="sm"
              variant="destructive"
              disabled={selected.size === 0 || deleting}
              onClick={() => setPendingDelete(selectedItems)}
              className="h-8"
            >
              {deleting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
              Delete selected ({selected.size})
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground border border-dashed rounded-md">
          <p>{items.length === 0 ? "No photos on this job yet." : "No photos match this filter."}</p>
          {canUpload && items.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground/80">Drag & drop images here, or use the buttons above.</p>
          )}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filtered.map((p) => p.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
              {filtered.map((p, idx) => (
                <SortablePhotoTile
                  key={p.id}
                  photo={p}
                  onOpen={() => setLightboxIdx(idx)}
                  onDownload={() => download(p)}
                  onDelete={() => setPendingDelete([p])}
                  canDelete={canDeletePhoto(p)}
                  selectMode={selectMode}
                  selected={selected.has(p.id)}
                  onToggleSelect={() => canDeletePhoto(p) && toggleSelect(p.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <PhotoLightbox
        photos={filtered.map((p) => ({
          id: p.id,
          url: p.signedUrl || "",
          fileName: p.caption || p.fileName || sourceMeta(p.source).label,
          date: p.timestamp,
          engineer: p.engineerName,
          source: sourceMeta(p.source).label,
          downloadUrl: p.signedUrl,
          downloadName: p.fileName,
        }))}
        currentIndex={lightboxIdx ?? 0}
        open={lightboxIdx !== null}
        onOpenChange={(o) => !o && setLightboxIdx(null)}
        onIndexChange={(i) => setLightboxIdx(i)}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => { if (!o && !deleting) setPendingDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {pendingDelete?.length === 1 ? "photo" : `${pendingDelete?.length ?? 0} photos`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {pendingDelete?.length === 1 ? "this photo" : "these photos"} from the job,
              the report editor, and any generated reports. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); if (pendingDelete) runDelete(pendingDelete); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
