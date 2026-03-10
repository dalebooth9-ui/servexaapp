import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sparkles, Loader2, Check, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface RamsAutoFillResult {
  description: string;
  method_statement: string;
  hazards: string[];
  controls: string[];
  ppe: string[];
}

interface Props {
  jobName?: string;
  category?: string;
  address?: string;
  customer?: string;
  ramsType?: string;
  onApply: (result: RamsAutoFillResult) => void;
}

export default function AiRamsAutoFill({ jobName, category, address, customer, ramsType = "dry_riser", onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<RamsAutoFillResult | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const generate = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-rams-autofill", {
        body: { jobName, category, address, customer, ramsType },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ title: "AI error", description: data.error, variant: "destructive" });
        return;
      }
      setResult(data);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [jobName, category, address, customer, ramsType, toast]);

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v && !result) generate();
  };

  const handleApply = () => {
    if (!result) return;
    onApply(result);
    setOpen(false);
    toast({ title: "RAMS auto-filled", description: "AI content applied to your RAMS form." });
  };

  const ramsTypeLabel: Record<string, string> = {
    dry_riser: "Dry Riser",
    sprinkler: "Sprinkler",
    fire_extinguisher: "Fire Extinguisher",
    fire_hydrant: "Fire Hydrant",
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => handleOpen(true)}>
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        AI Auto-Fill RAMS
      </Button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="max-w-2xl flex flex-col p-0 gap-0" style={{ height: "85vh" }}>
          <DialogHeader className="px-5 py-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              AI RAMS Auto-Fill
            </DialogTitle>
            <DialogDescription>
              {ramsTypeLabel[ramsType] || ramsType} · {jobName || "Job"}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 px-5 py-4">
            {loading && (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground text-sm">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p>AI generating RAMS content…</p>
                <p className="text-xs opacity-60">Tailoring to {ramsTypeLabel[ramsType]} requirements</p>
              </div>
            )}

            {!loading && !result && (
              <div className="flex items-center gap-2 text-warning py-4 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                No content generated yet.
              </div>
            )}

            {result && (
              <div className="space-y-4 pb-4">
                <section>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Project Description</p>
                  <p className="text-sm text-foreground/90 rounded-lg bg-muted/40 border p-3">{result.description}</p>
                </section>

                <section>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Method Statement</p>
                  <div className="rounded-lg bg-muted/40 border p-3 space-y-1">
                    {result.method_statement.split("\n").filter(Boolean).map((line, i) => (
                      <p key={i} className="text-sm text-foreground/90">{line}</p>
                    ))}
                  </div>
                </section>

                <section>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Hazards <Badge variant="secondary" className="ml-1">{result.hazards.length}</Badge>
                  </p>
                  <div className="space-y-1">
                    {result.hazards.map((h, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-destructive mt-0.5 shrink-0">⚠</span>
                        <span className="text-muted-foreground">{h}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Control Measures <Badge variant="secondary" className="ml-1">{result.controls.length}</Badge>
                  </p>
                  <div className="space-y-1">
                    {result.controls.map((c, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <Check className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                        <span className="text-muted-foreground">{c}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    PPE Required <Badge variant="secondary" className="ml-1">{result.ppe.length}</Badge>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.ppe.map((p, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{p}</Badge>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </ScrollArea>

          <div className="border-t px-5 py-3 flex items-center justify-between gap-3 bg-card">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={generate} disabled={loading}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Regenerate
              </Button>
              <Button size="sm" className="gap-1.5" onClick={handleApply} disabled={loading || !result}>
                <Check className="h-3.5 w-3.5" />
                Apply to RAMS
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
