import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { generateSummaryForReport, useAiSummarySettings } from "@/lib/reportSummary";

interface Props {
  templateName: string;
  fields: Array<{ id: string; label: string; type?: string }>;
  responses: Record<string, any>;
  jobId?: string | null;
  archivedDocumentId?: string | null;
  context?: { customer?: string | null; site?: string | null; date?: string | null };
  /** Current saved summary text ("" / null when there is none). */
  value: string | null;
  /** Persist the summary. `null` removes it. */
  onSave: (text: string | null) => Promise<void>;
  canEdit: boolean;
}

/** Office-facing editor for the customer summary printed on the report PDF. */
export default function ReportSummaryEditor({
  templateName,
  fields,
  responses,
  jobId,
  archivedDocumentId,
  context,
  value,
  onSave,
  canEdit,
}: Props) {
  const { settings, loaded } = useAiSummarySettings();
  const [text, setText] = useState(value || "");
  const [busy, setBusy] = useState<null | "generate" | "save" | "remove">(null);

  useEffect(() => {
    setText(value || "");
  }, [value]);

  if (!loaded || !settings.enabled || !canEdit) return null;

  const dirty = (text || "") !== (value || "");

  const handleGenerate = async () => {
    setBusy("generate");
    const { summary, error } = await generateSummaryForReport({
      templateName,
      fields,
      responses,
      jobId,
      archivedDocumentId,
      context,
    });
    setBusy(null);
    if (error || !summary) {
      toast.error(error || "Could not write a summary.");
      return;
    }
    setText(summary);
    toast.success("Summary drafted — review it, then save.");
  };

  const handleSave = async () => {
    const trimmed = text.trim();
    setBusy("save");
    try {
      await onSave(trimmed ? trimmed : null);
      toast.success("Summary saved");
    } catch (e: any) {
      toast.error(e?.message || "Could not save the summary.");
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async () => {
    setBusy("remove");
    try {
      await onSave(null);
      setText("");
      toast.success("Summary removed");
    } catch (e: any) {
      toast.error(e?.message || "Could not remove the summary.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Customer summary on the report
        </p>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7" onClick={handleGenerate} disabled={!!busy}>
            {busy === "generate" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1" />
            )}
            {value ? "Regenerate" : "Draft with AI"}
          </Button>
          <Button size="sm" className="h-7" onClick={handleSave} disabled={!!busy || !dirty}>
            {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save
          </Button>
          {value && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-destructive hover:text-destructive"
              onClick={handleRemove}
              disabled={!!busy}
            >
              {busy === "remove" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="No summary yet. Draft one with AI, or type your own — it prints at the top of the report."
        rows={4}
        className="text-sm bg-background"
      />
      <p className="text-[11px] text-muted-foreground">
        Written only from this report's answers and its recorded defects. Always read it
        before sending — you can edit every word or remove it entirely.
      </p>
    </div>
  );
}
