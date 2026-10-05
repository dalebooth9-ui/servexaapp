import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Download, RefreshCw, X } from "lucide-react";
import { setupPWA, setLastPromptedVersion, shouldPromptForUpdate, reloadToLatest } from "@/pwa/registerSW";
import { startVersionPolling, fetchDeployedVersion } from "@/pwa/versionPoll";

// Screens with no form open (dashboard / job list) where the update notice may appear.
const QUIET_PATHS = new Set(["/", "/app", "/jobs"]);


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

  // Update notice rules: at most once per new version per device, never
  // over a form — held until the user is on the dashboard or job list.
  const location = useLocation();
  const [pending, setPending] = useState<null | { version: string; reload: () => Promise<void> }>(null);
  const running = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown";

  useEffect(() => {
    const offer = (version: string | null, doReload: () => Promise<void>) => {
      if (!version || version === running) return;
      if (!shouldPromptForUpdate(version)) return; // already shown for this version
      setPending((cur) => (cur && cur.version === version ? cur : { version, reload: doReload }));
    };
    void setupPWA({
      onNeedRefresh: (doReload) => {
        // The waiting worker doesn't say which version it is; read it from version.json.
        void fetchDeployedVersion().then((v) => offer(v, doReload));
      },
      onOfflineReady: () => {
        toast.success("App ready to work offline");
      },
    });
    // Fallback for long-lived tabs where the SW update check is throttled.
    // A plain reload would be served the old cached build, so drop the worker first.
    const stop = startVersionPolling((deployedVersion) => offer(deployedVersion, reloadToLatest));
    return () => stop();
  }, [running]);

  const onQuietScreen = QUIET_PATHS.has(location.pathname);
  useEffect(() => {
    if (pending && onQuietScreen && !reload) {
      setLastPromptedVersion(pending.version); // shown once — never again for this version
      setReload(() => pending.reload);
    }
  }, [pending, onQuietScreen, reload]);

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
      {reload && onQuietScreen && (
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
                <Button size="sm" variant="ghost" onClick={() => { setReload(null); setPending(null); }}>
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
