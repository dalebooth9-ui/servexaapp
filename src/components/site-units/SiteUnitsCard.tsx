import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, MapPin } from "lucide-react";
import { plainError } from "@/lib/plainError";
import { UNIT_KINDS, type UnitKind } from "@/lib/siteUnits";

type Unit = { id: string; unit_number: number; location: string | null; unit_type: string | null; last_reading: number | null; last_reading_unit: string | null; last_result: string | null; last_inspected: string | null; access_notes: string | null };
const fmt = (d?: string | null) => (d ? format(new Date(d), "dd/MM/yyyy") : "—");

/** Register of numbered units at a site (hydrants now; reusable for other kinds). */
export default function SiteUnitsCard({ siteId, kind = "hydrant" }: { siteId: string; kind?: UnitKind }) {
  const { userRole } = useAuth() as any;
  const isAdmin = userRole === "admin";
  const cfg = UNIT_KINDS[kind];
  const [units, setUnits] = useState<Unit[]>([]);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("10");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("site_units").select("id,unit_number,location,unit_type,last_reading,last_reading_unit,last_result,last_inspected,access_notes").eq("site_id", siteId).eq("unit_kind", kind).order("unit_number");
    if (error) { toast.error(plainError(error)); return; }
    setUnits((data as Unit[]) || []);
    if ((data || []).length) setOpen(true);
  }, [siteId, kind]);
  useEffect(() => { load(); }, [load]);

  const bulkAdd = async () => {
    const a = Number(from), b = Number(to);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a) { toast.error(`Enter a range like 1 to 10.`); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("bulk_add_site_units", { _site_id: siteId, _kind: kind, _from: a, _to: b });
    setBusy(false);
    if (error) { toast.error(plainError(error)); return; }
    toast.success(`${data ?? 0} ${cfg.plural.toLowerCase()} added${(data ?? 0) < b - a + 1 ? " (existing numbers kept)" : ""}`);
    load();
  };

  const save = async (u: Unit, patch: Partial<Unit>) => {
    setUnits((list) => list.map((x) => (x.id === u.id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("site_units").update({ ...patch, updated_at: new Date().toISOString() } as any).eq("id", u.id);
    if (error) { toast.error(plainError(error)); load(); }
  };

  const remove = async (u: Unit) => {
    if (!confirm(`Remove ${cfg.singular} ${u.unit_number} from this site? Its past reports stay on their jobs.`)) return;
    const { error } = await supabase.from("site_units").delete().eq("id", u.id);
    if (error) toast.error(plainError(error)); else load();
  };

  if (!open && !isAdmin) return null;
  return (
    <section className="rounded-md border p-3 space-y-3" aria-label={`${cfg.plural} at this site`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />{cfg.plural} {units.length > 0 && <Badge variant="secondary">{units.length}</Badge>}</h3>
        {!open && isAdmin && <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Add {cfg.plural.toLowerCase()}</Button>}
      </div>
      {open && (
        <>
          {isAdmin && (
            <div className="flex flex-wrap items-end gap-2">
              <span className="text-sm">Bulk-add {cfg.plural.toLowerCase()}</span>
              <Input aria-label="From number" className="w-16" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-sm">to</span>
              <Input aria-label="To number" className="w-16" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} />
              <Button size="sm" onClick={bulkAdd} disabled={busy}><Plus className="mr-1 h-4 w-4" />Add</Button>
            </div>
          )}
          {units.length === 0 ? (
            <p className="text-sm text-muted-foreground">No {cfg.plural.toLowerCase()} recorded yet. Filing a scanned sheet adds them automatically by number.</p>
          ) : (
            <div className="space-y-2">
              {units.map((u) => (
                <div key={u.id} className="rounded border p-2 grid gap-2 sm:grid-cols-[4rem_1fr_9rem_1fr_auto] items-start">
                  <div className="font-medium text-sm pt-2">{cfg.singular} {u.unit_number}</div>
                  <Input aria-label={`${cfg.singular} ${u.unit_number} location`} placeholder="Site of main / location" defaultValue={u.location || ""} disabled={!isAdmin} onBlur={(e) => e.target.value !== (u.location || "") && save(u, { location: e.target.value || null })} />
                  {cfg.types.length > 0 ? (
                    <Select value={u.unit_type || ""} onValueChange={(v) => save(u, { unit_type: v })} disabled={!isAdmin}>
                      <SelectTrigger aria-label={`${cfg.singular} ${u.unit_number} type`}><SelectValue placeholder="Type" /></SelectTrigger>
                      <SelectContent>{Array.from(new Set([...cfg.types, ...(u.unit_type ? [u.unit_type] : [])])).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : <span />}
                  <Input aria-label={`${cfg.singular} ${u.unit_number} access notes`} placeholder="Access notes (keys, padlocks…)" defaultValue={u.access_notes || ""} disabled={!isAdmin} onBlur={(e) => e.target.value !== (u.access_notes || "") && save(u, { access_notes: e.target.value || null })} />
                  {isAdmin ? <Button size="icon" variant="ghost" aria-label={`Remove ${cfg.singular} ${u.unit_number}`} onClick={() => remove(u)}><Trash2 className="h-4 w-4" /></Button> : <span />}
                  <div className="sm:col-span-5 text-xs text-muted-foreground">
                    {cfg.readingLabel}: {u.last_reading != null ? `${u.last_reading} ${u.last_reading_unit || cfg.readingUnit || ""}` : "—"} · Last inspected: {fmt(u.last_inspected)}{u.last_result ? ` · Last result: ${u.last_result === "fail" ? "Fail" : "Pass"}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
