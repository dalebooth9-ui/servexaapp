import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ClipboardList, FileText } from "lucide-react";
import { toast } from "sonner";
import { NO_CHARGE_REASONS, bulkChargeTargets, needsBulkConfirm, splitForQuote, type ChargeableDefect } from "@/lib/defectCharge";

type Props<T extends ChargeableDefect> = {
  selected: T[];
  onClear: () => void;
  onChanged: () => void;
  /** Receives only chargeable, unquoted, open defects. */
  onQuote: (quotable: T[]) => Promise<void> | void;
  onAddToNext: (list: T[]) => Promise<void> | void;
  busy?: boolean;
};

/** Bulk actions for ticked defects (office only). Reason stays internal. */
export default function DefectBulkBar<T extends ChargeableDefect>({ selected, onClear, onChanged, onQuote, onAddToNext, busy }: Props<T>) {
  const [ncOpen, setNcOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<{ chargeable: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  if (!selected.length) return null;

  const apply = async (chargeable: boolean) => {
    const { change, blocked } = bulkChargeTargets(selected, chargeable);
    setSaving(true);
    let ok = 0; const failed: string[] = [];
    for (const d of change) {
      const { error } = await supabase.rpc("set_defect_chargeable", { _defect_id: d.id, _chargeable: chargeable, _reason: chargeable ? null : (reason.trim() || null) });
      if (error) failed.push(error.message); else ok++;
    }
    setSaving(false); setConfirm(null); setNcOpen(false); setReason("");
    const label = chargeable ? "Chargeable" : "No charge (our work)";
    if (ok) toast.success(`${ok} defect${ok === 1 ? "" : "s"} set to ${label}`);
    else if (!failed.length && !blocked.length) toast.info(`All ticked defects were already ${label}`);
    if (blocked.length) toast.warning(`${blocked.length} skipped: already on a quote. Remove from the quote first.`);
    if (failed.length) toast.error(`${failed.length} couldn't be changed: ${failed[0]}`);
    onClear(); onChanged();
  };

  const request = (chargeable: boolean) => {
    const n = bulkChargeTargets(selected, chargeable).change.length;
    if (needsBulkConfirm(n)) setConfirm({ chargeable }); else void apply(chargeable);
  };

  const quote = async () => {
    const { quotable, noCharge, other } = splitForQuote(selected);
    if (noCharge.length) toast.info(`${noCharge.length} skipped: No charge (our work)`);
    if (other.length) toast.info(`${other.length} skipped: already quoted or not open`);
    if (!quotable.length) { toast.error("None of the ticked defects can be quoted"); return; }
    await onQuote(quotable);
  };

  const confirmN = confirm ? bulkChargeTargets(selected, confirm.chargeable).change.length : 0;
  const working = saving || busy;
  return (
    <Card className="border-primary/40">
      <CardContent className="flex flex-wrap items-center gap-2 p-3">
        <span className="text-sm font-medium mr-1">{selected.length} selected</span>
        <Button size="sm" variant="outline" disabled={working} onClick={() => setNcOpen(true)}>Set to No charge (our work)</Button>
        <Button size="sm" variant="outline" disabled={working} onClick={() => request(true)}>Set to Chargeable</Button>
        <Button size="sm" variant="secondary" disabled={working} onClick={quote}><FileText className="mr-1.5 h-4 w-4" />Quote selected</Button>
        <Button size="sm" disabled={working} onClick={() => onAddToNext(selected)}>
          {working ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ClipboardList className="mr-1.5 h-4 w-4" />}Add to next service report
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>
      </CardContent>

      <Dialog open={ncOpen} onOpenChange={setNcOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set {selected.length} to No charge (our work)</DialogTitle>
            <DialogDescription>The reason is internal only. Customers only see "Rectified at no charge".</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Reason (optional)</Label>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Our install" maxLength={120} />
            <div className="mt-1 flex flex-wrap gap-1">
              {NO_CHARGE_REASONS.map(r => <Button key={r} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReason(r)}>{r}</Button>)}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNcOpen(false)}>Cancel</Button>
            <Button disabled={saving} onClick={() => request(false)}>{saving ? "Saving…" : "Apply"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirm} onOpenChange={o => !o && setConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set {confirmN} defects to {confirm?.chargeable ? "Chargeable" : "No charge"}?</DialogTitle>
            <DialogDescription>This changes all {confirmN} ticked defects at once.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button disabled={saving} onClick={() => confirm && apply(confirm.chargeable)}>{saving ? "Saving…" : "Yes, change them"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
