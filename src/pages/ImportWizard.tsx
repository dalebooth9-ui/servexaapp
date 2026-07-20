import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import StepChooseType from "@/components/import-wizard/StepChooseType";
import StepUpload from "@/components/import-wizard/StepUpload";
import StepMapping from "@/components/import-wizard/StepMapping";
import StepReview, { ReviewRow } from "@/components/import-wizard/StepReview";
import StepResult, { CommitResult } from "@/components/import-wizard/StepResult";
import { ImportEntity, ENTITY_SCHEMAS } from "@/components/import-wizard/schemas";
import type { ParsedFile } from "@/lib/importMapping";

const STEPS = ["Type", "Upload", "Mapping", "Review", "Done"] as const;

export default function ImportWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [entity, setEntity] = useState<ImportEntity | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);

  const canNext = useMemo(() => {
    if (step === 0) return !!entity;
    if (step === 1) return !!parsed;
    if (step === 2) {
      if (!entity) return false;
      const requiredMet = ENTITY_SCHEMAS[entity].fields.filter((f) => f.required).every((f) => !!mapping[f.key]);
      return requiredMet;
    }
    if (step === 3) return reviewRows.some((r) => r.action !== "skip");
    return false;
  }, [step, entity, parsed, mapping, reviewRows]);

  const reset = () => {
    setStep(0); setEntity(null); setFile(null); setParsed(null);
    setMapping({}); setReviewRows([]); setResult(null);
  };

  async function commit() {
    if (!entity) return;
    setCommitting(true);
    try {
      const payload = {
        entity,
        filename: file?.name || null,
        rows: reviewRows.map((r) => ({
          action: r.action,
          values: r.values,
          mergeTargetId: r.mergeTargetId || null,
          parentMatchId: r.parentMatchId || null,
        })),
      };
      const { data, error } = await supabase.functions.invoke("commit-import", { body: payload });
      if (error) throw error;
      setResult({ ...data, entity });
      setStep(4);
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Upload className="h-6 w-6" /> Import Data</h1>
          <p className="text-sm text-muted-foreground mt-1">Bring customers, sites, or assets in from a CSV or Excel export.</p>
        </div>
        
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 text-sm">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium ${i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>{i + 1}</div>
            <div className={i === step ? "font-medium" : "text-muted-foreground"}>{label}</div>
            {i < STEPS.length - 1 && <div className="w-6 h-px bg-border mx-1" />}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{STEPS[step]}</CardTitle></CardHeader>
        <CardContent>
          {step === 0 && <StepChooseType value={entity} onChange={setEntity} />}
          {step === 1 && (
            <StepUpload
              file={file}
              parsed={parsed}
              onLoaded={(f, p) => { setFile(f); setParsed(p); setMapping({}); setReviewRows([]); }}
              onClear={() => { setFile(null); setParsed(null); setMapping({}); setReviewRows([]); }}
            />
          )}
          {step === 2 && entity && parsed && (
            <StepMapping entity={entity} parsed={parsed} mapping={mapping} setMapping={setMapping} />
          )}
          {step === 3 && entity && parsed && (
            <StepReview entity={entity} parsed={parsed} mapping={mapping} reviewRows={reviewRows} setReviewRows={setReviewRows} />
          )}
          {step === 4 && result && <StepResult result={result} onReset={reset} />}
        </CardContent>
      </Card>

      {step < 4 && (
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || committing}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={commit} disabled={!canNext || committing}>
              {committing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Import now
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
