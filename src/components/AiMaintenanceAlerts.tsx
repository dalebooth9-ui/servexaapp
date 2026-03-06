import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, RefreshCw, AlertTriangle, Calendar, Wrench, ExternalLink } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface MaintenanceAlert {
  ppm_id: string;
  asset_name: string;
  site_name?: string;
  task: string;
  next_due_date: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  recommendation: string;
}

const SEVERITY_CONFIG: Record<string, { label: string; className: string; badgeVariant: "destructive" | "secondary" | "outline" }> = {
  critical: { label: "Overdue", className: "border-destructive/40 bg-destructive/5", badgeVariant: "destructive" },
  high: { label: "Due Soon", className: "border-orange-500/40 bg-orange-500/5", badgeVariant: "destructive" },
  medium: { label: "Upcoming", className: "border-yellow-500/30 bg-yellow-500/5", badgeVariant: "secondary" },
  low: { label: "Scheduled", className: "border-border bg-muted/20", badgeVariant: "outline" },
};

interface Props {
  compact?: boolean; // show just the count badge + trigger button
}

export default function AiMaintenanceAlerts({ compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<MaintenanceAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-predictive-maintenance", {});
      if (error) throw error;
      if (data?.error) {
        if (data.error.includes("Rate limit")) toast({ title: "Rate limit reached", description: data.error, variant: "destructive" });
        else toast({ title: "Error", description: data.error, variant: "destructive" });
        return;
      }
      setAlerts(data?.alerts || []);
      setLastFetched(new Date());
    } catch (e: any) {
      toast({ title: "Error fetching maintenance alerts", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v && !lastFetched) fetchAlerts();
  };

  const criticalCount = alerts.filter(a => a.severity === "critical" || a.severity === "high").length;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn("gap-2 relative", criticalCount > 0 && "border-orange-500/50")}
        onClick={() => handleOpen(true)}
      >
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Predictive Maintenance
        {criticalCount > 0 && (
          <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">{criticalCount}</Badge>
        )}
      </Button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="max-w-2xl flex flex-col p-0 gap-0" style={{ height: "80vh" }}>
          <DialogHeader className="px-5 py-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Predictive Maintenance
            </DialogTitle>
            <DialogDescription>
              {lastFetched
                ? `${alerts.length} alert(s) · Last updated ${format(lastFetched, "HH:mm")}`
                : "Analysing your PPM schedules and asset history…"}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 px-4 py-3">
            {loading && (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground text-sm">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p>AI is analysing your maintenance schedules…</p>
              </div>
            )}

            {!loading && alerts.length === 0 && lastFetched && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
                <Wrench className="h-8 w-8 opacity-30" />
                <p className="font-medium">All clear!</p>
                <p>No upcoming maintenance due in the next 60 days.</p>
              </div>
            )}

            {!loading && alerts.length > 0 && (
              <div className="space-y-2 pb-2">
                {alerts.map((alert, i) => {
                  const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.low;
                  return (
                    <div
                      key={`${alert.ppm_id}-${i}`}
                      className={cn("rounded-lg border p-3 space-y-1.5", config.className)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{alert.asset_name}</span>
                          {alert.site_name && (
                            <span className="text-xs text-muted-foreground">· {alert.site_name}</span>
                          )}
                          <Badge variant={config.badgeVariant} className="text-[10px] capitalize">{config.label}</Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => navigate("/assets")}
                          title="View assets"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Wrench className="h-3 w-3 shrink-0" />
                        {alert.task}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Calendar className="h-3 w-3 shrink-0" />
                        Due: {alert.next_due_date}
                      </p>
                      <p className="text-xs text-foreground/80 italic">{alert.message}</p>
                      <p className="text-xs font-medium text-primary">{alert.recommendation}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <div className="border-t px-5 py-3 flex items-center justify-between gap-3 bg-card">
            <Button variant="outline" size="sm" onClick={() => handleOpen(false)}>Close</Button>
            <Button size="sm" className="gap-1.5" onClick={fetchAlerts} disabled={loading}>
              {loading
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analysing…</>
                : <><RefreshCw className="h-3.5 w-3.5" /> Refresh Analysis</>
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
