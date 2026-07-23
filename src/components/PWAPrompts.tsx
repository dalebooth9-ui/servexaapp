import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Download, RefreshCw, X } from "lucide-react";
import { setupPWA, setLastPromptedVersion, shouldPromptForUpdate } from "@/pwa/registerSW";
import { startVersionPolling } from "@/pwa/versionPoll";


type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pwa_install_dismissed_at";
const DISMISS_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

function recentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari
  if ((window.navigator as any).standalone === true) return true;
  return false;
}

export default function PWAPrompts() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [reload, setReload] = useState<null | (() => Promise<void>)>(null);

  // Set up service worker and subscribe to update events
  useEffect(() => {
    void setupPWA({
      onNeedRefresh: (doReload) => {
        const currentVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown";
        if (!shouldPromptForUpdate(currentVersion)) return;
        setLastPromptedVersion(currentVersion);
        setReload(() => doReload);
      },
      onOfflineReady: () => {
        toast.success("App ready to work offline");
      },
    });

    // Fallback for long-lived tabs where the SW update check is throttled:
    // poll /version.json and surface the same banner if a newer build ships.
    const stop = startVersionPolling((deployedVersion) => {
      const currentVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown";
      if (!shouldPromptForUpdate(deployedVersion)) return;
      setLastPromptedVersion(deployedVersion);
      setReload(() => async () => {
        // User-initiated reload only — never auto — so in-flight forms stay safe.
        void currentVersion;
        window.location.reload();
      });
    });
    return () => stop();
  }, []);


  // Capture the install prompt
  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setShowInstall(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt as EventListener);
    const onInstalled = () => {
      setShowInstall(false);
      setInstallEvent(null);
      toast.success("Servexa installed");
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt as EventListener);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismissInstall = () => {
    setShowInstall(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
  };

  const acceptInstall = async () => {
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
    } catch { /* ignore */ }
    setInstallEvent(null);
    setShowInstall(false);
  };

  return (
    <>
      {/* Install prompt */}
      <Dialog open={showInstall && !!installEvent} onOpenChange={(o) => { if (!o) dismissInstall(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" /> Install Servexa
            </DialogTitle>
            <DialogDescription>
              Install Servexa on your device for faster access and to keep working when you lose signal on site.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={dismissInstall}>
              <X className="h-4 w-4 mr-1" /> Not now
            </Button>
            <Button onClick={acceptInstall}>
              <Download className="h-4 w-4 mr-1" /> Install
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update prompt — bottom-right toast-style banner */}
      {reload && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border bg-card p-4 shadow-lg animate-in slide-in-from-bottom-2">
          <div className="flex items-start gap-3">
            <RefreshCw className="h-5 w-5 mt-0.5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">A new version of Servexa is available</p>
              <p className="text-xs text-muted-foreground mt-1">
                Update now to get the latest fixes and improvements.
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => { void reload(); }}>
                  Update now
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setReload(null)}>
                  Later
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
