import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { renderToStaticMarkup } from "react-dom/server";
import { Printer, Truck, Trash2, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { vanQrUrl } from "@/lib/vanClock";

type Van = { id: string; name: string; registration: string | null; qr_token: string; active: boolean };

function printSticker(v: Van) {
  const svg = renderToStaticMarkup(<QRCodeSVG value={vanQrUrl(v.qr_token)} size={300} level="M" />);
  const w = window.open("", "_blank", "width=480,height=640");
  if (!w) { toast.error("Allow pop-ups to print the sticker"); return; }
  w.document.write(`<!doctype html><html><head><title>${v.name} sticker</title><style>@page{size:80mm 100mm;margin:4mm}body{font-family:system-ui,sans-serif;text-align:center;margin:0}h1{font-size:18px;margin:6px 0 2px}p{margin:2px 0;font-size:13px}svg{width:62mm;height:62mm}</style></head><body>${svg}<h1>${v.name}${v.registration ? ` · ${v.registration}` : ""}</h1><p>Scan to start / finish your day</p><script>window.onload=()=>{window.print()}</script></body></html>`);
  w.document.close();
}

export default function VansSettings() {
  const { orgId } = useAuth() as any;
  const [vans, setVans] = useState<Van[]>([]);
  const [name, setName] = useState(""); const [reg, setReg] = useState("");
  const [rules, setRules] = useState({ standard_break_minutes: 0, break_button_enabled: true, missing_finish_time: "20:00", far_scan_km: 5, min_day_minutes: 2 });

  const load = async () => {
    const { data } = await supabase.from("vans").select("id, name, registration, qr_token, active").order("name");
    setVans((data as Van[]) || []);
    const { data: s } = await supabase.from("timesheet_settings").select("*").maybeSingle();
    if (s) setRules({ standard_break_minutes: s.standard_break_minutes, break_button_enabled: s.break_button_enabled, missing_finish_time: String(s.missing_finish_time).slice(0, 5), far_scan_km: Number(s.far_scan_km), min_day_minutes: s.min_day_minutes });
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from("vans").insert({ name: name.trim(), registration: reg.trim().toUpperCase() || null } as any);
    if (error) return toast.error(error.message);
    setName(""); setReg(""); load();
  };
  const toggle = async (v: Van) => { await supabase.from("vans").update({ active: !v.active }).eq("id", v.id); load(); };
  const remove = async (v: Van) => {
    if (!confirm(`Remove ${v.name}? Past timesheet days keep their times.`)) return;
    const { error } = await supabase.from("vans").delete().eq("id", v.id);
    if (error) toast.error(error.message); else load();
  };
  const saveRules = async () => {
    const { data: org } = await supabase.rpc("get_user_org_id");
    const { error } = await supabase.from("timesheet_settings").upsert({ org_id: org ?? orgId, ...rules, updated_at: new Date().toISOString() } as any);
    if (error) toast.error(error.message); else toast.success("Timesheet rules saved");
  };

  return (
    <>
      <Card data-assistant-target="Vans">
        <CardHeader>
          <div className="flex items-center gap-2"><Truck className="h-5 w-5 text-primary" /><CardTitle className="text-lg">Vans</CardTitle></div>
          <CardDescription>Each van gets one QR sticker for the dashboard. Engineers scan it to start and finish their day — they must be logged in as themselves.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input placeholder="Van name (e.g. Van 3)" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="Registration" value={reg} onChange={(e) => setReg(e.target.value)} />
            <Button onClick={add} disabled={!name.trim()}>Add van</Button>
          </div>
          {vans.length === 0 ? <p className="text-sm text-muted-foreground">No vans yet.</p> : (
            <div className="grid gap-3 sm:grid-cols-2">
              {vans.map((v) => (
                <div key={v.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="rounded bg-background p-1"><QRCodeSVG value={vanQrUrl(v.qr_token)} size={72} level="M" /></div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate font-medium">{v.name}</p>
                    <p className="text-xs text-muted-foreground">{v.registration || "No reg"} · {v.active ? "In use" : "Not in use"}</p>
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" onClick={() => printSticker(v)}><Printer className="mr-1 h-3 w-3" />Print sticker</Button>
                      <Button size="sm" variant="ghost" onClick={() => toggle(v)}>{v.active ? "Retire" : "Reuse"}</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(v)} aria-label="Remove van"><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card data-assistant-target="Timesheet rules">
        <CardHeader>
          <div className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" /><CardTitle className="text-lg">Timesheet rules</CardTitle></div>
          <CardDescription>Break rule, missing-finish time and what gets flagged for the office. Hours only — no pay is shown.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1"><Label>Standard unpaid break (minutes)</Label><Input type="number" min={0} value={rules.standard_break_minutes} onChange={(e) => setRules({ ...rules, standard_break_minutes: Math.max(0, +e.target.value || 0) })} /><p className="text-xs text-muted-foreground">Taken off any day with no break recorded. 0 = none.</p></div>
          <div className="flex items-center justify-between gap-2 rounded-lg border p-3"><Label>Show Start break / End break buttons</Label><Switch checked={rules.break_button_enabled} onCheckedChange={(c) => setRules({ ...rules, break_button_enabled: c })} /></div>
          <div className="space-y-1"><Label>Mark "Missing finish" after</Label><Input type="time" value={rules.missing_finish_time} onChange={(e) => setRules({ ...rules, missing_finish_time: e.target.value })} /></div>
          <div className="space-y-1"><Label>Flag scans further than (km) from usual start</Label><Input type="number" min={1} value={rules.far_scan_km} onChange={(e) => setRules({ ...rules, far_scan_km: Math.max(1, +e.target.value || 5) })} /></div>
          <div className="space-y-1"><Label>Flag days shorter than (minutes)</Label><Input type="number" min={0} value={rules.min_day_minutes} onChange={(e) => setRules({ ...rules, min_day_minutes: Math.max(0, +e.target.value || 0) })} /></div>
          <div className="flex items-end"><Button onClick={saveRules}>Save rules</Button></div>
        </CardContent>
      </Card>
    </>
  );
}
