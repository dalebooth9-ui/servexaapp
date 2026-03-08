import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export default function Offline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    // Auto-redirect when connectivity returns
    if (isOnline) window.location.href = "/";
  }, [isOnline]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <WifiOff className="h-10 w-10 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">You're offline</h1>
          <p className="text-muted-foreground">
            No internet connection detected. Your cached jobs and templates are still available — reconnect to sync changes.
          </p>
        </div>
        <Button
          className="w-full"
          onClick={() => {
            if (navigator.onLine) window.location.href = "/";
            else window.location.reload();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
        <p className="text-xs text-muted-foreground">
          {isOnline ? "Connection restored — redirecting…" : "Waiting for connection…"}
        </p>
      </div>
    </div>
  );
}
