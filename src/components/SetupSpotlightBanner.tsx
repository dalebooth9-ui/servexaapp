import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Rocket, X, ArrowLeft } from "lucide-react";
import { SETUP_STEPS } from "@/hooks/useSetupProgress";
import { cn } from "@/lib/utils";

/**
 * Sticky banner that appears when a page is opened from the Setup Guide
 * (via ?setup=<stepIndex>). Highlights the spotlight target if present and
 * shows a one-line instruction plus a "Back to setup" button.
 */
export default function SetupSpotlightBanner() {
  const location = useLocation();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  const params = new URLSearchParams(location.search);
  const raw = params.get("setup");
  const stepIndex = raw ? parseInt(raw, 10) : NaN;
  const step = SETUP_STEPS.find((s) => s.index === stepIndex) ?? null;

  // Reset dismissed when route/step changes
  useEffect(() => { setDismissed(false); }, [location.pathname, raw]);

  // Spotlight the target element by adding a temporary ring class
  useEffect(() => {
    if (!step?.spotlightSelector || dismissed) return;
    const HIGHLIGHT = ["ring-4", "ring-primary", "ring-offset-2", "rounded-md", "animate-pulse"];
    let el: HTMLElement | null = null;
    let cancelled = false;

    const attach = () => {
      el = document.querySelector<HTMLElement>(step.spotlightSelector!);
      if (el) {
        el.classList.add(...HIGHLIGHT);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Stop the pulse after a few seconds so it isn't distracting
        setTimeout(() => { el?.classList.remove("animate-pulse"); }, 4000);
      } else if (!cancelled) {
        // Element might not be mounted yet — retry briefly
        setTimeout(attach, 300);
      }
    };
    const t = setTimeout(attach, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
      el?.classList.remove(...HIGHLIGHT);
    };
  }, [step, dismissed, location.pathname]);

  if (!step || dismissed) return null;

  const clearParam = () => {
    const p = new URLSearchParams(location.search);
    p.delete("setup");
    navigate({ pathname: location.pathname, search: p.toString() ? `?${p}` : "" }, { replace: true });
    setDismissed(true);
  };

  return (
    <div className={cn(
      "sticky top-0 z-40 -mx-4 md:-mx-6 lg:-mx-8 mb-4 border-b bg-primary/10 backdrop-blur",
    )}>
      <div className="px-4 md:px-6 lg:px-8 py-2.5 flex items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <Rocket className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-primary uppercase tracking-wide">
            Setup · Step {step.index}
          </span>
        </div>
        <p className="text-sm text-foreground/90 flex-1 min-w-0 truncate">
          {step.spotlightInstruction}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate("/setup")}
          className="shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          Back to setup
        </Button>
        <button
          onClick={clearParam}
          className="text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
