import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, ChevronRight, X, Rocket } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "onboarding-dismissed";

interface Step {
  id: string;
  label: string;
  description: string;
  href: string;
  check: () => Promise<boolean>;
}

export default function OnboardingChecklist() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === "true");
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const steps: Step[] = [
    {
      id: "customer",
      label: "Add your first customer",
      description: "Customers are the foundation — every job links back to one.",
      href: "/customers",
      check: async () => {
        const { count } = await supabase.from("customers").select("id", { count: "exact", head: true });
        return (count ?? 0) > 0;
      },
    },
    {
      id: "job",
      label: "Create your first job",
      description: "Jobs track all the work you do from start to completion.",
      href: "/jobs",
      check: async () => {
        const { count } = await supabase.from("jobs").select("id", { count: "exact", head: true });
        return (count ?? 0) > 0;
      },
    },
    {
      id: "engineer",
      label: "Invite an engineer",
      description: "Assign jobs to engineers and track their work in real time.",
      href: "/engineers",
      check: async () => {
        const { data } = await supabase.from("profiles").select("user_id").eq("role", "engineer").limit(1);
        return (data?.length ?? 0) > 0;
      },
    },
    {
      id: "schedule",
      label: "Schedule a visit",
      description: "Use the Planner to schedule engineers on jobs for specific dates.",
      href: "/planner",
      check: async () => {
        const { count } = await supabase.from("job_schedule").select("id", { count: "exact", head: true });
        return (count ?? 0) > 0;
      },
    },
    {
      id: "invoice",
      label: "Create an invoice",
      description: "Turn completed jobs into invoices and track your revenue.",
      href: "/invoices",
      check: async () => {
        const { count } = await supabase.from("invoices").select("id", { count: "exact", head: true });
        return (count ?? 0) > 0;
      },
    },
  ];

  useEffect(() => {
    if (!user || dismissed) return;
    const run = async () => {
      const results = await Promise.all(steps.map(async (s) => [s.id, await s.check()] as [string, boolean]));
      const map = Object.fromEntries(results);
      setCompleted(map);
      setLoading(false);
      // Auto-dismiss if all complete
      if (results.every(([, v]) => v)) {
        localStorage.setItem(DISMISS_KEY, "true");
        setDismissed(true);
      }
    };
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, dismissed]);

  if (dismissed || loading) return null;

  const doneCount = Object.values(completed).filter(Boolean).length;
  const total = steps.length;
  const pct = Math.round((doneCount / total) * 100);

  return (
    <Card className="border-primary/30 bg-primary/5 mb-6">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary shrink-0" />
          <div>
            <CardTitle className="text-base">Get started checklist</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{doneCount} of {total} steps complete</p>
          </div>
        </div>
        <button
          onClick={() => { localStorage.setItem(DISMISS_KEY, "true"); setDismissed(true); }}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={pct} className="h-1.5" />
        <div className="space-y-1">
          {steps.map((step) => {
            const done = completed[step.id];
            return (
              <Link
                key={step.id}
                to={step.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors group",
                  done
                    ? "opacity-50 pointer-events-none"
                    : "hover:bg-primary/10 cursor-pointer"
                )}
              >
                {done
                  ? <CheckCircle2 className="h-4.5 w-4.5 text-primary shrink-0" />
                  : <Circle className="h-4.5 w-4.5 text-muted-foreground shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium", done && "line-through")}>{step.label}</p>
                  {!done && <p className="text-xs text-muted-foreground truncate">{step.description}</p>}
                </div>
                {!done && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />}
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
