import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UKDateInput } from "@/components/ui/uk-date-input";
import { toast } from "sonner";
import { plainError } from "@/lib/plainError";
import { usePlannerConfig } from "@/hooks/usePlannerConfig";
import JobFlagsFields, { flagsFromJob, flagsToUpdate, type JobFlagsValue } from "@/components/jobs/JobFlagsFields";

/** Office-only: time/access flags, tags, two-engineer tick and follow-up reminders for one job. */
export default function JobPlanningCard({ job, onSaved }: { job: any; onSaved?: () => void }) {
  const { on } = usePlannerConfig();
  const [v, setV] = useState<JobFlagsValue>(flagsFromJob(job));
  const [two, setTwo] = useState(!!job.two_engineer_ok);
  const [saving, setSaving] = useState(false);
  const [fus, setFus] = useState<any[]>([]);
  const [fuDate, setFuDate] = useState(""); const [fuNote, setFuNote] = useState("");
  useEffect(() => { setV(flagsFromJob(job)); setTwo(!!job.two_engineer_ok); }, [job?.id]);
  const loadFus = async () => { const { data } = await supabase.from("job_follow_ups").select("*").eq("job_id", job.id).order("due_date"); setFus(data || []); };
  useEffect(() => { loadFus(); }, [job?.id]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("jobs").update({ ...flagsToUpdate(v, { flags: on("flags"), tags: on("tags") }), ...(on("clash") ? { two_engineer_ok: two } : {}) } as any).eq("id", job.id);
    setSaving(false);
    if (error) toast.error("Not saved", { description: plainError(error) }); else { toast.success("Time, access and tags saved"); onSaved?.(); }
  };
  const addFu = async () => {
    if (!fuDate || !fuNote.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("job_follow_ups").insert({ job_id: job.id, due_date: fuDate, note: fuNote.trim(), created_by: u.user?.id } as any);
    if (error) { toast.error("Reminder not saved", { description: plainError(error) }); return; }
    setFuDate(""); setFuNote(""); loadFus();
  };
  const setDone = async (id: string, done: boolean) => { await supabase.from("job_follow_ups").update({ done_at: done ? new Date().toISOString() : null } as any).eq("id", id); loadFus(); };
  const del = async (id: string) => { await supabase.from("job_follow_ups").delete().eq("id", id); loadFus(); };

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Planning</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {(on("flags") || on("tags") || on("clash")) && <>
        {(on("flags") || on("tags")) && <JobFlagsFields value={v} onChange={setV} idPrefix="jp" />}
        {on("clash") && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={two} onChange={(e) => setTwo(e.target.checked)} />Deliberate two-engineer job (no double-booking warning)</label>}
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </>}
        {on("followUps") && <div className="border-t pt-3 space-y-2">
          <h4 className="text-sm font-semibold">Follow-up reminders</h4>
          {!fus.length && <p className="text-xs text-muted-foreground">None yet. Due reminders show on the office dashboard.</p>}
          {fus.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 text-sm">
              <input type="checkbox" aria-label="Done" checked={!!f.done_at} onChange={(e) => setDone(f.id, e.target.checked)} />
              <span className={f.done_at ? "line-through text-muted-foreground" : ""}>{format(new Date(`${f.due_date}T12:00:00`), "dd/MM/yyyy")} — {f.note}</span>
              <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => del(f.id)}>Remove</Button>
            </div>
          ))}
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] items-end">
            <div className="space-y-1"><Label className="text-xs">Remind on</Label><UKDateInput value={fuDate} onChange={(e) => setFuDate(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs" htmlFor="fu-note">What to do</Label><Input id="fu-note" placeholder="e.g. email in March with quote for April" value={fuNote} onChange={(e) => setFuNote(e.target.value)} /></div>
            <Button size="sm" variant="outline" onClick={addFu} disabled={!fuDate || !fuNote.trim()}>Add reminder</Button>
          </div>
        </div>}
      </CardContent>
    </Card>
  );
}
