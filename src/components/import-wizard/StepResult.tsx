import { CheckCircle2, AlertTriangle, Undo2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CommitResult {
  batchId: string;
  created: number;
  merged: number;
  skipped: number;
  errors?: any[];
  entity: string;
}

export default function StepResult({ result, onReset }: { result: CommitResult; onReset: () => void }) {
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState(false);

  async function handleUndo() {
    if (!confirm(`Delete the ${result.created} record(s) created by this import? Merges cannot be reversed.`)) return;
    setUndoing(true);
    try {
      const { error } = await supabase.from(result.entity as any).delete().eq("import_batch_id", result.batchId);
      if (error) throw error;
      await supabase.from("import_batches").update({ status: "undone" }).eq("id", result.batchId);
      setUndone(true);
      toast.success("Import undone");
    } catch (e: any) {
      toast.error(e.message || "Failed to undo import");
    } finally {
      setUndoing(false);
    }
  }

  return (
    <div className="space-y-6 py-4">
      <div className="text-center space-y-2">
        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
        </div>
        <div className="text-lg font-semibold">Import complete</div>
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
        <div className="border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold">{result.created}</div>
          <div className="text-xs text-muted-foreground">Created</div>
        </div>
        <div className="border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold">{result.merged}</div>
          <div className="text-xs text-muted-foreground">Merged</div>
        </div>
        <div className="border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold">{result.skipped}</div>
          <div className="text-xs text-muted-foreground">Skipped</div>
        </div>
      </div>

      {!!result.errors?.length && (
        <div className="border border-destructive/30 bg-destructive/5 rounded p-3 text-sm">
          <div className="flex items-center gap-2 text-destructive font-medium mb-1"><AlertTriangle className="h-4 w-4" /> Some rows failed</div>
          <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
            {result.errors.slice(0, 5).map((e, i) => <li key={i}>{e.message || JSON.stringify(e)}</li>)}
          </ul>
        </div>
      )}

      <div className="flex justify-center gap-2">
        {!undone && result.created > 0 && (
          <Button variant="outline" onClick={handleUndo} disabled={undoing}>
            {undoing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Undo2 className="h-4 w-4 mr-1" />}
            Undo this import
          </Button>
        )}
        <Button onClick={onReset}>Import another file</Button>
      </div>
    </div>
  );
}
