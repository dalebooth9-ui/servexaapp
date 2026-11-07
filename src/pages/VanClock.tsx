import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, MapPin, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTimeClock } from "@/hooks/useTimeClock";
import { fmtHM, londonTime } from "@/lib/vanClock";
import { LOCATION_NOTE, useFirstName } from "@/components/timesheets/DayClockCard";

type Van = { id: string; name: string; registration: string | null };
const cacheKey = (t: string) => `van_qr_${t}`;

/** Van dashboard sticker scan. The engineer is the logged-in user, never the QR. */
export default function VanClock() {
  const { token = "" } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const clock = useTimeClock();
  const first = useFirstName();
  const [van, setVan] = useState<Van | null | undefined>(undefined);
  const [stage, setStage] = useState<"ready" | "confirm_finish" | "done">("ready");
  const [message, setMessage] = useState<{ title: string; body: string; queued?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate(`/auth?next=${encodeURIComponent(`/v/${token}`)}`, { replace: true }); return; }
    (async () => {
      const { data, error } = await supabase.rpc("resolve_van", { _token: token });
      if (error) {
        // No signal: use the van we saw last time this sticker was scanned.
        const cached = localStorage.getItem(cacheKey(token));
        setVan(cached ? JSON.parse(cached) : null);
        return;
      }
      const v = (data as Van[] | null)?.[0] ?? null;
      if (v) localStorage.setItem(cacheKey(token), JSON.stringify(v));
      setVan(v);
    })();
  }, [authLoading, user, token, navigate]);

  const vanName = van ? (van.registration ? `${van.name} (${van.registration})` : van.name) : "";

  const start = async () => {
    try {
      const r = await clock.startDay(van?.id ?? null, "van_qr");
      if (r.status === "already_started") { setStage("confirm_finish"); return; }
      setMessage({ title: `Good morning${first ? ` ${first}` : ""}`, body: `Day started at ${londonTime(r.at)} in ${vanName}.`, queued: r.status === "queued" });
      setStage("done");
    } catch (e: any) { setError(e?.message || "Could not start your day"); }
  };
  const finish = async () => {
    try {
      const r = await clock.finishDay("van_qr");
      const mins = r.entry?.total_minutes;
      setMessage({ title: "Day finished", body: `Finished at ${londonTime(r.at)}.${mins != null ? ` Total today: ${fmtHM(Number(mins))}.` : ""}`, queued: r.status === "queued" });
      setStage("done");
    } catch (e: any) { setError(e?.message || "Could not finish your day"); }
  };

  // First scan of the day starts it straight away; a later scan asks before finishing.
  useEffect(() => {
    if (ran.current || clock.loading || van === undefined || !van) return;
    ran.current = true;
    if (clock.isClockedIn) setStage("confirm_finish"); else start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock.loading, van, clock.isClockedIn]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 p-6 text-center">
      <Truck className="h-12 w-12 text-primary" />
      {error ? (
        <>
          <p className="text-lg font-semibold">{error}</p>
          <Button size="lg" className="h-14 w-full" onClick={() => navigate("/")}>Go to my day</Button>
        </>
      ) : van === null ? (
        <>
          <p className="text-lg font-semibold">This van sticker isn't recognised for your company.</p>
          <p className="text-sm text-muted-foreground">You can still use the Start day / Finish day buttons on your home screen.</p>
          <Button size="lg" className="h-14 w-full" onClick={() => navigate("/")}>Go to my day</Button>
        </>
      ) : van === undefined || clock.loading || (stage === "ready") ? (
        <Loader2 className="h-10 w-10 animate-spin" />
      ) : stage === "confirm_finish" ? (
        <>
          <h1 className="text-2xl font-bold">Finish your working day?</h1>
          {clock.activeEntry && <p className="text-muted-foreground">You started at {londonTime(clock.activeEntry.clock_in_at)}.</p>}
          <Button size="lg" variant="destructive" className="h-16 w-full text-lg font-bold" onClick={finish} disabled={clock.acting}>
            {clock.acting && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}Confirm
          </Button>
          <Button size="lg" variant="outline" className="h-14 w-full" onClick={() => navigate("/")}>No, keep working</Button>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold">{message?.title}</h1>
          <p className="text-xl">{message?.body}</p>
          {message?.queued && <p className="text-sm text-muted-foreground">No signal right now — saved on your phone with the real time. It will send when you're back online.</p>}
          <Button size="lg" className="h-14 w-full" onClick={() => navigate("/")}>Done</Button>
        </>
      )}
      <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{LOCATION_NOTE}</p>
    </div>
  );
}
