import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useFileUpload } from "@/hooks/useFileUpload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Download, MessageCircle, Camera, AlertTriangle, ClipboardCheck, FileImage, Upload, Plus } from "lucide-react";
import PhotoLightbox from "@/components/PhotoLightbox";
import { extractStoragePath, isImageFile } from "@/lib/fileUtils";
import { resolveManyToSignedUrls } from "@/lib/durableStorageRef";

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
};

const BUCKET = "submissions";

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
  if (!fileUrl) return null;
  return extractStoragePath(fileUrl);
}

/**
 * Aggregates all photos on a job across every source:
 * submissions (WhatsApp / app uploads), defects, photo-checklist responses
 * and image-type job_documents. Read-only — nothing here mutates data.
 */
export default function JobPhotos({ jobId, engineers = [], isAdmin }: {
  jobId: string;
  engineers?: { id: string; name: string }[];
  isAdmin?: boolean;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [sourceFilter, setSourceFilter] = useState<"all" | Source>("all");

  const engineerName = useCallback((uid?: string) => {
    if (!uid) return undefined;
    return engineers.find((e) => e.id === uid)?.name;
  }, [engineers]);

  const load = useCallback(async () => {
    setLoading(true);
    const [subs, defects, checklists, docs] = await Promise.all([
      supabase.from("submissions")
        .select("id, engineer_id, type, file_url, file_name, content, source, created_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false }),
      supabase.from("defects")
        .select("id, reported_by, title, photo_url, photos, created_at")
        .eq("job_id", jobId),
      supabase.from("job_photo_checklist_responses")
        .select("id, captured_by, photo_url, before_photo_url, after_photo_url, notes, captured_at")
        .eq("job_id", jobId),
      supabase.from("job_documents")
        .select("id, created_by, file_url, file_name, label, created_at")
        .eq("job_id", jobId),
    ]);

    const out: PhotoItem[] = [];

    for (const s of (subs.data || []) as any[]) {
      const isPhoto = s.type === "photo" || (s.type === "document" && s.file_name && isImageFile(s.file_name));
      if (!isPhoto || !s.file_url) continue;
      const isWa = (s.source || "").toLowerCase().includes("whatsapp") || /whatsapp/i.test(s.file_name || "");
      out.push({
        id: `sub:${s.id}`,
        source: isWa ? "whatsapp" : "app",
        storagePath: toStoragePath(s.file_url),
        fallbackUrl: s.file_url,
        fileName: s.file_name,
        caption: s.content,
        engineerId: s.engineer_id,
        engineerName: engineerName(s.engineer_id),
        timestamp: s.created_at,
      });
    }

    for (const d of (defects.data || []) as any[]) {
      const urls: string[] = [];
      if (d.photo_url) urls.push(d.photo_url);
      if (Array.isArray(d.photos)) urls.push(...(d.photos as string[]).filter(Boolean));
      urls.forEach((u, i) => out.push({
        id: `def:${d.id}:${i}`,
        source: "defect",
        storagePath: toStoragePath(u),
        fallbackUrl: u,
        caption: d.title,
        engineerId: d.reported_by,
        engineerName: engineerName(d.reported_by),
        timestamp: d.created_at,
      }));
    }

    for (const c of (checklists.data || []) as any[]) {
      const entries: Array<[string | null, string]> = [
        [c.photo_url, c.notes || "Checklist photo"],
        [c.before_photo_url, "Before"],
        [c.after_photo_url, "After"],
      ];
      entries.forEach(([u, cap], i) => {
        if (!u) return;
        out.push({
          id: `chk:${c.id}:${i}`,
          source: "checklist",
          storagePath: toStoragePath(u),
          fallbackUrl: u,
          caption: cap,
          engineerId: c.captured_by,
          engineerName: engineerName(c.captured_by),
          timestamp: c.captured_at,
        });
      });
    }

    for (const d of (docs.data || []) as any[]) {
      if (!d.file_name || !isImageFile(d.file_name)) continue;
      out.push({
        id: `doc:${d.id}`,
        source: "document",
        storagePath: toStoragePath(d.file_url),
        fallbackUrl: d.file_url,
        fileName: d.file_name,
        caption: d.label,
        engineerId: d.created_by,
        engineerName: engineerName(d.created_by),
        timestamp: d.created_at,
      });
    }

    out.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Batch-sign. Most sources live in "submissions", but job_documents
    // may point at other buckets (e.g. "po-intake" for email attachments).
    // resolveManyToSignedUrls groups by bucket automatically.
    const rawRefs = out.map((p) => p.fallbackUrl || p.storagePath || null);
    const signedUrls = await resolveManyToSignedUrls(rawRefs, BUCKET, 3600);

    setItems(out.map((p, i) => ({
      ...p,
      signedUrl: signedUrls[i] || undefined,
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
          {filtered.map((p, idx) => {
            const meta = sourceMeta(p.source);
            const Icon = meta.icon;
            return (
              <div key={p.id} className="group relative rounded-lg overflow-hidden border bg-muted">
                <button
                  type="button"
                  onClick={() => setLightboxIdx(idx)}
                  className="block w-full aspect-square"
                  aria-label={p.caption || p.fileName || "Photo"}
                >
                  {p.signedUrl ? (
                    <img
                      src={p.signedUrl}
                      alt={p.caption || p.fileName || "Job photo"}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs">Unavailable</div>
                  )}
                </button>
                <div className="absolute top-1.5 left-1.5">
                  <Badge className={`gap-1 border-0 ${meta.className}`}>
                    <Icon className="h-3 w-3" />
                    <span className="text-[10px] font-medium">{meta.label}</span>
                  </Badge>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); download(p); }}
                  className="absolute top-1.5 right-1.5 rounded bg-background/90 p-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                  aria-label="Download photo"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-white">
                  <p className="text-[10px] truncate">
                    {p.engineerName || "Unknown"} · {new Date(p.timestamp).toLocaleDateString("en-GB")}
                  </p>
                  {p.caption && <p className="text-[10px] text-white/70 truncate">{p.caption}</p>}
                </div>
              </div>
            );
          })}
        </div>
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
