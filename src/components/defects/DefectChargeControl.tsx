import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { NO_CHARGE_REASONS, gbp, costOf } from "@/lib/defectCharge";

type Props = {
  defect: { id: string; chargeable?: boolean | null; quote_id: string | null };
  orgId?: string | null;
  isAdmin: boolean;
  onChanged: () => void;
  /** Optional internal summary to show next to the badge (office only). */
  cost?: { reason: string | null; materials_cost: any; labour_cost: any } | null;
};

/** "Chargeable?" control. Reason and cost are office-only; customers only ever see "Rectified at no charge". */
export default function DefectChargeControl({ defect, isAdmin, onChanged, cost }: Props) {
  const noCharge = defect.chargeable === false;
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<"chargeable" | "no_charge">(noCharge ? "no_charge" : "chargeable");
  const [reason, setReason] = useState("");
  const [materials, setMaterials] = useState("");
  const [hours, setHours] = useState("");
  const [labour, setLabour] = useState("");
  const [engineer, setEngineer] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [engineers, setEngineers] = useState<{ user_id: string; full_name: string | null }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChoice(noCharge ? "no_charge" : "chargeable");
    (async () => {
      const [{ data: det }, { data: profs }] = await Promise.all([
        supabase.from("defect_no_charge_details").select("*").eq("defect_id", defect.id).maybeSingle(),
        supabase.from("profiles").select("user_id, full_name").order("full_name"),
      ]);
      setEngineers((profs || []) as any);
      setReason(det?.reason || ""); setMaterials(det?.materials_cost ? String(det.materials_cost) : "");
      setHours(det?.labour_hours ? String(det.labour_hours) : ""); setLabour(det?.labour_cost ? String(det.labour_cost) : "");
      setEngineer(det?.engineer_id || ""); setNotes(det?.notes || "");
    })();
  }, [open]);

  const save = async () => {
    setSaving(true);
    const nc = choice === "no_charge";
    const { error } = await supabase.rpc("set_defect_chargeable", { _defect_id: defect.id, _chargeable: !nc, _reason: reason || null });
    if (!error && nc) {
      const { error: e2 } = await supabase.from("defect_no_charge_details").update({
        reason: reason.trim() || null,
        materials_cost: Number(materials) || 0, labour_hours: Number(hours) || 0, labour_cost: Number(labour) || 0,
        engineer_id: engineer || null, notes: notes.trim() || null, updated_at: new Date().toISOString(),
      }).eq("defect_id", defect.id);
      if (e2) { setSaving(false); toast.error(`Saved as No charge, but the cost didn't save: ${e2.message}`); onChanged(); return; }
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(nc ? "Marked No charge (our work)" : "Marked Chargeable");
    setOpen(false); onChanged();
  };

  const badge = noCharge
    ? <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">No charge{cost?.reason ? ` · ${cost.reason}` : ""}{cost && costOf(cost) > 0 ? ` · cost ${gbp(costOf(cost))}` : ""}</Badge>
    : null;

  if (!isAdmin) return badge;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center text-xs" title="Chargeable? Change any time">
        {badge ?? <span className="text-primary hover:underline">Chargeable</span>}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chargeable?</DialogTitle>
            <DialogDescription>Reason and cost are internal only. Customers only see "Rectified at no charge".</DialogDescription>
          </DialogHeader>
          <RadioGroup value={choice} onValueChange={(v: any) => setChoice(v)} className="space-y-1">
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="chargeable" /> Chargeable (quote as normal)</label>
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="no_charge" disabled={!!defect.quote_id} /> No charge (our work)</label>
          </RadioGroup>
          {defect.quote_id && <p className="text-xs text-muted-foreground">This defect is on a quote. Remove it from the quote before marking it No charge.</p>}
          {choice === "no_charge" && (
            <div className="space-y-3">
              <div>
                <Label>Reason (internal)</Label>
                <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Our install" maxLength={120} />
                <div className="mt-1 flex flex-wrap gap-1">
                  {NO_CHARGE_REASONS.map(r => <Button key={r} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReason(r)}>{r}</Button>)}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">Materials £</Label><Input inputMode="decimal" value={materials} onChange={e => setMaterials(e.target.value)} /></div>
                <div><Label className="text-xs">Hours</Label><Input inputMode="decimal" value={hours} onChange={e => setHours(e.target.value)} /></div>
                <div><Label className="text-xs">Labour £</Label><Input inputMode="decimal" value={labour} onChange={e => setLabour(e.target.value)} /></div>
              </div>
              <div>
                <Label className="text-xs">Engineer responsible (optional)</Label>
                <Select value={engineer || "__none"} onValueChange={v => setEngineer(v === "__none" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Not set</SelectItem>
                    {engineers.map(e => <SelectItem key={e.user_id} value={e.user_id}>{e.full_name || "Unnamed"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Notes (internal)</Label><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
