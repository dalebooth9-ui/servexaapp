import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const TOUR_DONE_KEY = "onboarding-tour-done";

interface TourStep {
  /** CSS selector for the target element */
  selector: string;
  /** Title shown in the tooltip */
  title: string;
  /** Description shown in the tooltip */
  description: string;
  /** Preferred placement */
  placement: "top" | "bottom" | "left" | "right";
}

const STEPS: TourStep[] = [
  {
    selector: '[data-tour="dashboard-heading"]',
    title: "Welcome to Servexa!",
    description: "This is your command centre. KPIs, scheduled jobs, and recent activity all live here.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="quick-actions"]',
    title: "Quick Actions",
    description: "Create jobs, customers, quotes, or import files — all in one click from the dashboard.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="nav-jobs"]',
    title: "Jobs",
    description: "Track every work order from creation to completion. Assign engineers, upload photos, and log notes.",
    placement: "right",
  },
  {
    selector: '[data-tour="nav-planner"]',
    title: "Weekly Planner",
    description: "Drag-and-drop scheduling for your engineers. View by week, month, or map.",
    placement: "right",
  },
  {
    selector: '[data-tour="nav-customers"]',
    title: "Customers",
    description: "Manage your customer database. Each customer links to their jobs, sites, and invoices.",
    placement: "right",
  },
  {
    selector: '[data-tour="nav-invoices"]',
    title: "Invoices & Quotes",
    description: "Create invoices from completed jobs, send quotes, and track payments.",
    placement: "right",
  },
  {
    selector: '[data-tour="ai-help"]',
    title: "AI Help Wizard",
    description: "Got a question? The AI assistant can help you navigate features, write RAMS, or troubleshoot.",
    placement: "left",
  },
];

function getTooltipPosition(rect: DOMRect, placement: string) {
  const gap = 12;
  switch (placement) {
    case "bottom":
      return { top: rect.bottom + gap, left: rect.left + rect.width / 2 };
    case "top":
      return { top: rect.top - gap, left: rect.left + rect.width / 2 };
    case "right":
      return { top: rect.top + rect.height / 2, left: rect.right + gap };
    case "left":
      return { top: rect.top + rect.height / 2, left: rect.left - gap };
    default:
      return { top: rect.bottom + gap, left: rect.left + rect.width / 2 };
  }
}

function getTransformOrigin(placement: string) {
  switch (placement) {
    case "bottom": return "translateX(-50%)";
    case "top": return "translateX(-50%) translateY(-100%)";
    case "right": return "translateY(-50%)";
    case "left": return "translateX(-100%) translateY(-50%)";
    default: return "translateX(-50%)";
  }
}

export default function OnboardingTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const rafRef = useRef(0);

  const isDone = localStorage.getItem(TOUR_DONE_KEY) === "true";

  const finish = useCallback(() => {
    setActive(false);
    localStorage.setItem(TOUR_DONE_KEY, "true");
    cancelAnimationFrame(rafRef.current);
  }, []);

  const positionTooltip = useCallback((index: number) => {
    const s = STEPS[index];
    if (!s) return;
    const el = document.querySelector(s.selector);
    if (!el) {
      // Skip missing elements
      if (index < STEPS.length - 1) {
        setStep(index + 1);
      } else {
        finish();
      }
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    // Wait for scroll, then position
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      setPos(getTooltipPosition(rect, s.placement));
    });
  }, [finish]);

  useEffect(() => {
    if (!active) return;
    positionTooltip(step);

    // Reposition on scroll/resize
    const reposition = () => {
      rafRef.current = requestAnimationFrame(() => positionTooltip(step));
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      cancelAnimationFrame(rafRef.current);
    };
  }, [active, step, positionTooltip]);

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else finish();
  };

  const prev = () => {
    if (step > 0) setStep(step - 1);
  };

  const startTour = () => {
    setStep(0);
    setActive(true);
  };

  // Show the start button if tour hasn't been completed
  if (!active && !isDone) {
    return (
      <Button
        onClick={startTour}
        variant="outline"
        size="sm"
        className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
        data-tour="start-tour"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Take a Tour
      </Button>
    );
  }

  if (!active) return null;

  const currentStep = STEPS[step];

  return createPortal(
    <>
      {/* Overlay with spotlight cutout */}
      <div className="fixed inset-0 z-[9998]" onClick={finish}>
        <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
          <defs>
            <mask id="tour-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {targetRect && (
                <rect
                  x={targetRect.left - 6}
                  y={targetRect.top - 6}
                  width={targetRect.width + 12}
                  height={targetRect.height + 12}
                  rx="8"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0" y="0"
            width="100%" height="100%"
            fill="hsl(var(--background))"
            fillOpacity="0.7"
            mask="url(#tour-mask)"
            style={{ pointerEvents: "all" }}
          />
        </svg>

        {/* Highlight ring */}
        {targetRect && (
          <div
            className="absolute rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background pointer-events-none animate-pulse"
            style={{
              top: targetRect.top - 6,
              left: targetRect.left - 6,
              width: targetRect.width + 12,
              height: targetRect.height + 12,
            }}
          />
        )}
      </div>

      {/* Tooltip */}
      {pos && (
        <div
          className="fixed z-[9999] w-80 rounded-xl border bg-card p-4 shadow-xl animate-in fade-in-0 zoom-in-95"
          style={{
            top: pos.top,
            left: pos.left,
            transform: getTransformOrigin(currentStep.placement),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-semibold text-sm text-foreground">{currentStep.title}</h3>
            <button onClick={finish} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground mb-4">{currentStep.description}</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{step + 1} of {STEPS.length}</span>
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="ghost" size="sm" onClick={prev} className="h-7 px-2 text-xs">
                  <ChevronLeft className="h-3 w-3 mr-1" /> Back
                </Button>
              )}
              <Button size="sm" onClick={next} className="h-7 px-3 text-xs">
                {step === STEPS.length - 1 ? "Finish" : "Next"}
                {step < STEPS.length - 1 && <ChevronRight className="h-3 w-3 ml-1" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
