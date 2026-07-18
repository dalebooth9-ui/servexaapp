import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function RenewalsTile() {
  const [counts, setCounts] = useState({ month: 0, overdue: 0 });

  useEffect(() => {
    (async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      const today = now.toISOString().slice(0, 10);
      const [{ count: monthCount }, { count: overdueCount }] = await Promise.all([
        supabase.from("site_service_schedules")
          .select("*", { count: "exact", head: true })
          .eq("active", true)
          .gte("next_due_date", startOfMonth)
          .lte("next_due_date", endOfMonth),
        supabase.from("site_service_schedules")
          .select("*", { count: "exact", head: true })
          .eq("active", true)
          .lt("next_due_date", today),
      ]);
      setCounts({ month: monthCount || 0, overdue: overdueCount || 0 });
    })();
  }, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" /> Renewals
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-6">
          <div>
            <p className="text-3xl font-bold">{counts.month}</p>
            <p className="text-xs text-muted-foreground">Due this month</p>
          </div>
          <div>
            <p className={`text-3xl font-bold ${counts.overdue ? "text-destructive" : ""}`}>{counts.overdue}</p>
            <p className="text-xs text-muted-foreground">Overdue</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link to="/renewals">Open renewals</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
