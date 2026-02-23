import { useTimeClock } from "@/hooks/useTimeClock";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

function formatElapsed(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function ClockInButton() {
  const { userRole } = useAuth();
  const { isClockedIn, loading, acting, clockIn, clockOut, elapsedMinutes } = useTimeClock();
  const [elapsed, setElapsed] = useState(elapsedMinutes);

  useEffect(() => {
    setElapsed(elapsedMinutes);
    if (!isClockedIn) return;
    const interval = setInterval(() => setElapsed((e) => e + 1), 60000);
    return () => clearInterval(interval);
  }, [isClockedIn, elapsedMinutes]);

  // Only show for engineers
  if (userRole !== "engineer") return null;
  if (loading) return null;

  if (isClockedIn) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={clockOut}
        disabled={acting}
        className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
      >
        {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">Clock Out</span>
        <span className="text-xs font-mono opacity-70">{formatElapsed(elapsed)}</span>
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={clockIn}
      disabled={acting}
      className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
    >
      {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">Clock In</span>
    </Button>
  );
}
