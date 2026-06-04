import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, MapPin } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import ClockInButton from "@/components/ClockInButton";

type Entry = {
  id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  total_minutes: number | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
};

function fmtMins(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

export default function MyTimesheet() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const since = new Date();
    since.setDate(since.getDate() - 30);
    supabase
      .from("time_clock")
      .select("id, clock_in_at, clock_out_at, total_minutes, clock_in_lat, clock_in_lng")
      .eq("user_id", user.id)
      .gte("clock_in_at", since.toISOString())
      .order("clock_in_at", { ascending: false })
      .then(({ data }) => {
        setEntries((data as any) || []);
        setLoading(false);
      });
  }, [user]);

  // group by date
  const grouped = entries.reduce<Record<string, Entry[]>>((acc, e) => {
    const d = format(new Date(e.clock_in_at), "yyyy-MM-dd");
    (acc[d] ||= []).push(e);
    return acc;
  }, {});

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  const weekMins = entries
    .filter((e) => new Date(e.clock_in_at) >= weekStart && new Date(e.clock_in_at) <= weekEnd)
    .reduce((sum, e) => sum + (e.total_minutes || 0), 0);

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">My Timesheet</h1>
      </div>

      <div className="rounded-2xl border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">This week</p>
            <p className="text-2xl font-bold">{fmtMins(weekMins)}</p>
          </div>
          <Clock className="h-8 w-8 text-primary" />
        </div>
        <ClockInButton />
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold px-1">Last 30 days</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="text-sm text-muted-foreground">No timesheet entries yet.</p>
        ) : (
          Object.entries(grouped).map(([date, items]) => {
            const total = items.reduce((s, i) => s + (i.total_minutes || 0), 0);
            return (
              <div key={date} className="rounded-2xl border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{format(new Date(date), "EEE d MMM")}</p>
                  <span className="text-sm font-medium text-primary">{fmtMins(total)}</span>
                </div>
                {items.map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-sm text-muted-foreground border-t pt-2">
                    <span>
                      {format(new Date(e.clock_in_at), "HH:mm")} –{" "}
                      {e.clock_out_at ? format(new Date(e.clock_out_at), "HH:mm") : "active"}
                    </span>
                    {e.clock_in_lat && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {e.clock_in_lat.toFixed(3)}, {e.clock_in_lng?.toFixed(3)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
