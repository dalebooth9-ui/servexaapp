import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Car, Loader2, Plus, Search } from "lucide-react";

type Vehicle = {
  id: string;
  registration: string;
  label: string | null;
  make: string | null;
  model: string | null;
  default_engineer_id: string | null;
  active: boolean;
};

type Engineer = { user_id: string; full_name: string | null };

export default function FleetVehicles() {
  const [rows, setRows] = useState<Vehicle[]>([]);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Vehicle>>({});

  const load = async () => {
    setLoading(true);
    const [{ data: v }, { data: eng }] = await Promise.all([
      supabase.from("vehicles").select("*").order("registration"),
      supabase.from("profiles").select("user_id, full_name").order("full_name"),
    ]);
    setRows((v as Vehicle[]) || []);
    setEngineers((eng as Engineer[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openEdit = (v: Vehicle) => { setEditing(v); setForm(v); };
  const openAdd = () => { setForm({ registration: "", active: true }); setAddOpen(true); };

  const engName = (id: string | null) => engineers.find((e) => e.user_id === id)?.full_name || "—";

  const save = async () => {
    if (!form.registration?.trim()) { toast.error("Registration required"); return; }
    setSaving(true);
    try {
      const payload = {
        registration: form.registration.trim(),
        label: form.label || null,
        make: form.make || null,
        model: form.model || null,
        default_engineer_id: form.default_engineer_id || null,
        active: form.active ?? true,
      };
      if (editing) {
        const { error } = await supabase.from("vehicles").update(payload as any).eq("id", editing.id);
        if (error) throw error;
        toast.success("Vehicle updated");
      } else {
        const { error } = await supabase.from("vehicles").insert(payload as any);
        if (error) throw error;
        toast.success("Vehicle added");
      }
      setEditing(null); setAddOpen(false); setForm({});
      await load();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (v: Vehicle, active: boolean) => {
    const { error } = await supabase.from("vehicles").update({ active } as any).eq("id", v.id);
    if (error) { toast.error(error.message); return; }
    toast.success(active ? "Vehicle reactivated" : "Vehicle deactivated");
    await load();
  };

  const filtered = rows
    .filter((v) => (showInactive ? true : v.active))
    .filter((v) => {
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (
        v.registration.toLowerCase().includes(s) ||
        (v.label || "").toLowerCase().includes(s) ||
        (v.make || "").toLowerCase().includes(s) ||
        (v.model || "").toLowerCase().includes(s) ||
        engName(v.default_engineer_id).toLowerCase().includes(s)
      );
    });

  return (
    <>
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/15 p-2.5"><Car className="h-6 w-6 text-primary" /></div>
            <div>
              <h1 className="text-2xl font-bold">Fleet vehicles</h1>
              <p className="text-sm text-muted-foreground">Manage the vehicles that appear in engineers' daily check dropdown.</p>
            </div>
          </div>
          <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1.5" /> Add vehicle</Button>
        </div>

        <Card className="p-3 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reg, label, engineer…" className="pl-8" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Show deactivated
          </label>
        </Card>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No vehicles.</div>
          ) : (
            <div className="divide-y">
              <div className="grid grid-cols-12 gap-3 px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/40">
                <div className="col-span-2">Reg</div>
                <div className="col-span-3">Label</div>
                <div className="col-span-3">Make / model</div>
                <div className="col-span-3">Default engineer</div>
                <div className="col-span-1 text-right">Status</div>
              </div>
              {filtered.map((v) => (
                <button
                  key={v.id}
                  onClick={() => openEdit(v)}
                  className="w-full grid grid-cols-12 gap-3 px-4 py-3 text-sm text-left hover:bg-muted/40 transition-colors"
                >
                  <div className="col-span-2 font-mono font-semibold">{v.registration}</div>
                  <div className="col-span-3 truncate">{v.label || <span className="text-muted-foreground">—</span>}</div>
                  <div className="col-span-3 truncate">{[v.make, v.model].filter(Boolean).join(" ") || <span className="text-muted-foreground">—</span>}</div>
                  <div className="col-span-3 truncate">{engName(v.default_engineer_id)}</div>
                  <div className="col-span-1 text-right">
                    {v.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Off</Badge>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Dialog open={!!editing || addOpen} onOpenChange={(o) => { if (!o) { setEditing(null); setAddOpen(false); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit vehicle" : "Add vehicle"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Registration *</Label>
              <Input
                value={form.registration || ""}
                onChange={(e) => setForm({ ...form, registration: e.target.value.toUpperCase() })}
                className="uppercase font-mono"
                placeholder="AB12 CDE"
              />
            </div>
            <div>
              <Label className="text-xs">Label / nickname</Label>
              <Input value={form.label || ""} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Big Transit" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Make</Label>
                <Input value={form.make || ""} onChange={(e) => setForm({ ...form, make: e.target.value })} placeholder="Ford" />
              </div>
              <div>
                <Label className="text-xs">Model</Label>
                <Input value={form.model || ""} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Transit Custom" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Default engineer</Label>
              <Select
                value={form.default_engineer_id || "__none__"}
                onValueChange={(v) => setForm({ ...form, default_engineer_id: v === "__none__" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {engineers.map((e) => (
                    <SelectItem key={e.user_id} value={e.user_id}>{e.full_name || e.user_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm pt-1">
              <Switch checked={form.active ?? true} onCheckedChange={(c) => setForm({ ...form, active: c })} />
              Active (shown in engineers' dropdown)
            </label>
          </div>
          <DialogFooter className="gap-2">
            {editing && (
              <Button
                variant="outline"
                onClick={() => { setActive(editing, !editing.active); setEditing(null); }}
              >
                {editing.active ? "Deactivate" : "Reactivate"}
              </Button>
            )}
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
