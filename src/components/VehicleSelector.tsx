import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

export type VehicleRow = {
  id: string;
  registration: string;
  label: string | null;
  default_engineer_id: string | null;
  active: boolean;
};

type Props = {
  engineerId: string | null;
  value: string; // vehicle_id ("" if none / new)
  reg: string;   // free-text reg (used when adding new)
  onChange: (vehicleId: string, reg: string) => void;
  invalid?: boolean;
};

const ADD_NEW = "__add_new__";

export default function VehicleSelector({ engineerId, value, reg, onChange, invalid }: Props) {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingNew, setAddingNew] = useState(false);
  const [newReg, setNewReg] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("vehicles")
      .select("id, registration, label, default_engineer_id, active")
      .eq("active", true)
      .order("registration");
    setVehicles((data as VehicleRow[]) || []);
    setLoading(false);
    return (data as VehicleRow[]) || [];
  };

  useEffect(() => {
    (async () => {
      const rows = await load();
      // Auto-default: only if nothing chosen yet
      if (!value && engineerId) {
        const mine = rows.find((v) => v.default_engineer_id === engineerId);
        if (mine) {
          onChange(mine.id, mine.registration);
          return;
        }
        // Fall back to last-checked vehicle by this engineer
        const { data: last } = await supabase
          .from("vehicle_checks")
          .select("vehicle_id, vehicle_reg")
          .eq("engineer_id", engineerId)
          .not("vehicle_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (last?.vehicle_id) {
          const match = rows.find((v) => v.id === last.vehicle_id);
          if (match) onChange(match.id, match.registration);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineerId]);

  const handleSelect = (val: string) => {
    if (val === ADD_NEW) {
      setAddingNew(true);
      onChange("", "");
      return;
    }
    setAddingNew(false);
    const v = vehicles.find((x) => x.id === val);
    onChange(val, v?.registration || "");
  };

  const saveNew = async () => {
    const cleaned = newReg.toUpperCase().replace(/\s+/g, "");
    if (!cleaned) {
      toast.error("Enter a registration");
      return;
    }
    setSaving(true);
    try {
      // Look up existing (case/whitespace-insensitive) first
      const { data: existing } = await supabase
        .from("vehicles")
        .select("id, registration, label, default_engineer_id, active")
        .eq("registration", cleaned)
        .maybeSingle();
      let row = existing as VehicleRow | null;
      if (!row) {
        const { data, error } = await supabase
          .from("vehicles")
          .insert({ registration: cleaned, default_engineer_id: engineerId } as any)
          .select("id, registration, label, default_engineer_id, active")
          .single();
        if (error) throw error;
        row = data as VehicleRow;
      } else if (!row.active) {
        // Reactivate
        await supabase.from("vehicles").update({ active: true } as any).eq("id", row.id);
        row = { ...row, active: true };
      }
      await load();
      onChange(row!.id, row!.registration);
      setAddingNew(false);
      setNewReg("");
      toast.success("Vehicle added");
    } catch (e: any) {
      toast.error(e.message || "Failed to add vehicle");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Label className="text-xs">Vehicle <span className="text-destructive">*</span></Label>
      {addingNew ? (
        <div className="flex gap-2">
          <Input
            autoFocus
            value={newReg}
            onChange={(e) => setNewReg(e.target.value.toUpperCase())}
            placeholder="AB12 CDE"
            className="uppercase"
          />
          <Button type="button" size="sm" onClick={saveNew} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => { setAddingNew(false); setNewReg(""); }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Select value={value || undefined} onValueChange={handleSelect} disabled={loading}>
          <SelectTrigger
            className={invalid ? "border-destructive ring-1 ring-destructive/30" : ""}
            aria-invalid={invalid || undefined}
          >
            <SelectValue placeholder={loading ? "Loading…" : "Select your vehicle"} />
          </SelectTrigger>
          <SelectContent>
            {vehicles.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.registration}{v.label ? ` — ${v.label}` : ""}
              </SelectItem>
            ))}
            <SelectItem value={ADD_NEW}>
              <span className="flex items-center gap-1.5 text-primary">
                <Plus className="h-3.5 w-3.5" /> Add new vehicle…
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      )}
      {invalid && !addingNew && (
        <p className="text-[11px] text-destructive mt-1">Please choose a vehicle</p>
      )}
      {reg && !addingNew && value && (
        <p className="text-[11px] text-muted-foreground mt-1">Reg: {reg}</p>
      )}
    </div>
  );
}
