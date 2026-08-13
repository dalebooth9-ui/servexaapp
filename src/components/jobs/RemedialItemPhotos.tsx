/**
 * RemedialItemPhotos — per-item Before / After photo capture for the remedial
 * works checklist.
 *
 * Photos are stored in the `submissions` bucket and recorded against the
 * remedial item in `job_photo_checklist_responses` (remedial_item_id), so they
 * surface in the job Photos section under the "Checklist" source and can be
 * paired before/after in the Remedial Works Report.
 *
 * Big touch targets (44px+) — engineers use this on a phone.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Camera, ImageIcon, Loader2 } from "lucide-react";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";
import { compressImageForUpload } from "@/lib/imageCompress";

type Props = {
  jobId: string;
  jobOrgId?: string | null;
  itemId: string;
  canEdit: boolean;
};

type Slot = "before" | "after";

export default function RemedialItemPhotos({ jobId, jobOrgId, itemId, canEdit }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [paths, setPaths] = useState<{ before: string | null; after: string | null }>({ before: null, after: null });
  const [urls, setUrls] = useState<{ before: string | null; after: string | null }>({ before: null, after: null });
  const [uploading, setUploading] = useState<Slot | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const beforeInput = useRef<HTMLInputElement>(null);
  const afterInput = useRef<HTMLInputElement>(null);
  const beforeGallery = useRef<HTMLInputElement>(null);
  const afterGallery = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("job_photo_checklist_responses" as any)
      .select("before_photo_url, after_photo_url")
      .eq("remedial_item_id", itemId)
      .maybeSingle();
    const row = (data || null) as unknown as { before_photo_url: string | null; after_photo_url: string | null } | null;
    setPaths({ before: row?.before_photo_url || null, after: row?.after_photo_url || null });
  }, [itemId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: { before: string | null; after: string | null } = { before: null, after: null };
      for (const slot of ["before", "after"] as Slot[]) {
        const p = paths[slot];
        if (!p) continue;
        const { data } = await supabase.storage.from("submissions").createSignedUrl(p, 3600);
        next[slot] = data?.signedUrl || null;
      }
      if (!cancelled) setUrls(next);
    })();
    return () => { cancelled = true; };
  }, [paths.before, paths.after]);

  const resolveOrgId = async (): Promise<string | null> => {
    if (jobOrgId) return jobOrgId;
    const { data } = await supabase.from("jobs").select("org_id").eq("id", jobId).maybeSingle();
    return (data as any)?.org_id ?? null;
  };

  const handleFile = async (slot: Slot, file: File) => {
    setUploading(slot);
    try {
      const orgId = await resolveOrgId();
      if (!orgId) throw new Error("Could not determine the organisation for this job.");
      const compressed = await compressImageForUpload(file);
      const body = compressed || file;
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${jobId}/remedial-photos/${itemId}-${slot}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("submissions")
        .upload(await buildOrgPathAsync(path), body, { upsert: true, contentType: compressed ? "image/jpeg" : file.type });
      if (upErr) throw upErr;

      const column = slot === "before" ? "before_photo_url" : "after_photo_url";
      const { data: existing } = await supabase
        .from("job_photo_checklist_responses" as any)
        .select("id")
        .eq("remedial_item_id", itemId)
        .maybeSingle();

      if ((existing as any)?.id) {
        const { error } = await supabase
          .from("job_photo_checklist_responses" as any)
          .update({ [column]: path, captured_by: user?.id ?? null } as any)
          .eq("id", (existing as any).id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("job_photo_checklist_responses" as any).insert({
          job_id: jobId,
          org_id: orgId,
          remedial_item_id: itemId,
          response_type: "before_after",
          [column]: path,
          captured_by: user?.id ?? null,
        } as any);
        if (error) throw error;
      }

      setPaths((prev) => ({ ...prev, [slot]: path }));
      toast({ title: slot === "before" ? "Before photo saved" : "After photo saved" });
    } catch (err: any) {
      toast({ title: "Photo upload failed", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  const slotButton = (
    slot: Slot,
    inputRef: React.RefObject<HTMLInputElement>,
    galleryRef: React.RefObject<HTMLInputElement>,
  ) => {
    const url = urls[slot];
    const busy = uploading === slot;
    const label = slot === "before" ? "Before photo" : "After photo";
    const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(slot, f);
      e.target.value = "";
    };
    return (
      <div className="flex items-center gap-2">
        <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
        {url && (
          <button
            type="button"
            onClick={() => setViewing(url)}
            className="h-11 w-11 shrink-0 overflow-hidden rounded-md border"
            title={`View ${label.toLowerCase()}`}
          >
            <img src={url} alt={label} className="h-full w-full object-cover" />
          </button>
        )}
        {canEdit && (
          <>
            <Button
              type="button"
              size="sm"
              variant={url ? "ghost" : "outline"}
              className="h-11 min-w-[7.5rem] px-3 text-xs"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Camera className="mr-1 h-4 w-4" />}
              {busy ? "Uploading…" : url ? `Retake ${slot}` : label}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-11 w-11 px-0"
              disabled={busy}
              title={`Choose ${label.toLowerCase()} from gallery`}
              aria-label={`Choose ${label.toLowerCase()} from gallery`}
              onClick={() => galleryRef.current?.click()}
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    );
  };

  if (!canEdit && !paths.before && !paths.after) return null;

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {slotButton("before", beforeInput, beforeGallery)}
        {slotButton("after", afterInput, afterGallery)}
      </div>
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl p-2">
          {viewing && <img src={viewing} alt="Checklist photo" className="max-h-[80vh] w-full object-contain" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
