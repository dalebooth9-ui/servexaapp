import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Cookie, X } from "lucide-react";
import { cn } from "@/lib/utils";

const COOKIE_KEY = "servexa_cookie_consent";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(COOKIE_KEY);
    if (!stored) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem(COOKIE_KEY, "accepted");
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem(COOKIE_KEY, "declined");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50",
        "bg-card border border-border rounded-2xl shadow-2xl p-5",
        "animate-in slide-in-from-bottom-4 duration-300"
      )}
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Cookie className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm mb-1">We use cookies</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We use essential cookies to keep you logged in and analyse anonymous usage to improve the product.
            No advertising cookies. See our{" "}
            <a href="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">
              Privacy Policy
            </a>{" "}
            for details.
          </p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={accept} className="h-7 text-xs px-3">
              Accept all
            </Button>
            <Button size="sm" variant="outline" onClick={decline} className="h-7 text-xs px-3">
              Essential only
            </Button>
          </div>
        </div>
        <button
          onClick={decline}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
