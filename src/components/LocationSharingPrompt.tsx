import { useState } from "react";
import { MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEngineerLocation } from "@/hooks/useEngineerLocation";

/** One-time friendly ask, refusal help banner and the "Sharing location" indicator. */
export default function LocationSharingPrompt() {
  const { state, allow, decline } = useEngineerLocation();
  const [bannerHidden, setBannerHidden] = useState(false);

  return (
    <>
      <Dialog open={state === "ask"} onOpenChange={(o) => { if (!o) decline(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" />Share your location?</DialogTitle>
            <DialogDescription>
              Share your location with the office while you're working? It is only used for job planning, and only office admins can see it.
              It stops when you log out. Your phone will ask you to allow it next.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={decline}>Not now</Button>
            <Button onClick={allow}>Share location</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(state === "denied" || state === "declined") && !bannerHidden && (
        <div role="status" className="fixed bottom-3 left-3 right-3 z-40 mx-auto max-w-md rounded-lg border bg-card p-3 text-sm shadow-lg">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex-1">
              <p className="font-medium">Location sharing is off</p>
              {state === "denied" ? (
                <p className="text-muted-foreground">
                  Your phone has blocked location for servexaapp.com. iPhone: Settings › Privacy &amp; Security › Location Services › Safari Websites (or the Servexa app) › While Using. Android: tap the padlock next to the web address › Permissions › Location › Allow. Then reopen Servexa.
                </p>
              ) : (
                <p className="text-muted-foreground">The office can't see where you are for job planning.</p>
              )}
              {state === "declined" && <Button size="sm" className="mt-2" onClick={allow}>Share location</Button>}
            </div>
            <button aria-label="Hide" onClick={() => setBannerHidden(true)} className="text-muted-foreground"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {state === "sharing" && (
        <div role="status" aria-label="Sharing location" title="Your location is shared with the office for job planning while Servexa is open"
          className="fixed bottom-3 left-3 z-40 flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs shadow">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Sharing location
        </div>
      )}
    </>
  );
}
