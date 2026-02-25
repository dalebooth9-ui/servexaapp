import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, CalendarDays, MapPin, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

type Job = {
  id: string;
  name: string;
  reference_number: string;
  status: string;
  priority: string;
  address: string | null;
  due_date: string | null;
  created_at: string;
};

type Visit = {
  id: string;
  job_id: string;
  scheduled_date: string;
  status: string;
  notes: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-blue-100 text-blue-700",
  scheduled: "bg-purple-100 text-purple-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  on_hold: "bg-gray-100 text-gray-600",
  awaiting_parts: "bg-orange-100 text-orange-700",
  requires_revisit: "bg-red-100 text-red-700",
  archived: "bg-gray-100 text-gray-500",
};

export default function CustomerPortal() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);

  useEffect(() => {
    if (!token) { setError("No access token provided."); setLoading(false); return; }

    const load = async () => {
      // Verify token
      const { data: tokenData, error: tokenErr } = await supabase
        .from("customer_portal_tokens" as any)
        .select("*")
        .eq("token", token)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (tokenErr || !tokenData) {
        setError("This link is invalid or has expired. Please contact us for a new link.");
        setLoading(false);
        return;
      }

      const td = tokenData as any;
      const customerId = td.customer_id;

      // Fetch customer
      const { data: customer } = await supabase
        .from("customers")
        .select("name")
        .eq("id", customerId)
        .maybeSingle();
      setCustomerName(customer?.name || "");

      // Fetch jobs for this customer
      const { data: jobData } = await supabase
        .from("jobs")
        .select("id, name, reference_number, status, priority, address, due_date, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      const jobList = (jobData || []) as Job[];
      setJobs(jobList);

      // Fetch upcoming visits
      if (jobList.length > 0) {
        const jobIds = jobList.map((j) => j.id);
        const { data: visitData } = await supabase
          .from("job_visits")
          .select("id, job_id, scheduled_date, status, notes")
          .in("job_id", jobIds)
          .in("status", ["upcoming", "unscheduled"])
          .gte("scheduled_date", new Date().toISOString().split("T")[0])
          .order("scheduled_date", { ascending: true })
          .limit(10);
        setVisits((visitData || []) as Visit[]);
      }

      setLoading(false);
    };

    load();
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading your portal...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <h1 className="text-xl font-semibold">Access Error</h1>
        <p className="max-w-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  const activeJobs = jobs.filter((j) => !["completed", "archived"].includes(j.status));
  const completedJobs = jobs.filter((j) => j.status === "completed");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{customerName} — Job Portal</h1>
            <p className="text-sm text-muted-foreground">Read-only view of your service history</p>
          </div>
          <img src="/images/vivafire-logo-new.jpg" alt="Logo" className="h-10 object-contain" />
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 p-6">
        {/* Upcoming visits */}
        {visits.length > 0 && (
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4 text-primary" />
                Upcoming Visits
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {visits.map((v) => {
                const job = jobs.find((j) => j.id === v.job_id);
                return (
                  <div key={v.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{job?.name || "Job"}</p>
                      <p className="text-xs text-muted-foreground">{job?.reference_number}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {new Date(v.scheduled_date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Active jobs */}
        {activeJobs.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Briefcase className="h-4 w-4 text-primary" />
                Active Jobs ({activeJobs.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {activeJobs.map((job) => (
                <div key={job.id} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{job.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{job.reference_number}</p>
                    </div>
                    <Badge variant="secondary" className="capitalize">{job.status.replace(/_/g, " ")}</Badge>
                  </div>
                  {job.address && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {job.address}
                    </p>
                  )}
                  {job.due_date && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" /> Due: {new Date(job.due_date).toLocaleDateString("en-GB")}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Completed jobs */}
        {completedJobs.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Completed Jobs ({completedJobs.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {completedJobs.slice(0, 10).map((job) => (
                <div key={job.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{job.name}</p>
                    <p className="text-xs font-mono text-muted-foreground">{job.reference_number}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(job.created_at).toLocaleDateString("en-GB")}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {jobs.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            <Briefcase className="mx-auto mb-3 h-8 w-8 opacity-40" />
            <p>No jobs found for your account.</p>
          </div>
        )}
      </div>
    </div>
  );
}
