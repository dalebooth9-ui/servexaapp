import { useEffect, useState } from "react";
import { Coffee, Loader2, LogIn, LogOut, MapPin, CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTimeClock } from "@/hooks/useTimeClock";
import { fmtHM, londonTime, workedMinutes } from "@/lib/vanClock";

export const LOCATION_NOTE = "Your phone's location is recorded only when you start and finish your day.";

export function useFirstName() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle().then(({ data }) => setName((data?.full_name || "").split(" ")[0] || ""));
  }, [user]);
  return name;
}

export function useTimesheetSettings() {
  const [s, setS] = useState<{ standard_break_minutes: number; break_button_enabled: boolean } | null>(null);
  useEffect(() => { supabase.from("timesheet_settings").select("standard_break_minutes, break_button_enabled").maybeSingle().then(({ data }) => setS(data as any)); }, []);
  return s ?? { standard_break_minutes: 0, break_button_enabled: true };
}

type Confirmation = { title: string; body: string; queued?: boolean };

/** Big Start day / Finish day buttons — the backup to scanning the van sticker. */
export default function DayClockCard() {
  const clock = useTimeClock();
  const first = useFirstName();
  const settings = useTimesheetSettings();
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [done, setDone] = useState<Confirmation | null>(null);

  const start = async () => {
    try {
      const r = await clock.startDay(null, "button");
      if (r.status === "already_started") { setConfirmFinish(true); return; }
      setDone({ title: `Good morning${first ? ` ${first}` : ""}`, body: `Day started at ${londonTime(r.at)}.`, queued: r.status === "queued" });
    } catch (e: any) { toast.error(e?.message || "Could not start your day"); }
  };
  const finish = async () => {
    setConfirmFinish(false);
    try {
      const r = await clock.finishDay("button");
      const mins = r.entry ? (r.entry.total_minutes ?? workedMinutes(r.entry as any, settings.standard_break_minutes)) : null;
      setDone({ title: "Day finished", body: `Finished at ${londonTime(r.at)}.${mins != null ? ` Total today: ${fmtHM(Number(mins))}.` : ""}`, queued: r.status === "queued" });
    } catch (e: any) { toast.error(e?.message || "Could not finish your day"); }
  };

  return (
    <div className="space-y-2" data-assistant-target="Start day">
      {clock.loading ? (
        <div className="flex h-16 items-center justify-center rounded-2xl border"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : !clock.isClockedIn ? (
        <Button size="lg" className="h-16 w-full rounded-2xl text-lg font-bold" onClick={start} disabled={clock.acting}>
          {clock.acting ? <Loader2 className="mr-2 h-6 w-6 animate-spin" /> : <LogIn className="mr-2 h-6 w-6" />} Start day
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="px-1 text-sm text-muted-foreground">Day started at <strong className="text-foreground">{londonTime(clock.activeEntry!.clock_in_at)}</strong>{clock.onBreak ? " · on break" : ""}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {settings.break_button_enabled && (
              <Button size="lg" variant="outline" className="h-14 rounded-2xl text-base" onClick={() => clock.setBreak(!clock.onBreak)} disabled={clock.acting}>
                <Coffee className="mr-2 h-5 w-5" /> {clock.onBreak ? "End break" : "Start break"}
              </Button>
            )}
            <Button size="lg" variant="destructive" className="h-14 rounded-2xl text-base font-bold" onClick={() => setConfirmFinish(true)} disabled={clock.acting}>
              <LogOut className="mr-2 h-5 w-5" /> Finish day
            </Button>
          </div>
        </div>
      )}
      <p className="flex items-center gap-1 px-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{LOCATION_NOTE}</p>
      {clock.pending > 0 && <p className="flex items-center gap-1 px-1 text-xs text-muted-foreground"><CloudOff className="h-3 w-3" />{clock.pending} clock time{clock.pending > 1 ? "s" : ""} waiting to send — will send when signal returns.</p>}

      <AlertDialog open={confirmFinish} onOpenChange={setConfirmFinish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finish your working day?</AlertDialogTitle>
            <AlertDialogDescription>{clock.activeEntry ? `You started at ${londonTime(clock.activeEntry.clock_in_at)}.` : "You've already started today."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-12">Not yet</AlertDialogCancel>
            <AlertDialogAction className="h-12" onClick={finish}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ClockConfirmation value={done} onClose={() => setDone(null)} />
    </div>
  );
}

export function ClockConfirmation({ value, onClose }: { value: Confirmation | null; onClose: () => void }) {
  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="text-center">
        <DialogHeader><DialogTitle className="text-2xl">{value?.title}</DialogTitle></DialogHeader>
        <p className="text-lg">{value?.body}</p>
        {value?.queued && <p className="text-sm text-muted-foreground">No signal right now — this is saved on your phone with the real time and will send when you're back online.</p>}
        <Button size="lg" className="h-12" onClick={onClose}>OK</Button>
      </DialogContent>
    </Dialog>
  );
}
