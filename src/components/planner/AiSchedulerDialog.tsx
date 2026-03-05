import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sparkles, Check, X, AlertTriangle, Calendar, User } from "lucide-react";
import { format, startOfWeek, addDays } from "date-fns";

interface Job {
  id: string;
  name: string;
  reference_number: string;
  priority: string;
  due_date?: string | null;
  customer: string | null;
  address: string | null;
  site?: { name: string; address: string | null; postcode: string | null } | null;
}

interface Engineer {
  user_id: string;
  full_name: string;
}

interface ScheduleEntry {
  job_id: string;
  engineer_id: string;
  schedule_date: string;
}

interface Suggestion {
  job_id: string;
  engineer_id: string;
  date: string;
  reason: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unallocatedJobs: Job[];
  engineers: Engineer[];
  weekStart: Date;
  existingSchedule: ScheduleEntry[];
  onConfirm: (suggestions: Suggestion[]) => Promise<void>;
}

const PRIORITY_COLOUR: Record<string, string> = {
  high: "bg-destructive text-destructive-foreground",
  medium: "bg-yellow-500 text-white",
  low: "bg-muted text-muted-foreground",
};

export default function AiSchedulerDialog({
  open, onOpenChange, unallocatedJobs, engineers, weekStart, existingSchedule, onConfirm,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [step, setStep] = useState<"idle" | "results">("idle");

  const reset = () => {
    setSuggestions([]);
    setSelected(new Set());
    setStep("idle");
  };

  const handleGenerate = async () => {
    if (!unallocatedJobs.length || !engineers.length) {
      toast({ title: "Nothing to schedule", description: "No unscheduled jobs or engineers available.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-scheduler", {
        body: {
          jobs: unallocatedJobs,
          engineers,
          weekStart: format(weekStart, "yyyy-MM-dd"),
          existingSchedule,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) {
        toast({ title: "AI Scheduler error", description: data.error, variant: "destructive" });
        setLoading(false);
        return;
      }

      const s: Suggestion[] = data?.suggestions || [];
      setSuggestions(s);
      setSelected(new Set(s.map((x) => x.job_id)));
      setStep("results");

      if (s.length === 0) {
        toast({ title: "No suggestions generated", description: "Try again or check your job data.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    const toApply = suggestions.filter((s) => selected.has(s.job_id));
    if (!toApply.length) return;
    setConfirming(true);
    try {
      await onConfirm(toApply);
      toast({ title: "Schedule applied", description: `${toApply.length} job(s) scheduled.` });
      onOpenChange(false);
      reset();
    } catch (err: any) {
      toast({ title: "Error applying schedule", description: err.message, variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  const toggleAll = () => {
    if (selected.size === suggestions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(suggestions.map((s) => s.job_id)));
    }
  };

  const getEngineerName = (id: string) => engineers.find((e) => e.user_id === id)?.full_name || "Unknown";
  const getJob = (id: string) => unallocatedJobs.find((j) => j.id === id);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent
        className="max-w-2xl w-full flex flex-col p-0 gap-0"
        style={{ height: "85vh" }}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Smart Scheduler
          </DialogTitle>
          <DialogDescription>
            {step === "idle"
              ? `${unallocatedJobs.length} unscheduled job(s) · ${engineers.length} engineer(s) · Week of ${format(weekStart, "dd MMM yyyy")}`
              : `${suggestions.length} suggestion(s) generated — select which to apply`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
          {step === "idle" && (
            <div className="p-6 space-y-5">
              <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                <p className="text-sm font-medium">What the AI will do:</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Prioritise HIGH → MEDIUM → LOW jobs</li>
                  <li>Schedule urgent due-dates earlier in the week</li>
                  <li>Distribute jobs evenly across all engineers</li>
                  <li>Group nearby locations on the same day</li>
                  <li>Avoid overloading any single engineer</li>
                </ul>
              </div>

              {unallocatedJobs.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Jobs to schedule ({unallocatedJobs.length})</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto rounded border p-2">
                    {unallocatedJobs.map((j) => (
                      <div key={j.id} className="flex items-center justify-between text-sm py-0.5 px-1">
                        <span className="truncate flex-1">{j.reference_number} · {j.name}</span>
                        <Badge className={`ml-2 text-[10px] capitalize shrink-0 ${PRIORITY_COLOUR[j.priority] || ""}`}>{j.priority}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  No unscheduled jobs found for this week.
                </div>
              )}
            </div>
          )}

          {step === "results" && (
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={toggleAll}
                  className="text-xs text-primary underline underline-offset-2 hover:opacity-80"
                >
                  {selected.size === suggestions.length ? "Deselect all" : "Select all"}
                </button>
                <span className="text-xs text-muted-foreground">{selected.size} of {suggestions.length} selected</span>
              </div>
              {suggestions.map((s) => {
                const job = getJob(s.job_id);
                const checked = selected.has(s.job_id);
                return (
                  <div
                    key={s.job_id}
                    onClick={() => setSelected((prev) => {
                      const n = new Set(prev);
                      checked ? n.delete(s.job_id) : n.add(s.job_id);
                      return n;
                    })}
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${checked ? "border-primary/50 bg-primary/5" : "opacity-50 hover:opacity-70"}`}
                  >
                    <Checkbox checked={checked} className="mt-0.5 shrink-0" onCheckedChange={() => {}} />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{job?.name || s.job_id}</span>
                        {job && <Badge className={`text-[10px] capitalize ${PRIORITY_COLOUR[job.priority] || ""}`}>{job.priority}</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1"><User className="h-3 w-3" />{getEngineerName(s.engineer_id)}</span>
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(s.date), "EEE dd MMM")}</span>
                      </div>
                      {s.reason && (
                        <p className="text-[11px] text-muted-foreground italic">{s.reason}</p>
                      )}
                    </div>
                    {checked ? (
                      <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-3 flex items-center justify-between gap-3 bg-card">
          <Button variant="outline" size="sm" onClick={() => { reset(); onOpenChange(false); }}>
            Cancel
          </Button>
          {step === "idle" ? (
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={loading || unallocatedJobs.length === 0}
              className="gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "Generating schedule..." : "Generate Schedule"}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={reset}>
                Regenerate
              </Button>
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={confirming || selected.size === 0}
                className="gap-2"
              >
                {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Apply {selected.size} Job{selected.size !== 1 ? "s" : ""}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
