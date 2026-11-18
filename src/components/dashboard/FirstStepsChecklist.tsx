import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle } from "lucide-react";
import QuickAddSiteDialog from "@/components/sites/QuickAddSiteDialog";

type Counts = { customers: number; sites: number; assets: number; jobs: number };

/** Four-step start for companies with no work yet; each step ticks itself from real records. */
export default function FirstStepsChecklist() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [addingSite, setAddingSite] = useState(false);

  const load = useCallback(async () => {
    const head = { count: "exact" as const, head: true };
    const [c, s, a, j] = await Promise.all([
      supabase.from("customers").select("id", head),
      supabase.from("sites").select("id", head).eq("site_type", "site"),
      supabase.from("assets").select("id", head),
      supabase.from("jobs").select("id", head),
    ]);
    setCounts({ customers: c.count || 0, sites: s.count || 0, assets: a.count || 0, jobs: j.count || 0 });
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!counts || counts.jobs > 0) return null;
  const steps = [
    { label: "Add a customer", done: counts.customers > 0, go: () => navigate("/customers?new=1") },
    { label: "Add a site", done: counts.sites > 0, go: () => setAddingSite(true) },
    { label: "Add a riser or asset", done: counts.assets > 0, go: () => navigate("/assets?new=1") },
    { label: "Create your first job", done: false, go: () => navigate("/jobs?new=1") },
  ];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Get started in 4 steps</CardTitle>
        <p className="text-xs text-muted-foreground">{steps.filter((s) => s.done).length} of 4 done</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center gap-3">
            {s.done ? <CheckCircle2 className="h-5 w-5 text-primary shrink-0" aria-label="Done" /> : <Circle className="h-5 w-5 text-muted-foreground shrink-0" aria-label="Not done" />}
            <span className={s.done ? "flex-1 text-sm text-muted-foreground line-through" : "flex-1 text-sm"}>{i + 1}. {s.label}</span>
            <Button size="sm" variant={s.done ? "ghost" : "default"} onClick={s.go}>{s.done ? "Add another" : s.label}</Button>
          </div>
        ))}
      </CardContent>
      <QuickAddSiteDialog open={addingSite} onOpenChange={setAddingSite} onCreated={() => void load()} />
    </Card>
  );
}
