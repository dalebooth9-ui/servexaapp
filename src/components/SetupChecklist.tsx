import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, ChevronRight, X, Rocket, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";
import { SETUP_STEPS, useSetupProgress } from "@/hooks/useSetupProgress";

interface Props {
  variant?: "card" | "page";
  /** Hide the dismiss button (e.g. on the dedicated Setup Guide page). */
  hideDismiss?: boolean;
}

export default function SetupChecklist({ variant = "card", hideDismiss }: Props) {
  const navigate = useNavigate();
  const {
    loading, completed, completedCount, total, allDone,
    dismissed, dismiss, nextStep,
  } = useSetupProgress();

  if (loading) return null;
  // On the card variant we hide once dismissed or fully complete.
  if (variant === "card" && (dismissed || allDone)) return null;

  const pct = Math.round((completedCount / total) * 100);

  const go = (step: (typeof SETUP_STEPS)[number]) => {
    navigate(`${step.href}?setup=${step.index}`);
  };

  const Header = (
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2">
        <Rocket className="h-5 w-5 text-primary shrink-0" />
        <div>
          <CardTitle className="text-base">Getting started</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completedCount} of {total} done
          </p>
        </div>
      </div>
      {!hideDismiss && variant === "card" && (
        <button
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Finish later"
          aria-label="Finish later"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  const Body = (
    <div className="space-y-4">
      <Progress value={pct} className="h-1.5" />

      {allDone && variant === "page" && (
        <div className="rounded-lg border bg-primary/5 p-4 flex items-center gap-3">
          <PartyPopper className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-medium">You're all set!</p>
            <p className="text-xs text-muted-foreground">
              Your organisation is ready to go. This guide will stop showing on your dashboard.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {SETUP_STEPS.map((step) => {
          const done = completed[step.id];
          const isNext = nextStep?.id === step.id;
          return (
            <button
              key={step.id}
              onClick={() => go(step)}
              className={cn(
                "w-full text-left flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors group border",
                done
                  ? "opacity-60 border-transparent hover:bg-muted/50"
                  : isNext
                    ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                    : "border-transparent hover:bg-muted",
              )}
            >
              {done ? (
                <CheckCircle2 className="h-4.5 w-4.5 text-primary shrink-0" />
              ) : (
                <Circle className={cn("h-4.5 w-4.5 shrink-0", isNext ? "text-primary" : "text-muted-foreground")} />
              )}
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-medium flex items-center gap-2", done && "line-through")}>
                  <span className="text-xs text-muted-foreground">Step {step.index}</span>
                  <span>{step.title}</span>
                </p>
                {!done && (
                  <p className="text-xs text-muted-foreground truncate">{step.description}</p>
                )}
              </div>
              {!done && (
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          );
        })}
      </div>

      {variant === "card" && nextStep && (
        <div className="pt-1">
          <Button size="sm" onClick={() => go(nextStep)} className="w-full sm:w-auto">
            {completedCount === 0 ? "Start setup" : "Continue setup"}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );

  if (variant === "page") {
    return (
      <Card>
        <CardHeader className="pb-2">{Header}</CardHeader>
        <CardContent>{Body}</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-primary/5 mb-6">
      <CardHeader className="pb-2">{Header}</CardHeader>
      <CardContent>{Body}</CardContent>
    </Card>
  );
}
