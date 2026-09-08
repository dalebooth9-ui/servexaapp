import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { WifiOff, Wifi, CloudUpload } from "lucide-react";
import { toast } from "sonner";
import { getOfflineCache, CACHE_KEYS } from "@/hooks/useOfflineSync";
import { subscribeQueueSize } from "@/lib/syncQueue";
import { subscribePhotoQueue } from "@/lib/photoQueue";
import { subscribeReportQueue } from "@/lib/reportSubmissionQueue";
import { format, parseISO } from "date-fns";
import { useConnectivity } from "@/hooks/useConnectivity";

export default function OfflineIndicator() {
  const { isOnline } = useConnectivity();
  const [showBack, setShowBack] = useState(false);
  const [mutations, setMutations] = useState(0);
  const [photos, setPhotos] = useState(0);
  const [reports, setReports] = useState(0);
  const [wasOffline, setWasOffline] = useState(!isOnline);

  const pending = mutations + photos + reports;

  useEffect(() => {
    if (isOnline && wasOffline) {
      setShowBack(true);
      toast.success("Back online — sending anything that was waiting");
      const t = setTimeout(() => setShowBack(false), 4000);
      setWasOffline(false);
      return () => clearTimeout(t);
    }
    if (!isOnline && !wasOffline) {
      setWasOffline(true);
    }
  }, [isOnline, wasOffline]);

  useEffect(() => {
    const u1 = subscribeQueueSize(setMutations);
    const u2 = subscribePhotoQueue((items) => setPhotos(items.length));
    const u3 = subscribeReportQueue((items) => setReports(items.length));
    return () => { u1(); u2(); u3(); };
  }, []);

  const lastSync = getOfflineCache<string>(CACHE_KEYS.LAST_SYNC);

  const waitingLabel = `${pending} item${pending === 1 ? "" : "s"} waiting for signal`;

  // Persistent top banner while offline — clearly visible, non-blocking.
  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="sticky top-0 z-50 w-full border-b border-warning/40 bg-warning text-warning-foreground shadow-sm"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-sm font-medium">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            No signal — your work is saved on this device and will send automatically.
            {pending > 0 && (
              <Link to="/sync-status" className="ml-1 underline underline-offset-2">
                · {waitingLabel}
              </Link>
            )}
            {lastSync && (
              <span className="ml-2 text-xs opacity-80">
                Last synced {format(parseISO(lastSync), "HH:mm")}
              </span>
            )}
          </span>
        </div>
      </div>
    );
  }

  if (showBack) {
    return (
      <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
        <div className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2">
          <Wifi className="h-4 w-4" />
          Back online — sending your work
          {pending > 0 && (
            <span className="ml-1 rounded-full bg-accent-foreground/20 px-2 py-0.5 text-xs">{pending}</span>
          )}
        </div>
      </div>
    );
  }

  if (pending > 0) {
    return (
      <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
        <Link
          to="/sync-status"
          className="flex min-h-11 items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm font-medium text-muted-foreground shadow-lg"
        >
          <CloudUpload className="h-4 w-4 animate-pulse" />
          {waitingLabel}
          {reports > 0 && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
              {reports} report{reports === 1 ? "" : "s"}
            </span>
          )}
        </Link>
      </div>
    );
  }

  return null;
}
