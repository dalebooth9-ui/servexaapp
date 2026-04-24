import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MatchSlot, TemplateOption } from "@/lib/autoAttachJobDocuments";

const BUCKET_LABELS: Record<string, string> = {
  pressure_test: "Pressure Test",
  visual: "Visual",
  other: "Other",
};

export interface ChooserChoice {
  slot: MatchSlot;
  template: TemplateOption;
  /** When true, persist this template as the lock for (job, bucket) so it always wins next time. */
  lock: boolean;
}

interface Props {
  open: boolean;
  slots: MatchSlot[];
  onCancel: () => void;
  onConfirm: (choices: ChooserChoice[]) => void;
}

export default function AutoAttachTemplateChooser({ open, slots, onCancel, onConfirm }: Props) {
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [locks, setLocks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      const initPicks: Record<string, string> = {};
      const initLocks: Record<string, boolean> = {};
      slots.forEach((s, i) => {
        initPicks[`${i}`] = s.candidates[0]?.id || "";
        // Default the lock checkbox ON per bucket (only first occurrence sets it; later slots in same bucket inherit)
        initLocks[`${s.bucket}`] = initLocks[`${s.bucket}`] ?? true;
      });
      setPicks(initPicks);
      setLocks(initLocks);
    }
  }, [open, slots]);

  // Group slots by bucket so the lock checkbox is shown once per bucket
  const seenBuckets = new Set<string>();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose templates to attach</DialogTitle>
          <DialogDescription>
            Multiple templates match. Pick one for each slot. Tick "Always use this for this job" to lock it in so duplicates never auto-attach again.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[55vh] overflow-y-auto py-2">
          {slots.map((slot, i) => {
            const isFirstOfBucket = !seenBuckets.has(slot.bucket);
            seenBuckets.add(slot.bucket);
            return (
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
                {isFirstOfBucket && (
                  <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground cursor-pointer">
                    <Checkbox
                      checked={!!locks[slot.bucket]}
                      onCheckedChange={(v) => setLocks((l) => ({ ...l, [slot.bucket]: !!v }))}
                    />
                    Always use this template for this job's {BUCKET_LABELS[slot.bucket]?.toLowerCase() || slot.bucket} documents
                  </label>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Skip</Button>
          <Button
            onClick={() => {
              const choices: ChooserChoice[] = slots.map((slot, i) => {
                const tpl = slot.candidates.find((c) => c.id === picks[`${i}`]) || slot.candidates[0];
                return { slot, template: tpl, lock: !!locks[slot.bucket] };
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
