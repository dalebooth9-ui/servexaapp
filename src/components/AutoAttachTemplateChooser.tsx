import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MatchSlot, TemplateOption } from "@/lib/autoAttachJobDocuments";

const BUCKET_LABELS: Record<string, string> = {
  pressure_test: "Pressure Test",
  visual: "Visual",
  other: "Other",
};

interface Props {
  open: boolean;
  slots: MatchSlot[];
  onCancel: () => void;
  onConfirm: (choices: { slot: MatchSlot; template: TemplateOption }[]) => void;
}

export default function AutoAttachTemplateChooser({ open, slots, onCancel, onConfirm }: Props) {
  const [picks, setPicks] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      const init: Record<string, string> = {};
      slots.forEach((s, i) => { init[`${i}`] = s.candidates[0]?.id || ""; });
      setPicks(init);
    }
  }, [open, slots]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose templates to attach</DialogTitle>
          <DialogDescription>
            We found multiple matching templates for some of the documents being added. Pick which one to use for each.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[55vh] overflow-y-auto py-2">
          {slots.map((slot, i) => (
            <div key={i} className="space-y-1.5">
              <Label className="text-sm">
                {BUCKET_LABELS[slot.bucket] || slot.bucket} #{slot.index}
              </Label>
              <Select value={picks[`${i}`] || ""} onValueChange={(v) => setPicks((p) => ({ ...p, [`${i}`]: v }))}>
                <SelectTrigger><SelectValue placeholder="Choose template" /></SelectTrigger>
                <SelectContent>
                  {slot.candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.locked ? " (default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Skip</Button>
          <Button
            onClick={() => {
              const choices = slots.map((slot, i) => {
                const tpl = slot.candidates.find((c) => c.id === picks[`${i}`]) || slot.candidates[0];
                return { slot, template: tpl };
              });
              onConfirm(choices);
            }}
            disabled={slots.some((_, i) => !picks[`${i}`])}
          >
            Attach {slots.length} document{slots.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
