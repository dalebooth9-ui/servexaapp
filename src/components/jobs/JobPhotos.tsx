import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useFileUpload } from "@/hooks/useFileUpload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Download, MessageCircle, Camera, AlertTriangle, ClipboardCheck, FileImage, Upload, Plus, GripVertical } from "lucide-react";
import PhotoLightbox from "@/components/PhotoLightbox";
import { createSubmissionPhotoSignedUrl, fetchJobPhotoMeta } from "@/lib/jobPhotos";
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter,
  useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  /** Manual ordering (submissions only). Lower = earlier. */
  displayOrder?: number | null;
  /** Row id in `submissions` if source is submission-backed. */
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
  index,
  onOpen,
  onDownload,
}: {
  photo: PhotoItem;
  index: number;
  onOpen: () => void;
  onDownload: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: photo.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: "none",
  };
  const meta = sourceMeta(photo.source);
  const Icon = meta.icon;
  return (
    <div ref={setNodeRef} style={style} className="group relative rounded-lg overflow-hidden border bg-muted">
      <button
        type="button"
        onClick={onOpen}
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
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="absolute top-1.5 left-1.5 rounded bg-background/90 p-1 cursor-grab active:cursor-grabbing shadow-sm opacity-80 group-hover:opacity-100"
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      <div className="absolute top-1.5 left-9">
        <Badge className={`gap-1 border-0 ${meta.className}`}>
          <Icon className="h-3 w-3" />
          <span className="text-[10px] font-medium">{meta.label}</span>
        </Badge>
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDownload(); }}
        className="absolute top-1.5 right-1.5 rounded bg-background/90 p-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
        aria-label="Download photo"
      >
        <Download className="h-3.5 w-3.5" />
      </button>
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-white">
        <p className="text-[10px] truncate">
          {photo.engineerName || "Unknown"} · {new Date(photo.timestamp).toLocaleDateString("en-GB")}
        </p>
        {photo.caption && <p className="text-[10px] text-white/70 truncate">{photo.caption}</p>}
      </div>
    </div>
  );
}

/**
 * Aggregates all photos on a job across every source:
 * submissions (WhatsApp / app uploads), defects, photo-checklist responses
 * and image-type job_documents. Read-only — nothing here mutates data.
 */
export default function JobPhotos({ jobId, engineers = [], isAdmin, canUpload = true }: {
  jobId: string;
  engineers?: { id: string; name: string }[];
  isAdmin?: boolean;
  /** Set false to hide the "Add photo" / "Upload" buttons (e.g. cancelled jobs). */
  canUpload?: boolean;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [sourceFilter, setSourceFilter] = useState<"all" | Source>("all");
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const { uploading, uploadFilesAsSubmissions } = useFileUpload({ onComplete: () => load() });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !user) return;
    const arr = Array.from(files);
    const uploaded = await uploadFilesAsSubmissions(arr, jobId, user.id);
    if (uploaded > 0) {
      toast({ title: `Uploaded ${uploaded} photo${uploaded === 1 ? "" : "s"}` });
    }
  };

  const engineerName = useCallback((uid?: string) => {
    if (!uid) return undefined;
    return engineers.find((e) => e.id === uid)?.name;
  }, [engineers]);

  const load = useCallback(async () => {
    setLoading(true);
    const meta = await fetchJobPhotoMeta(jobId);
    const out: PhotoItem[] = meta.map((p) => {
      const isWa = /whatsapp/i.test(p.fileName || "");
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

    // Rebuild the full items list: put the reordered filtered view first
    // (respecting the new order) then any items not in the current filter.
    const filteredIds = new Set(currentIds);
    const rest = items.filter((p) => !filteredIds.has(p.id));
    const nextItems = [...reorderedFiltered, ...rest];
    setItems(nextItems);

    // Persist display_order for submission-backed items in the reordered
    // view. Non-submission sources (defect / checklist / document) keep
    // their created_at ordering — we can't write display_order there.
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
        ...Array.from(siteResponseGroups.entries()).map(([responseId, photos]) =>
          supabase.from("job_sheet_responses").update({
            responses: {
              _site_photo_urls: photos.map((p) => p.fallbackUrl || ""),
              _site_photo_paths: photos.map((p) => p.storagePath || ""),
              _site_photo_captions: photos.map((p) => p.caption || ""),
            } as any,
          } as any).eq("id", responseId),
        ),
      ]);
    } catch (e: any) {
      toast({ title: "Reorder failed", description: e?.message, variant: "destructive" });
    }
  };

  const filters: Array<{ key: "all" | Source; label: string }> = [
    { key: "all", label: "All" },
    { key: "whatsapp", label: "WhatsApp" },
    { key: "app", label: "App" },
    { key: "defect", label: "Defects" },
    { key: "checklist", label: "Checklist" },
    { key: "document", label: "Docs" },
  ];

  return (
    <div className="space-y-4">
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

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Button
            key={f.key}
            variant={sourceFilter === f.key ? "secondary" : "outline"}
            size="sm"
            onClick={() => setSourceFilter(f.key)}
            className="h-8"
          >
            {f.label}
            {counts[f.key] ? <span className="ml-1.5 text-xs text-muted-foreground">({counts[f.key]})</span> : null}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground border border-dashed rounded-md">
          {items.length === 0 ? "No photos on this job yet." : "No photos match this filter."}
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filtered.map((p) => p.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
              {filtered.map((p, idx) => (
                <SortablePhotoTile
                  key={p.id}
                  photo={p}
                  index={idx}
                  onOpen={() => setLightboxIdx(idx)}
                  onDownload={() => download(p)}
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
    </div>
  );
}
