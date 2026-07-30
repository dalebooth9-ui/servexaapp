import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useWhat3Words } from "@/hooks/useWhat3Words";
import { Button } from "@/components/ui/button";
import { Camera, Upload, Loader2, Trash2, MapPin, Pencil, ImageOff, RefreshCw } from "lucide-react";
import PhotoLightbox from "@/components/PhotoLightbox";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";

const BUCKET = "site-survey-media";

type Photo = {
  id: string;
  file_path: string;
  caption: string | null;
  what3words: string | null;
  captured_at: string;
  kind: string;
  signedUrl?: string;
};

export default function SiteSurveyPhotos({ surveyId }: { surveyId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { convert } = useWhat3Words();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * Sign the stored paths, falling back to the org-prefixed variant for
   * legacy rows written before the uploader persisted the scoped path.
   */
  const signUrls = useCallback(async (rows: Photo[]) => {
    if (!rows.length) return rows;
    const { data } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(rows.map((r) => r.file_path), 3600);
    const out = rows.map((r, i) => ({ ...r, signedUrl: data?.[i]?.signedUrl ?? undefined }));

    const missing = out.filter((r) => !r.signedUrl);
    if (missing.length) {
      const alt = await Promise.all(missing.map((r) => buildOrgPathAsync(r.file_path)));
      const { data: altData } = await supabase.storage.from(BUCKET).createSignedUrls(alt, 3600);
      missing.forEach((r, i) => {
        const url = altData?.[i]?.signedUrl;
        if (url) {
          const target = out.find((o) => o.id === r.id);
          if (target) target.signedUrl = url;
        }
      });
    }
    return out;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("site_survey_photos" as any)
      .select("id, file_path, caption, what3words, captured_at, kind")
      .eq("survey_id", surveyId)
      .order("captured_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load photos", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setBroken({});
    setPhotos(await signUrls((data as any[]) || []));
    setLoading(false);
  }, [surveyId, signUrls, toast]);

  useEffect(() => { load(); }, [load]);

  const retryOne = useCallback(async (p: Photo) => {
    setRetrying((r) => ({ ...r, [p.id]: true }));
    const [signed] = await signUrls([p]);
    setRetrying((r) => ({ ...r, [p.id]: false }));
    if (signed?.signedUrl) {
      setBroken((b) => ({ ...b, [p.id]: false }));
      setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, signedUrl: signed.signedUrl } : x)));
    } else {
      toast({
        title: "Image still unavailable",
        description: "The file hasn't finished uploading yet. Try again once you're back online.",
        variant: "destructive",
      });
    }
  }, [signUrls, toast]);

  const getW3W = (): Promise<string | null> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        async (pos) => resolve(await convert(pos.coords.latitude, pos.coords.longitude)),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    });

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || !user) return;
    setUploading(true);
    const w3w = await getW3W();
    let ok = 0;
    for (const file of Array.from(files)) {
      const path = `${surveyId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      // Persist the SAME (org-prefixed) path we uploaded to.
      const storedPath = await buildOrgPathAsync(path);
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(storedPath, file);
      if (upErr) {
        toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
        continue;
      }
      const { error: insErr } = await supabase.from("site_survey_photos" as any).insert({
        survey_id: surveyId,
        file_path: storedPath,
        kind: "photo",
        what3words: w3w,
        created_by: user.id,
      });
      if (insErr) toast({ title: "Save failed", description: insErr.message, variant: "destructive" });
      else ok++;
    }
    setUploading(false);
    if (ok) toast({ title: `${ok} photo(s) added`, description: w3w ? `📍 ${w3w}` : undefined });
    if (cameraRef.current) cameraRef.current.value = "";
    if (fileRef.current) fileRef.current.value = "";
    load();
  };

  const remove = async (p: Photo) => {
    if (!confirm("Delete this photo?")) return;
    await supabase.storage.from(BUCKET).remove([p.file_path]);
    await supabase.from("site_survey_photos" as any).delete().eq("id", p.id);
    load();
  };

  return (
    <div className="space-y-3">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => handleFiles(e.target.files)} />
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => handleFiles(e.target.files)} />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => cameraRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Camera className="h-3.5 w-3.5 mr-1.5" />}
          Take photo
        </Button>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload
        </Button>
        <span className="text-xs text-muted-foreground self-center">
          Photos auto-tag the What3Words location.
        </span>
      </div>

      {loading ? (
        <div className="py-6 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : photos.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">
          No photos yet. Capture site conditions, asset locations, hazards or sketches.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {photos.map((p, i) => {
            const isBroken = !p.signedUrl || broken[p.id];
            return (
              <div key={p.id} className="relative group rounded-md overflow-hidden border bg-muted">
                {isBroken ? (
                  <div className="w-full aspect-square flex flex-col items-center justify-center gap-1.5 p-2 text-center bg-muted">
                    <ImageOff className="h-5 w-5 text-muted-foreground" />
                    <span className="text-[11px] leading-tight text-muted-foreground">
                      Image still syncing or upload failed
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      className="h-8 px-2 text-[11px]"
                      disabled={retrying[p.id]}
                      onClick={() => retryOne(p)}
                    >
                      {retrying[p.id]
                        ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        : <RefreshCw className="h-3 w-3 mr-1" />}
                      Retry
                    </Button>
                  </div>
                ) : (
                  <button onClick={() => setLightboxIdx(i)} className="block w-full aspect-square">
                    <img
                      src={p.signedUrl}
                      alt={p.caption ?? "Survey photo"}
                      data-uploaded="true"
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={() => setBroken((b) => ({ ...b, [p.id]: true }))}
                    />
                  </button>
                )}
                {p.kind === "sketch" && (
                  <span className="absolute top-1 left-1 text-[10px] bg-primary text-primary-foreground rounded px-1.5 py-0.5 flex items-center gap-1">
                    <Pencil className="h-2.5 w-2.5" /> Sketch
                  </span>
                )}
                {p.what3words && (
                  <span className="absolute bottom-1 left-1 text-[10px] bg-background/90 rounded px-1.5 py-0.5 flex items-center gap-1 max-w-[90%] truncate">
                    <MapPin className="h-2.5 w-2.5" /> {p.what3words}
                  </span>
                )}
                <button
                  onClick={() => remove(p)}
                  className="absolute top-1 right-1 p-1 rounded bg-background/90 opacity-0 group-hover:opacity-100 transition"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <PhotoLightbox
        photos={photos.map((p) => ({ id: p.id, url: p.signedUrl || "", fileName: p.what3words || p.caption || undefined, date: p.captured_at }))}
        currentIndex={lightboxIdx ?? 0}
        open={lightboxIdx !== null}
        onOpenChange={(o) => !o && setLightboxIdx(null)}
        onIndexChange={(i) => setLightboxIdx(i)}
      />
    </div>
  );
}
