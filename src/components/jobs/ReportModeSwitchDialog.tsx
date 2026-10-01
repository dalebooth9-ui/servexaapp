import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import { SWITCH_REASONS } from "@/lib/reportModeSwitch";

export default function ReportModeSwitchDialog({
  open, onOpenChange, toVisual, fullLabel, busy, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  toVisual: boolean;
  fullLabel: string;
  busy: boolean;
  onConfirm: (reason: string, note: string) => void;
}) {
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const needsNote = reason === "Other";
  const ok = toVisual ? !!reason && (!needsNote || note.trim().length > 0) : true;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {toVisual ? `${fullLabel} can't be done – switch to visual?` : `Switch back to ${fullLabel.toLowerCase()}?`}
          </DialogTitle>
          <DialogDescription>
            Everything already filled in, photos and defects are kept.
            {toVisual ? " Choose why the test wasn't carried out." : ""}
          </DialogDescription>
        </DialogHeader>
        {toVisual && (
          <div className="space-y-3">
            <RadioGroup value={reason} onValueChange={setReason} className="gap-2">
              {SWITCH_REASONS.map((r) => (
                <label key={r} htmlFor={`sw-${r}`} className="flex items-center gap-3 rounded-lg border p-3 min-h-12 cursor-pointer">
                  <RadioGroupItem value={r} id={`sw-${r}`} />
                  <span className="text-sm">{r}</span>
                </label>
              ))}
            </RadioGroup>
            {needsNote && (
              <Textarea rows={3} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Explain why the test couldn't be done" />
            )}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!ok || busy} onClick={() => onConfirm(reason, note.trim())}>
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {toVisual ? "Switch to visual" : `Switch back`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
