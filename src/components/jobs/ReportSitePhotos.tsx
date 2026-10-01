import { useEffect, useMemo, useState } from "react";
import { Images, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useLiveJobPhotos } from "@/hooks/useLiveJobPhotos";
import { createSubmissionPhotoSignedUrl, type JobPhoto } from "@/lib/jobPhotos";
import { formatTaken, isCustomerBlocked, sitePhotoKey } from "@/lib/reportSitePhotos";

type Props = {
  jobId: string;
  excluded: string[];
  onChange?: (next: string[]) => void;
  readOnly?: boolean;
};

function Thumb({ photo, jobId }: { photo: JobPhoto; jobId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const ref = photo.bucket ? `storage://${photo.bucket}/${photo.storagePath}` : (photo.fallbackUrl || photo.storagePath);
    void createSubmissionPhotoSignedUrl(ref, jobId, 3600).then((r) => {
      if (alive) setUrl(r?.signedUrl || photo.fallbackUrl || null);
    });
    return () => { alive = false; };
  }, [photo, jobId]);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <img src={url} alt={photo.caption || photo.fileName} loading="lazy" className="aspect-[4/3] w-full rounded border object-cover" />
    </a>
  ) : (
    <div className="flex aspect-[4/3] w-full items-center justify-center rounded border bg-muted">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function ReportSitePhotos({ jobId, excluded, onChange, readOnly }: Props) {
  const { photos, loading } = useLiveJobPhotos(jobId);
  const excludedSet = useMemo(() => new Set(excluded), [excluded]);
  const selectable = photos.filter((p) => !isCustomerBlocked(p));
  const includedCount = selectable.filter((p) => !excludedSet.has(sitePhotoKey(p, jobId))).length;

  const toggle = (p: JobPhoto, on: boolean) => {
    const key = sitePhotoKey(p, jobId);
    const next = new Set(excludedSet);
    if (on) next.delete(key); else next.add(key);
    onChange?.(Array.from(next));
  };

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Images className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Site photos</h3>
        <Badge variant="secondary" className="text-[11px]">{includedCount} of {selectable.length} on report</Badge>
        {!readOnly && selectable.length > 0 && (
          <div className="ml-auto flex gap-2">
            <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={() => onChange?.([])}>Select all</Button>
            <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={() => onChange?.(selectable.map((p) => sitePhotoKey(p, jobId)))}>Clear all</Button>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Every photo on this job appears here automatically, in the order taken. Switch off any you don't want on the customer report — they stay on the job for the office.
      </p>
      {loading && photos.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading photos…</div>
      ) : photos.length === 0 ? (
        <p className="text-xs text-muted-foreground">No photos on this job yet. New photos will appear here straight away.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p) => {
            const blocked = isCustomerBlocked(p);
            const on = !blocked && !excludedSet.has(sitePhotoKey(p, jobId));
            return (
              <div key={p.id} className={`space-y-1.5 ${on ? "" : "opacity-60"}`}>
                <Thumb photo={p} jobId={jobId} />
                <p className="text-[11px] text-muted-foreground">{formatTaken(p.createdAt)}{p.source === "whatsapp" ? " · WhatsApp" : ""}</p>
                {blocked ? (
                  <p className="flex min-h-10 items-center gap-1.5 text-[11px] text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Scanned sheet — office only</p>
                ) : (
                  <label className="flex min-h-10 cursor-pointer items-center justify-between gap-2 rounded-md border px-2 text-xs">
                    Include on report
                    <Switch checked={on} disabled={readOnly} onCheckedChange={(v) => toggle(p, v)} aria-label="Include on report" />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
