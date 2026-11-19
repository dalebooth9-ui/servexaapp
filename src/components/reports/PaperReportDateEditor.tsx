import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { updatePaperReportDate } from "@/lib/updatePaperReportDate";
import { logError } from "@/lib/errorLogger";
import { CalendarDays, Loader2 } from "lucide-react";

export default function PaperReportDateEditor({ responseId, date, onSaved }: { responseId: string; date: string | null; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(date?.slice(0, 10) || "");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const save = async () => {
    setBusy(true);
    try {
      await updatePaperReportDate(responseId, value);
      setEditing(false);
      onSaved();
      toast({ title: "Completion date saved" });
    } catch (error) {
      logError({ error, context: { responseId, operation: "paper-report-date" } });
      toast({ title: "Couldn't update all report copies", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
      onSaved();
    } finally { setBusy(false); }
  };
  return editing ? <div className="flex flex-wrap items-end gap-2 mt-2">
    <div><Label htmlFor={`paper-date-${responseId}`}>Completion date</Label><Input id={`paper-date-${responseId}`} type="date" value={value} onChange={e => setValue(e.target.value)} disabled={busy} /></div>
    <Button size="sm" disabled={busy} onClick={() => void save()}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Save date</Button>
    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
  </div> : <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setValue(date?.slice(0,10) || ""); setEditing(true); }}><CalendarDays className="h-3.5 w-3.5 mr-1" />Edit completion date</Button>;
}