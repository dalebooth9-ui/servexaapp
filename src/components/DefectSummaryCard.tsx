import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, FileText, ArrowRight } from "lucide-react";

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  high: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  low: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
};

export default function DefectSummaryCard() {
  const [counts, setCounts] = useState({ critical: 0, high: 0, medium: 0, low: 0, totalOpen: 0, unquoted: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("defects").select("severity, status, quote_id");
      const list = (data || []) as { severity: string; status: string; quote_id: string | null }[];
      const open = list.filter(d => d.status === "open" || d.status === "in_progress");
      const c = { critical: 0, high: 0, medium: 0, low: 0, totalOpen: open.length, unquoted: 0 };
      open.forEach(d => {
        if (c[d.severity as keyof typeof c] !== undefined) (c as any)[d.severity]++;
        if (!d.quote_id) c.unquoted++;
      });
      setCounts(c);
      setLoading(false);
    })();
  }, []);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500" /> Defects
        </CardTitle>
        <Link to="/defects" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <>
            <div>
              <p className="text-3xl font-bold">{counts.totalOpen}</p>
              <p className="text-xs text-muted-foreground">Open defects</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["critical", "high", "medium", "low"] as const).map(s => (
                <Badge key={s} variant="outline" className={SEVERITY_BADGE[s]}>
                  {counts[s]} {s}
                </Badge>
              ))}
            </div>
            {counts.unquoted > 0 && (
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to="/defects?filter=unquoted">
                  <FileText className="mr-2 h-3.5 w-3.5" />
                  Quote {counts.unquoted} unquoted defect{counts.unquoted === 1 ? "" : "s"}
                </Link>
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
