import { useEffect, useState } from "react";
import { format, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { buildWeeklySheetRows, groupSheets, type WeeklySheetInput } from "@/lib/weeklySheet";
import { buildWeeklySheetPdf } from "@/lib/weeklySheetPdf";
import { getGeneratingOrgFallbackLogoUrl } from "@/lib/generatingOrgBranding";
import { resolveToSignedUrl } from "@/lib/durableStorageRef";
import { trimLogoToInk } from "@/lib/trimLogo";
import { plainError } from "@/lib/plainError";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; weekStart: Date; engineers: { user_id: string; full_name: string }[] }

const pcRe = /[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i;

export default function PrintWeeklySheetDialog({ open, onOpenChange, weekStart, engineers }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [combined, setCombined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<{ blob: Blob; name: string } | null>(null);
  useEffect(() => { if (open) { setPicked(new Set(engineers.map((e) => e.user_id))); setReady(null); setCombined(false); } }, [open, engineers]);

  const prepare = async () => {
    setBusy(true); setReady(null);
    try {
      const from = format(weekStart, "yyyy-MM-dd"), to = format(addDays(weekStart, 6), "yyyy-MM-dd");
      const { data: sched, error } = await supabase.from("job_schedule").select("job_id, engineer_id, schedule_date, notes")
        .gte("schedule_date", from).lte("schedule_date", to).in("engineer_id", [...picked]);
      if (error) throw error;
      const jobIds = [...new Set((sched || []).map((s) => s.job_id))];
      const { data: jobs } = jobIds.length ? await supabase.from("jobs")
        .select("id, name, priority, is_remedial, job_type, category, customer, customer_po, address, site_id, pressure_test_qty, visual_qty, other_qty, other_service_type, sites(name, address, postcode), customers(name)")
        .in("id", jobIds) : { data: [] as any[] };
      const siteIds = [...new Set((jobs || []).map((j: any) => j.site_id).filter(Boolean))];
      const { data: access } = siteIds.length ? await supabase.from("site_access_info").select("site_id, details").in("site_id", siteIds) : { data: [] as any[] };
      const byJob = new Map((jobs || []).map((j: any) => [j.id, j]));
      const byAccess = new Map((access || []).map((a: any) => [a.site_id, a.details]));
      const engName = new Map(engineers.map((e) => [e.user_id, e.full_name]));
      const inputs: WeeklySheetInput[] = (sched || []).flatMap((s) => {
        const j: any = byJob.get(s.job_id); if (!j) return [];
        const addr = j.sites?.address || j.address || "";
        return [{
          date: s.schedule_date, engineerId: s.engineer_id, engineerName: engName.get(s.engineer_id) || "Engineer",
          company: j.customers?.name || j.customer || "", siteName: j.sites?.name || "", siteAddress: addr,
          postcode: j.sites?.postcode || (addr.match(pcRe)?.[0] || "").toUpperCase(), jobName: j.name,
          pressureQty: j.pressure_test_qty || 0, visualQty: j.visual_qty || 0, otherQty: j.other_qty || 0, otherType: j.other_service_type,
          priority: j.priority, isRemedial: !!j.is_remedial, jobType: `${j.job_type || ""} ${j.category || ""}`, po: j.customer_po,
          scheduleNotes: s.notes, access: byAccess.get(j.site_id) || null,
        }];
      });
      const rows = buildWeeklySheetRows(inputs);
      let sheets = groupSheets(rows, combined);
      if (!combined) {
        const have = new Set(sheets.map((s) => s.title));
        for (const id of picked) { const n = (engName.get(id) || "").toUpperCase(); if (n && !have.has(n)) sheets.push({ title: n, rows: [] }); }
        sheets = sheets.sort((a, b) => a.title.localeCompare(b.title));
      }
      let logo: string | null = null;
      try { const l = await getGeneratingOrgFallbackLogoUrl(); const raw = l?.startsWith("/") ? l : await resolveToSignedUrl(l); logo = raw ? await trimLogoToInk(raw) : null; } catch { logo = null; }
      const blob = await buildWeeklySheetPdf(weekStart, sheets, logo);
      setReady({ blob, name: `Weekly sheet ${format(weekStart, "dd-MM-yyyy")}${combined ? " - All engineers" : ""}.pdf` });
    } catch (e) { toast.error("Weekly sheet not made", { description: plainError(e) }); }
    finally { setBusy(false); }
  };

  const print = () => {
    if (!ready) return;
    const url = URL.createObjectURL(ready.blob);
    const w = window.open(url, "_blank");
    if (!w) toast.error("Your browser blocked the print window. Use Download PDF instead.");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const download = () => {
    if (!ready) return;
    const url = URL.createObjectURL(ready.blob);
    const a = document.createElement("a"); a.href = url; a.download = ready.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  const toggle = (id: string, on: boolean) => { setReady(null); setPicked((p) => { const n = new Set(p); on ? n.add(id) : n.delete(id); return n; }); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Print weekly sheet — w/c {format(weekStart, "dd/MM/yyyy")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Engineers</Label>
            <div className="flex gap-2 text-sm">
              <button type="button" className="text-primary underline" onClick={() => { setReady(null); setPicked(new Set(engineers.map((e) => e.user_id))); }}>All</button>
              <button type="button" className="text-primary underline" onClick={() => { setReady(null); setPicked(new Set()); }}>None</button>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto rounded border p-2 space-y-1">
            {engineers.map((e) => (
              <label key={e.user_id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={picked.has(e.user_id)} onChange={(ev) => toggle(e.user_id, ev.target.checked)} />{e.full_name}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={combined} onChange={(e) => { setReady(null); setCombined(e.target.checked); }} />
            One combined sheet for the whole company
          </label>
          <p className="text-xs text-muted-foreground">Rows go by date then postcode area. Remedial, priority and SOS jobs are shaded pink.</p>
        </div>
        <DialogFooter className="gap-2">
          {!ready ? (
            <Button onClick={prepare} disabled={busy || picked.size === 0}>{busy ? "Preparing…" : "Prepare sheet"}</Button>
          ) : (<>
            <Button variant="outline" onClick={download}>Download PDF</Button>
            <Button onClick={print}>Print weekly sheet</Button>
          </>)}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
