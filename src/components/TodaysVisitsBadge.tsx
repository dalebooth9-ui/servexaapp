import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function TodaysVisitsBadge() {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user || userRole !== "admin") return;
    const today = format(new Date(), "yyyy-MM-dd");
    supabase
      .from("job_schedule")
      .select("id", { count: "exact", head: true })
      .eq("schedule_date", today)
      .then(({ count: c }) => setCount(c ?? 0));
  }, [user, userRole]);

  if (userRole !== "admin") return null;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => navigate("/planner")}
          >
            <CalendarDays className="h-5 w-5" />
            {count > 0 && (
              <Badge
                variant="secondary"
                className="absolute -right-1 -top-1 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center bg-accent text-accent-foreground border-0"
              >
                {count > 9 ? "9+" : count}
              </Badge>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{count} visit{count !== 1 ? "s" : ""} today</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
