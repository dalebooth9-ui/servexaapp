import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bot, AlertTriangle, CheckCircle2, Zap, Mail, Plus, RefreshCw, ChevronRight, X } from "lucide-react";
import { format, startOfWeek } from "date-fns";

interface Job {
  id: string;
  name: string;
  reference_number: string;
  status: string;
  priority: string;
  due_date?: string | null;
  customer?: string | null;
  postcode?: string | null;
  assigned_engineer?: string | null;
}

interface Engineer {
  user_id: string;
  full_name: string;
  job_count?: number;
}

interface AutonomousAction {
  type: "reschedule" | "notify_customer" | "create_workorder";
  job_id: string;
  job_name: string;
  action_detail: string;
  confidence: number;
  execute: boolean;
}

interface Exception {
  type: "conflict" | "missing_data" | "escalation" | "safety";
  job_id: string;
  job_name: string;
  reason: string;
  suggested_action: string;
  priority: "high" | "medium" | "low";
}

interface AgentResult {
  autonomous_actions: AutonomousAction[];
  exceptions: Exception[];
  summary: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobs: Job[];
  engineers: Engineer[];
  weekStart: Date;
  onRefresh?: () => void;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  reschedule: <RefreshCw className="h-3.5 w-3.5" />,
  notify_customer: <Mail className="h-3.5 w-3.5" />,
  create_workorder: <Plus className="h-3.5 w-3.5" />,
};

const ACTION_LABELS: Record<string, string> = {
  reschedule: "Reschedule",
  notify_customer: "Notify Customer",
  create_workorder: "Create Work Order",
};

const EXCEPTION_COLOURS: Record<string, string> = {
  conflict: "border-destructive/40 bg-destructive/5",
  missing_data: "border-yellow-500/40 bg-yellow-500/5",
  escalation: "border-orange-500/40 bg-orange-500/5",
  safety: "border-red-600/40 bg-red-600/5",
};

const EXCEPTION_PRIORITY_BADGE: Record<string, string> = {
  high: "bg-destructive text-destructive-foreground",
  medium: "bg-yellow-500 text-white",
  low: "bg-muted text-muted-foreground",
};

export default function AutonomousAgentDialog({ open, onOpenChange, jobs, engineers, weekStart, onRefresh }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [approvedActions, setApprovedActions] = useState<Set<number>>(new Set());

  const reset = () => { setResult(null); setApprovedActions(new Set()); };

  const runAgent = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("auto-schedule-agent", {
        body: {
          action: "analyze",
          jobs,
          engineers,
          weekStart: format(weekStart, "yyyy-MM-dd"),
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const r: AgentResult = data;
      setResult(r);
      // Auto-approve high-confidence actions
      const autoApproved = new Set<number>();
      r.autonomous_actions?.forEach((a, i) => { if (a.confidence >= 85) autoApproved.add(i); });
      setApprovedActions(autoApproved);
    } catch (err: any) {
      toast({ title: "Agent error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const executeApproved = async () => {
    if (!result) return;
    const toExecute = result.autonomous_actions.filter((_, i) => approvedActions.has(i));
    if (!toExecute.length) return;
    setExecuting(true);
    try {
      const { data, error } = await supabase.functions.invoke("auto-schedule-agent", {
        body: { action: "execute", autonomous_actions: toExecute },
      });
      if (error) throw new Error(error.message);
      toast({ title: `${data?.executed || 0} action(s) executed`, description: "Schedule updated by autonomous agent." });
      onRefresh?.();
      onOpenChange(false);
      reset();
    } catch (err: any) {
      toast({ title: "Execution error", description: err.message, variant: "destructive" });
    } finally {
      setExecuting(false);
    }
  };

  const toggleApprove = (i: number) => {
    setApprovedActions(prev => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent
        className="max-w-2xl w-full flex flex-col p-0 gap-0"
        style={{ height: "88vh" }}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" />
            Autonomous Scheduling Agent
          </DialogTitle>
          <DialogDescription>
            {!result
              ? `${jobs.length} job(s) · ${engineers.length} engineer(s) · Week of ${format(weekStart, "dd MMM yyyy")}`
              : result.summary}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
          {!result && !loading && (
            <div className="p-6 space-y-5">
              <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                <p className="text-sm font-medium">What the agent does autonomously:</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Detects and resolves scheduling conflicts</li>
                  <li>Queues customer notifications for completed/delayed jobs</li>
                  <li>Creates follow-up work orders from recurring patterns</li>
                  <li>Balances engineer workload across the week</li>
                  <li><span className="text-foreground font-medium">Flags exceptions only when human input is needed</span></li>
                </ul>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Agent is analysing {jobs.length} jobs…</p>
            </div>
          )}

          {result && (
            <div className="p-4 space-y-4">
              {/* Autonomous actions */}
              {result.autonomous_actions?.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Autonomous Actions ({result.autonomous_actions.length})</p>
                  </div>
                  {result.autonomous_actions.map((a, i) => (
                    <div
                      key={i}
                      onClick={() => toggleApprove(i)}
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${approvedActions.has(i) ? "border-primary/50 bg-primary/5" : "border-border opacity-60 hover:opacity-80"}`}
                    >
                      <div className={`mt-0.5 shrink-0 rounded-full p-1 ${approvedActions.has(i) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        {ACTION_ICONS[a.type]}
                      </div>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{ACTION_LABELS[a.type]}</Badge>
                          <span className="text-sm font-medium truncate">{a.job_name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{a.action_detail}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <div className="h-1.5 rounded-full bg-muted flex-1 max-w-20">
                            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${a.confidence}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{a.confidence}% confidence</span>
                        </div>
                      </div>
                      {approvedActions.has(i) ? (
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      ) : (
                        <X className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Exceptions */}
              {result.exceptions?.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Flagged Exceptions ({result.exceptions.length})</p>
                  </div>
                  {result.exceptions.map((ex, i) => (
                    <div key={i} className={`rounded-lg border p-3 space-y-1 ${EXCEPTION_COLOURS[ex.type] || "border-border"}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`text-[10px] capitalize ${EXCEPTION_PRIORITY_BADGE[ex.priority]}`}>{ex.priority}</Badge>
                        <span className="text-sm font-medium">{ex.job_name}</span>
                        <Badge variant="outline" className="text-[10px] capitalize">{ex.type.replace("_", " ")}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{ex.reason}</p>
                      <div className="flex items-center gap-1 text-xs text-foreground">
                        <ChevronRight className="h-3 w-3 shrink-0" />
                        <span className="font-medium">Suggested: </span>
                        <span className="text-muted-foreground">{ex.suggested_action}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {result.autonomous_actions?.length === 0 && result.exceptions?.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                  <p className="text-sm">Schedule looks healthy — no actions needed.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-3 flex items-center justify-between gap-3 bg-card">
          <Button variant="outline" size="sm" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          {!result ? (
            <Button size="sm" onClick={runAgent} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
              {loading ? "Analysing…" : "Run Agent"}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={reset}>Re-run</Button>
              <Button
                size="sm"
                onClick={executeApproved}
                disabled={executing || approvedActions.size === 0}
                className="gap-2"
              >
                {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Execute {approvedActions.size} Action{approvedActions.size !== 1 ? "s" : ""}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
