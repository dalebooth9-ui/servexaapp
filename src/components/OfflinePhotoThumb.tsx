/**
 * OfflinePhotoThumb — Render a thumbnail for a photo that is still sitting
 * in the local IndexedDB upload queue. Shows a "Pending upload" badge and a
 * tiny progress bar driven by photoQueue subscriptions.
 */
import { useEffect, useState } from "react";
import { CloudUpload, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPhoto, subscribePhotoQueue, type PhotoQueueItem } from "@/lib/photoQueue";

type Props = {
  queueId: string;
  className?: string;
  alt?: string;
};

export default function OfflinePhotoThumb({ queueId, className, alt }: Props) {
  const [item, setItem] = useState<PhotoQueueItem | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    void getPhoto(queueId).then((p) => {
      if (cancelled || !p) return;
      setItem(p);
      objectUrl = URL.createObjectURL(p.blob);
      setUrl(objectUrl);
    });
    const unsub = subscribePhotoQueue((all) => {
      const found = all.find((i) => i.id === queueId) || null;
      setItem(found);
      if (!found && objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
        setUrl(null);
      }
    });
    return () => {
      cancelled = true;
      unsub();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [queueId]);

  if (!url) return null;
  const pct = Math.round((item?.progress ?? 0) * 100);
  const failed = item?.status === "failed";

  return (
    <div className={cn("relative overflow-hidden rounded-md border border-border", className)}>
      <img src={url} alt={alt || "Pending upload"} className="h-full w-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-background/85 px-2 py-1 text-[10px] font-medium">
        {failed ? (
          <>
            <AlertCircle className="h-3 w-3 text-destructive" />
            <span className="text-destructive">Upload failed</span>
          </>
        ) : (
          <>
            <CloudUpload className="h-3 w-3 animate-pulse text-muted-foreground" />
            <span className="text-muted-foreground">Pending {pct ? `· ${pct}%` : ""}</span>
          </>
        )}
      </div>
    </div>
  );
}
