import { useEffect, useState } from "react";
import { WifiOff, Wifi, CloudUpload } from "lucide-react";
import { toast } from "sonner";
import { getOfflineCache, CACHE_KEYS } from "@/hooks/useOfflineSync";
import { subscribeQueueSize } from "@/lib/syncQueue";
import { format, parseISO } from "date-fns";

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBack, setShowBack] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowBack(true);
      toast.success("Back online — syncing your data");
      setTimeout(() => setShowBack(false), 4000);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const unsub = subscribeQueueSize(setPending);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsub();
    };
  }, []);

  const lastSync = getOfflineCache<string>(CACHE_KEYS.LAST_SYNC);

  // Online, no queue, no transition → render nothing
  if (isOnline && !showBack && pending === 0) return null;

  if (showBack) {
    return (
      <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
        <div className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2">
          <Wifi className="h-4 w-4" />
          Back online — syncing your data
          {pending > 0 && <span className="ml-1 rounded-full bg-accent-foreground/20 px-2 py-0.5 text-xs">{pending}</span>}
        </div>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
        <div className="flex items-center gap-2 rounded-full bg-warning px-4 py-2 text-sm font-medium text-warning-foreground shadow-lg">
          <WifiOff className="h-4 w-4" />
          <span>
            Working offline — your data is saved locally
            {pending > 0 && <span className="ml-1 opacity-90">· {pending} pending sync</span>}
            {lastSync && (
              <span className="ml-1 opacity-80 text-xs">
                · cached {format(parseISO(lastSync), "HH:mm")}
              </span>
            )}
          </span>
        </div>
      </div>
    );
  }

  // Online with queued items still draining
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm font-medium text-muted-foreground shadow-lg">
        <CloudUpload className="h-4 w-4 animate-pulse" />
        {pending} item{pending === 1 ? "" : "s"} pending sync
      </div>
    </div>
  );
}
