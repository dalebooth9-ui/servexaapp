import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAiSummarySettings } from "@/lib/reportSummary";

/** Org-level opt-in for AI-written customer summaries on report PDFs. */
export default function AiReportSummarySettings() {
  const { settings, loaded, save } = useAiSummarySettings();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(settings.enabled);
  }, [settings.enabled]);

  const onToggle = async (next: boolean) => {
    setEnabled(next);
    setSaving(true);
    const { error } = await save({ enabled: next });
    setSaving(false);
    if (error) {
      setEnabled(!next);
      toast.error(error);
      return;
    }
    toast.success(next ? "AI report summaries turned on" : "AI report summaries turned off");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          AI report summaries
        </CardTitle>
        <CardDescription>
          Adds a short plain-English summary near the top of customer report PDFs —
          what was done, the outcome, any defects found and recommended actions.
          Written only from the answers on the report and its recorded defects.
          The office can edit or remove the summary before sending.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="space-y-0.5 pr-4">
            <Label htmlFor="ai-report-summaries">Add a summary to report PDFs</Label>
            <p className="text-xs text-muted-foreground">
              Off by default. Applies to completed job reports and scanned documents
              converted to electronic reports.
            </p>
          </div>
          <Switch
            id="ai-report-summaries"
            checked={enabled}
            disabled={!loaded || saving}
            onCheckedChange={onToggle}
          />
        </div>
      </CardContent>
    </Card>
  );
}
