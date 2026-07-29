import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sparkles, Loader2, Check, AlertTriangle, Info } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export interface RamsRiskRow {
  activity: string;
  hazard: string;
  who_at_risk: string;
  likelihood: number;
  severity: number;
  control: string;
  residual_likelihood: number;
  residual_severity: number;
}

interface RamsAutoFillResult {
  description: string;
  method_statement: string;
  hazards: string[];
  controls: string[];
  ppe: string[];
  risk_rows?: RamsRiskRow[];
  context_used?: string[];
}

interface Props {
  jobName?: string;
  category?: string;
  address?: string;
  customer?: string;
  ramsType?: string;
  /** When supplied, the AI reads the job's works description, defects, remedial items, parts and site details. */
  jobId?: string | null;
  /** The job's "description of works required" — the primary driver of the draft. */
  worksDescription?: string | null;
  triggerLabel?: string;
  onApply: (result: RamsAutoFillResult) => void;
}

/** Below this, a works description is too thin to generate a specific RAMS from. */
const MIN_WORKS_CHARS = 25;

export default function AiRamsAutoFill({ jobName, category, address, customer, ramsType = "dry_riser", jobId, worksDescription, triggerLabel, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<RamsAutoFillResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [works, setWorks] = useState((worksDescription || "").trim());
  const { toast } = useToast();

  useEffect(() => {
    setWorks((prev) => prev || (worksDescription || "").trim());
  }, [worksDescription]);

  const needsWorks = works.trim().length < MIN_WORKS_CHARS;

  const generate = useCallback(async () => {
    if (works.trim().length < MIN_WORKS_CHARS) return;
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-rams-autofill", {
        body: { jobName, category, address, customer, ramsType, jobId, worksDescription: works.trim() },
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
  }, [jobName, category, address, customer, ramsType, jobId, works, toast]);

  const handleOpen = (v: boolean) => {
    setOpen(v);
    // Only auto-generate when we already have a usable works description.
    if (v && !result && works.trim().length >= MIN_WORKS_CHARS) generate();
  };

  const handleApply = () => {
    if (!result) return;
    onApply(result);
    setOpen(false);
    toast({ title: "RAMS auto-filled", description: "AI content applied to your RAMS form." });
  };


  const ramsTypeLabel: Record<string, string> = {
    dry_riser: "Dry Riser",
    dry_riser_remedial: "Dry Riser — Remedial / Repairs",
    sprinkler: "Sprinkler",
    sprinkler_remedial: "Sprinkler — Remedials / Repairs",
    general_remedial: "Remedials / Repairs (General)",
    fire_extinguisher: "Fire Extinguisher",
    fire_hydrant: "Fire Hydrant",
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => handleOpen(true)}>
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        {triggerLabel || "AI Auto-Fill RAMS"}
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
              {jobId ? " · tailored to this job's works description, defects, parts and site" : ""}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 px-5 py-4">
            {/* Works description — the primary driver of the draft. Always editable,
                and required before generating so we never produce a vague RAMS. */}
            <section className="mb-4">
              <Label htmlFor="rams-works" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Description of works
              </Label>
              <Textarea
                id="rams-works"
                value={works}
                onChange={(e) => setWorks(e.target.value)}
                rows={4}
                className="mt-1.5"
                placeholder="e.g. Repair leaking sprinkler pipework in the third floor ceiling void, replace the damaged section, drain down and recommission."
              />
              {needsWorks ? (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-warning">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {jobId
                    ? "This job has no usable works description. Type or dictate a brief description of the works so the RAMS matches the actual job."
                    : "Describe the works (or dictate with the mic) before generating."}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  The method statement and hazards are generated from this. Edit it to change the draft.
                </p>
              )}
            </section>

            {loading && (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground text-sm">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p>AI generating RAMS content…</p>
                <p className="text-xs opacity-60">{jobId ? "Reading this job's works description, defects, parts and site details…" : `Tailoring to ${ramsTypeLabel[ramsType] || "RAMS"} requirements`}</p>
              </div>
            )}

            {!loading && !result && !needsWorks && (
              <div className="flex items-center gap-2 text-warning py-4 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                No content generated yet — press Generate.
              </div>
            )}

            {result && (
              <div className="space-y-4 pb-4">
                {!!result.context_used?.length && (
                  <section className="rounded-lg border bg-muted/30 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                      <Info className="h-3.5 w-3.5" /> Generated from
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.context_used.map((c, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
                      ))}
                    </div>
                  </section>
                )}

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
                        <Check className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
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
              <Button variant={result ? "ghost" : "default"} size="sm" className="gap-1.5" onClick={generate} disabled={loading || needsWorks}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {result ? "Regenerate" : "Generate"}
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
