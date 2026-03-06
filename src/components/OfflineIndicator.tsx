import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { getOfflineCache, CACHE_KEYS } from "@/hooks/useOfflineSync";
import { format, parseISO } from "date-fns";

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBack, setShowBack] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowBack(true);
      setTimeout(() => setShowBack(false), 4000);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const lastSync = getOfflineCache<string>(CACHE_KEYS.LAST_SYNC);

  if (isOnline && !showBack) return null;

  if (showBack) {
    return (
      <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
        <div className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2">
          <Wifi className="h-4 w-4" />
          Back online — syncing data…
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full bg-warning px-4 py-2 text-sm font-medium text-warning-foreground shadow-lg">
        <WifiOff className="h-4 w-4" />
        <span>
          Offline mode
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
