import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function UnreadMessagesBadge() {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);

  const fetchUnread = async () => {
    if (!user || userRole !== "admin") return;
    // Use a filter to only count messages not yet read by this user
    // read_by is a uuid[] so we use the @> (contains) operator negated
    const { count } = await supabase
      .from("job_messages")
      .select("id", { count: "exact", head: true })
      .not("read_by", "cs", `{${user.id}}`);
    setCount(count ?? 0);
  };

  useEffect(() => {
    fetchUnread();
  }, [user, userRole]);

  // Realtime updates
  useEffect(() => {
    if (!user || userRole !== "admin") return;
    const channel = supabase
      .channel("unread_messages_badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_messages" },
        () => fetchUnread()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
            onClick={() => navigate("/jobs")}
          >
            <MessageSquare className="h-5 w-5" />
            {count > 0 && (
              <Badge
                variant="destructive"
                className="absolute -right-1 -top-1 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center"
              >
                {count > 9 ? "9+" : count}
              </Badge>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{count} unread message{count !== 1 ? "s" : ""}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
