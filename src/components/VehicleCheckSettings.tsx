import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, GripVertical, Car, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_VEHICLE_CHECK_ITEMS,
  loadVehicleCheckItems,
  saveVehicleCheckItems,
  type VehicleCheckItem,
} from "@/lib/vehicleCheckItems";

function slugify(label: string) {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || `item_${Date.now()}`;
}

export default function VehicleCheckSettings() {
  const [items, setItems] = useState<VehicleCheckItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadVehicleCheckItems().then((rows) => { setItems(rows); setLoading(false); });
  }, []);

  const update = (idx: number, patch: Partial<VehicleCheckItem>) =>
    setItems((arr) => arr.map((i, n) => (n === idx ? { ...i, ...patch } : i)));

  const remove = (idx: number) => setItems((arr) => arr.filter((_, n) => n !== idx));

  const move = (idx: number, dir: -1 | 1) =>
    setItems((arr) => {
      const next = [...arr];
      const t = idx + dir;
      if (t < 0 || t >= next.length) return arr;
      [next[idx], next[t]] = [next[t], next[idx]];
      return next;
    });

  const add = () => {
    const base = "new_item";
    let key = base, n = 1;
    while (items.some((i) => i.key === key)) key = `${base}_${++n}`;
    setItems((arr) => [...arr, { key, label: "New check item", allow_na: false }]);
  };

  const resetDefaults = () => setItems(DEFAULT_VEHICLE_CHECK_ITEMS);

  const save = async () => {
    // dedupe keys
    const seen = new Set<string>();
    const cleaned: VehicleCheckItem[] = [];
    for (const it of items) {
      let key = (it.key || slugify(it.label)).trim();
      while (seen.has(key)) key = `${key}_2`;
      seen.add(key);
      cleaned.push({ ...it, key });
    }
    setSaving(true);
    try {
      await saveVehicleCheckItems(cleaned);
      setItems(cleaned);
      toast.success("Vehicle check list saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Car className="h-5 w-5 text-accent" />
          <CardTitle className="text-lg">Vehicle Check List</CardTitle>
        </div>
        <CardDescription>
          Edit the daily walk-around items engineers complete. Enable "N/A" for items that don't apply to every vehicle (e.g. ladder, fire extinguisher).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-lg border p-2">
                  <div className="flex flex-col">
                    <button type="button" onClick={() => move(idx, -1)} className="h-4 text-xs text-muted-foreground hover:text-foreground leading-none">▲</button>
                    <GripVertical className="h-3 w-3 text-muted-foreground" />
                    <button type="button" onClick={() => move(idx, 1)} className="h-4 text-xs text-muted-foreground hover:text-foreground leading-none">▼</button>
                  </div>
                  <Input
                    value={it.label}
                    onChange={(e) => update(idx, { label: e.target.value })}
                    className="flex-1 h-8 text-sm"
                    placeholder="Check label"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                    <Switch checked={!!it.allow_na} onCheckedChange={(v) => update(idx, { allow_na: v })} />
                    N/A
                  </label>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(idx)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={add}><Plus className="h-3.5 w-3.5 mr-1.5" /> Add item</Button>
              <Button variant="ghost" size="sm" onClick={resetDefaults}><RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset to defaults</Button>
              <div className="flex-1" />
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                Save
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
