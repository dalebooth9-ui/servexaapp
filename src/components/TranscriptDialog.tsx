import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useMediaTranscription } from "@/hooks/useMediaTranscription";
import { useAuth } from "@/hooks/useAuth";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface TranscriptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filePath: string;
  jobId?: string;
  surveyId?: string;
  bucket?: string;
  orgId?: string;
  /** Start transcribing as soon as the dialog opens (used after a voice note upload). */
  autoStart?: boolean;
  onRemedialsAdded?: () => void;
}

const severityClass: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-orange-500 text-white",
  medium: "bg-amber-400 text-foreground",
  low: "bg-muted text-muted-foreground",
};

export default function TranscriptDialog({
  open,
  onOpenChange,
  filePath,
  jobId,
  surveyId,
  bucket,
  orgId,
  autoStart = false,
  onRemedialsAdded,
}: TranscriptDialogProps) {
  const { transcribe, transcribing, result, setResult, addRemedialsToJob } = useMediaTranscription();
  const { user } = useAuth();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [started, setStarted] = useState(false);

  const handleStart = async () => {
    setStarted(true);
    const r = await transcribe({ file_path: filePath, job_id: jobId, survey_id: surveyId, bucket });
    if (r?.suggested_remedials?.length) {
      setSelected(new Set(r.suggested_remedials.map((_, i) => i)));
    }
  };

  useEffect(() => {
    if (open && autoStart && !started && !transcribing && !result) handleStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoStart]);

  const toggleItem = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleAddRemedials = async () => {
    if (!result || !jobId || !user) return;
    const items = result.suggested_remedials.filter((_, i) => selected.has(i));
    if (items.length === 0) return;
    setAdding(true);
    const ok = await addRemedialsToJob(jobId, items, user.id, orgId);
    setAdding(false);
    if (ok) {
      onRemedialsAdded?.();
      handleClose(false);
    }
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setStarted(false);
      setSelected(new Set());
      setShowTranscript(false);
      setResult(null);
    }
    onOpenChange(v);
  };

  const remedials = result?.suggested_remedials ?? [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Transcription
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {!started && !result && !transcribing && (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-muted-foreground">
                Transcribe the spoken commentary on this recording. Servexa writes a short summary and
                suggests remedial actions from what was actually said.
              </p>
              <Button onClick={handleStart}>
                <FileText className="h-4 w-4 mr-2" /> Start transcription
              </Button>
            </div>
          )}

          {transcribing && (
            <div className="text-center py-8 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">Transcribing audio — this may take a moment…</p>
            </div>
          )}

          {result && !transcribing && (
            <>
              <div className="rounded-lg border p-3 bg-muted/50">
                <h4 className="text-sm font-medium mb-1">Summary</h4>
                <p className="text-sm text-muted-foreground">{result.summary || "No summary available."}</p>
                {result.duration_seconds != null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Length: {Math.floor(result.duration_seconds / 60)}m {Math.round(result.duration_seconds % 60)}s
                  </p>
                )}
              </div>

              <Collapsible open={showTranscript} onOpenChange={setShowTranscript}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between">
                    Full transcript
                    {showTranscript ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="rounded-lg border p-3 max-h-48 overflow-y-auto">
                    <p className="text-sm whitespace-pre-wrap">{result.transcript || "No speech detected."}</p>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {remedials.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" />
                      Suggested remedials ({remedials.length})
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSelected(
                          selected.size === remedials.length
                            ? new Set()
                            : new Set(remedials.map((_, i) => i)),
                        )
                      }
                    >
                      {selected.size === remedials.length ? "Deselect all" : "Select all"}
                    </Button>
                  </div>
                  {remedials.map((r, i) => (
                    <label
                      key={i}
                      className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox checked={selected.has(i)} onCheckedChange={() => toggleItem(i)} className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{r.description}</p>
                      </div>
                      <Badge className={severityClass[r.severity] || "bg-muted text-muted-foreground"}>
                        {r.severity}
                      </Badge>
                    </label>
                  ))}
                  {!jobId && (
                    <p className="text-xs text-muted-foreground">
                      Open this recording from a job to add these items to its remedial checklist.
                    </p>
                  )}
                </div>
              )}

              {remedials.length === 0 && !!result.transcript && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No remedial actions were mentioned in this recording.
                </p>
              )}
            </>
          )}
        </div>

        {result && !transcribing && (
          <DialogFooter>
            <Button variant="outline" onClick={() => handleClose(false)}>Close</Button>
            {jobId && remedials.length > 0 && (
              <Button onClick={handleAddRemedials} disabled={adding || selected.size === 0}>
                {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Add {selected.size} remedial{selected.size !== 1 ? "s" : ""} to job
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
