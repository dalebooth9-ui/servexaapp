// Re-read a converted paper report's original scan, optionally with another template.
import { useEffect, useState } from "react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { plainError } from "@/lib/plainError";
import { redoPaperConversion } from "@/lib/paperReportEdit";

type Props = { open: boolean; onOpenChange: (o: boolean) => void; responseId: string | null; jobId: string; onDone: (responseId: string) => void };

export default function RedoConversionDialog({ open, onOpenChange, responseId, jobId, onDone }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [keepCopy, setKeepCopy] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !responseId) return;
    setKeepCopy(true);
    (async () => {
      const [{ data: row }, { data: tpls }] = await Promise.all([
        supabase.from("job_sheet_responses").select("template_id").eq("id", responseId).single(),
        (supabase as any).from("job_sheet_templates").select("id, name, status").eq("status", "published").order("name"),
      ]);
      const list = ((tpls as any[]) || []).map((t) => ({ id: t.id, name: t.name }));
      const cur = (row as any)?.template_id;
      if (cur && !list.some((t) => t.id === cur)) {
        const { data: t } = await supabase.from("job_sheet_templates").select("id, name").eq("id", cur).maybeSingle();
        if (t) list.unshift(t as any);
      }
      setTemplates(list);
      setTemplateId(cur || list[0]?.id || "");
    })();
  }, [open, responseId]);

  const run = async () => {
    if (!user || !responseId || !templateId) return;
    setBusy(true);
    try {
      const { data: me } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
      const res = await redoPaperConversion({ responseId, jobId, templateId, keepCopy, userId: user.id, userName: (me as any)?.full_name || user.email || "" });
      toast({
        title: "Report rebuilt from the scan",
        description: `${res.dateFromSheet ? "Date taken from the sheet." : "No readable date on the sheet — kept the previous date."}${res.unmapped ? ` ${res.unmapped} item(s) on the sheet aren't on this template and are listed on the report.` : ""} Check it in Edit report.`,
      });
      onOpenChange(false);
      onDone(responseId);
    } catch (e: any) {
      toast({ title: "Couldn't redo the conversion", description: plainError(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Redo conversion</AlertDialogTitle>
          <AlertDialogDescription>
            This re-reads the original scan and replaces the current electronic report. The original scan stays attached.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Report template</Label>
            <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={keepCopy} onCheckedChange={(v) => setKeepCopy(v === true)} className="mt-0.5" />
            <span>This replaces the current electronic report, keep a copy of the old one?<span className="block text-xs text-muted-foreground">The old answers are always kept in the report history; this also keeps the old PDF on the job.</span></span>
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button onClick={run} disabled={busy || !templateId}>{busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Redo conversion</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
