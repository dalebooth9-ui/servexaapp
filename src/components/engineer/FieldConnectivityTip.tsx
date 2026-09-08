import { useState } from "react";
import { Wifi, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Small dismissible note shown on the engineer home to set expectations for
 * first-time field users: Servexa is web-based, so a tablet needs its own
 * data (SIM or hotspot) when site wifi isn't available. Dismissal is
 * persisted per-device so it doesn't nag on every launch.
 */
const KEY = "servexa_field_connectivity_tip_dismissed";

function initialDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export default function FieldConnectivityTip() {
  const [dismissed, setDismissed] = useState(initialDismissed);
  if (dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
      <div className="flex items-start gap-3">
        <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="flex-1 leading-snug">
          <p className="font-medium">No signal on site? Keep working.</p>
          <p className="text-muted-foreground mt-0.5">
            Your answers, photos and signatures are saved on this device and send
            automatically when you're back online. A SIM data plan or phone
            hotspot just means things send sooner.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground"
          onClick={dismiss}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
