import { useEffect, useState } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { PortalContext } from "./PortalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, MapPin, Send } from "lucide-react";
import { RequestVisitDialog } from "@/components/portal/RequestVisitDialog";
import { formatDate } from "@/lib/dateFormat";

interface SiteRow { id: string; name: string; address: string | null; }
interface DueRow { site_id: string; work_type: string | null; next_due_date: string | null; }
interface JobRow { id: string; site_id: string | null; name: string | null; reference_number: string | null; completed_at: string | null; category: string | null; }

export default function PortalHome() {
  const ctx = useOutletContext<PortalContext>();
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [dues, setDues] = useState<DueRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [visitFor, setVisitFor] = useState<SiteRow | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: cs }, { data: dueRows }, { data: jobRows }] = await Promise.all([
        supabase.from("customer_sites").select("site_id, sites:site_id(id,name,address)").eq("customer_id", ctx.customerId),
        supabase.from("site_service_schedules").select("site_id, work_type, next_due_date").eq("customer_id", ctx.customerId).order("next_due_date", { ascending: true }),
        supabase.from("customer_job_summary").select("id, site_id, name, reference_number, completed_at, category").order("completed_at", { ascending: false }).limit(50),
      ]);
      setSites((cs || []).map((r: any) => r.sites).filter(Boolean));
      setDues((dueRows || []) as DueRow[]);
      setJobs((jobRows || []) as JobRow[]);
      setLoading(false);
    })();
  }, [ctx.customerId]);

  if (loading) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      {sites.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No sites are linked to your account yet.</CardContent></Card>
      )}
      {sites.map((s) => {
        const siteDues = dues.filter(d => d.site_id === s.id);
        const siteJobs = jobs.filter(j => j.site_id === s.id).slice(0, 8);
        return (
          <Card key={s.id}>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2"><MapPin className="w-4 h-4" />{s.name}</CardTitle>
                {s.address && <div className="text-sm text-muted-foreground mt-1">{s.address}</div>}
              </div>
              <Button size="sm" variant="outline" onClick={() => setVisitFor(s)}>
                <Send className="w-4 h-4 mr-2" />Request a visit
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <section>
                <div className="text-sm font-medium mb-2 flex items-center gap-2"><CalendarClock className="w-4 h-4" />Upcoming & overdue</div>
                {siteDues.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No scheduled services on file.</div>
                ) : (
                  <ul className="text-sm divide-y">
                    {siteDues.map((d, i) => {
                      const overdue = d.next_due_date ? new Date(d.next_due_date) < new Date() : false;
                      return (
                        <li key={i} className="py-1.5 flex items-center justify-between">
                          <span>{d.work_type || "Scheduled service"}</span>
                          <span className="flex items-center gap-2">
                            {d.next_due_date && <span className="text-muted-foreground">{formatDate(d.next_due_date)}</span>}
                            {overdue && <Badge variant="destructive">Overdue</Badge>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
              <section>
                <div className="text-sm font-medium mb-2">Recent service history</div>
                {siteJobs.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No completed jobs on file yet.</div>
                ) : (
                  <ul className="text-sm divide-y">
                    {siteJobs.map(j => (
                      <li key={j.id} className="py-1.5 flex items-center justify-between">
                        <span>
                          <span className="font-mono text-xs mr-2 text-muted-foreground">{j.reference_number}</span>
                          {j.name || j.category || "Job"}
                        </span>
                        <Link to={`/customer-portal/documents?job=${j.id}`} className="text-primary hover:underline">
                          View reports
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </CardContent>
          </Card>
        );
      })}
      {visitFor && (
        <RequestVisitDialog
          open={!!visitFor}
          onOpenChange={(o) => !o && setVisitFor(null)}
          site={visitFor}
          customerId={ctx.customerId}
          orgId={ctx.orgId}
        />
      )}
    </div>
  );
}
