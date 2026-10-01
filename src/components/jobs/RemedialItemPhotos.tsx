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
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";
import { compressImageForUpload } from "@/lib/imageCompress";
import { buildDurableRef } from "@/lib/durableStorageRef";
import type { JobPhoto } from "@/lib/jobPhotos";
import JobPhotoSlot from "@/components/jobs/JobPhotoSlot";


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
  const [uploading, setUploading] = useState<Slot | null>(null);

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

  const resolveOrgId = async (): Promise<string | null> => {
    if (jobOrgId) return jobOrgId;
    const { data } = await supabase.from("jobs").select("org_id").eq("id", jobId).maybeSingle();
    return (data as any)?.org_id ?? null;
  };

  const saveSlot = async (slot: Slot, value: string | null) => {
    const column = slot === "before" ? "before_photo_url" : "after_photo_url";
    const { data: existing } = await supabase
      .from("job_photo_checklist_responses" as any)
      .select("id")
      .eq("remedial_item_id", itemId)
      .maybeSingle();

    if ((existing as any)?.id) {
      const { error } = await supabase
        .from("job_photo_checklist_responses" as any)
        .update({ [column]: value, captured_by: user?.id ?? null } as any)
        .eq("id", (existing as any).id);
      if (error) throw error;
    } else if (value) {
      const orgId = await resolveOrgId();
      if (!orgId) throw new Error("Could not determine the organisation for this job.");
      const { error } = await supabase.from("job_photo_checklist_responses" as any).insert({
        job_id: jobId,
        org_id: orgId,
        remedial_item_id: itemId,
        response_type: "before_after",
        [column]: value,
        captured_by: user?.id ?? null,
      } as any);
      if (error) throw error;
    }
    setPaths((prev) => ({ ...prev, [slot]: value }));
  };

  const handleFile = async (slot: Slot, file: File) => {
    setUploading(slot);
    try {
      const orgId = await resolveOrgId();
      if (!orgId) throw new Error("Could not determine the organisation for this job.");
      const compressed = await compressImageForUpload(file);
      const body = compressed || file;
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      // Store the SAME path we upload to (org-prefixed) — otherwise the photo
      // can never be found again.
      const path = await buildOrgPathAsync(`${jobId}/remedial-photos/${itemId}-${slot}-${Date.now()}.${ext}`);
      const { error: upErr } = await supabase.storage
        .from("submissions")
        .upload(path, body, { upsert: true, contentType: compressed ? "image/jpeg" : file.type });
      if (upErr) throw upErr;


      await saveSlot(slot, buildDurableRef("submissions", path));
      toast({ title: slot === "before" ? "Before photo saved" : "After photo saved" });
    } catch (err: any) {
      toast({ title: "Photo upload failed", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  const chooseJobPhoto = async (slot: Slot, photo: JobPhoto) => {
    setUploading(slot);
    try {
      await saveSlot(slot, buildDurableRef(photo.bucket || "submissions", photo.storagePath));
      toast({ title: `${slot === "before" ? "Before" : "After"} photo linked` });
    } catch (err: any) {
      toast({ title: "Photo link failed", description: err?.message || String(err), variant: "destructive" });
      throw err;
    } finally {
      setUploading(null);
    }
  };

  const removeSlot = async (slot: Slot) => {
    setUploading(slot);
    try {
      await saveSlot(slot, null);
      toast({ title: `${slot === "before" ? "Before" : "After"} photo removed`, description: "The original job photo was not deleted." });
    } catch (err: any) {
      toast({ title: "Couldn't remove photo", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  if (!canEdit && !paths.before && !paths.after) return null;

  return (
    <>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {(["before", "after"] as Slot[]).map((slot) => (
          <div key={slot} className="space-y-1.5">
            <p className="text-xs font-semibold uppercase text-muted-foreground">{slot}</p>
            <JobPhotoSlot
              jobId={jobId}
              label={`${slot === "before" ? "Before" : "After"} photo`}
              photoRef={paths[slot]}
              busy={uploading === slot}
              canEdit={canEdit}
              onFile={(file) => handleFile(slot, file)}
              onJobPhoto={(photo) => chooseJobPhoto(slot, photo)}
              onRemove={() => removeSlot(slot)}
            />
          </div>
        ))}
      </div>
    </>
  );
}
