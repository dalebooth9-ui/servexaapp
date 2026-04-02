import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, CalendarDays, MapPin, CheckCircle2, Clock, AlertTriangle, Shield, AlertCircle } from "lucide-react";
import { format } from "date-fns";

type Job = {
  id: string; name: string; reference_number: string; status: string;
  priority: string; address: string | null; due_date: string | null; created_at: string;
};
type Visit = { id: string; job_id: string; scheduled_date: string; status: string; notes: string | null; };
type Defect = { id: string; title: string; severity: string; status: string; created_at: string; };
type ComplianceRecord = { id: string; title: string; status: string; expiry_date: string | null; record_type: string; };

const STATUS_COLORS: Record<string, string> = {
  active: "bg-blue-100 text-blue-700", scheduled: "bg-purple-100 text-purple-700",
  in_progress: "bg-yellow-100 text-yellow-700", completed: "bg-green-100 text-green-700",
  on_hold: "bg-gray-100 text-gray-600", awaiting_parts: "bg-orange-100 text-orange-700",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800", high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800", low: "bg-blue-100 text-blue-800",
};

const COMPLIANCE_COLORS: Record<string, string> = {
  valid: "bg-green-100 text-green-700", expiring_soon: "bg-yellow-100 text-yellow-700",
  expired: "bg-red-100 text-red-700", not_applicable: "bg-gray-100 text-gray-600",
};

export default function CustomerPortal() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [compliance, setCompliance] = useState<ComplianceRecord[]>([]);

  useEffect(() => {
    if (!token) { setError("No access token provided."); setLoading(false); return; }

    const load = async () => {
      const { data: validateData, error: fnErr } = await supabase.functions.invoke(
        "customer-portal-validate", { body: { token } }
      );
      if (fnErr || !validateData?.valid) {
        setError("This link is invalid or has expired. Please contact us for a new link.");
        setLoading(false); return;
      }

      const customerId = validateData.customer_id;

      const { data: customer } = await supabase.from("customers").select("name").eq("id", customerId).maybeSingle();
      setCustomerName(customer?.name || "");

      // Fetch jobs
      const { data: jobData } = await supabase
        .from("jobs").select("id, name, reference_number, status, priority, address, due_date, created_at")
        .eq("customer_id", customerId).order("created_at", { ascending: false });
      const jobList = (jobData || []) as Job[];
      setJobs(jobList);

      // Fetch upcoming visits, defects, and compliance in parallel
      const jobIds = jobList.map(j => j.id);

      // Fetch visits
      let visitData: Visit[] = [];
      if (jobIds.length > 0) {
        const { data } = await supabase.from("job_visits").select("id, job_id, scheduled_date, status, notes")
          .in("job_id", jobIds).in("status", ["upcoming", "unscheduled"])
          .gte("scheduled_date", new Date().toISOString().split("T")[0])
          .order("scheduled_date", { ascending: true }).limit(10);
        visitData = (data || []) as Visit[];
      }
      setVisits(visitData);

      // Get customer sites for compliance/defects
      const { data: siteLinks } = await supabase.from("customer_sites").select("site_id").eq("customer_id", customerId);
      const siteIds = (siteLinks || []).map((s: any) => s.site_id);

      // Defects
      if (siteIds.length > 0) {
        const { data } = await supabase.from("defects").select("id, title, severity, status, created_at")
          .in("site_id", siteIds).in("status", ["open", "in_progress"])
          .order("created_at", { ascending: false }).limit(20);
        setDefects((data || []) as Defect[]);
      }

      // Compliance
      if (siteIds.length > 0) {
        const { data } = await supabase.from("compliance_records").select("id, title, status, expiry_date, record_type")
          .in("site_id", siteIds).order("expiry_date", { ascending: true }).limit(20);
        setCompliance((data || []) as ComplianceRecord[]);
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

  const activeJobs = jobs.filter(j => !["completed", "archived"].includes(j.status));
  const completedJobs = jobs.filter(j => j.status === "completed");

  const complianceValid = compliance.filter(c => c.status === "valid").length;
  const complianceExpiring = compliance.filter(c => c.status === "expiring_soon").length;
  const complianceExpired = compliance.filter(c => c.status === "expired").length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{customerName} — Customer Portal</h1>
            <p className="text-sm text-muted-foreground">Your service overview and compliance status</p>
          </div>
          <img src="/images/vivafire-logo-new.jpg" alt="Logo" className="h-10 object-contain" />
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 p-6">

        {/* Compliance Overview */}
        {compliance.length > 0 && (
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4 text-primary" />
                Compliance Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{complianceValid}</p>
                  <p className="text-xs text-muted-foreground">Valid</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-600">{complianceExpiring}</p>
                  <p className="text-xs text-muted-foreground">Expiring Soon</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{complianceExpired}</p>
                  <p className="text-xs text-muted-foreground">Expired</p>
                </div>
              </div>
              <div className="space-y-2">
                {compliance.map(c => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{c.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{c.record_type.replace(/_/g, " ")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.expiry_date && (
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(c.expiry_date), "dd MMM yyyy")}
                        </span>
                      )}
                      <Badge variant="secondary" className={COMPLIANCE_COLORS[c.status] || ""}>
                        {c.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Open Defects */}
        {defects.length > 0 && (
          <Card className="border-orange-200">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                Open Defects ({defects.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {defects.map(d => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Reported {format(new Date(d.created_at), "dd MMM yyyy")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={SEVERITY_COLORS[d.severity] || ""}>
                      {d.severity}
                    </Badge>
                    <Badge variant="secondary" className={d.status === "open" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}>
                      {d.status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

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
              {visits.map(v => {
                const job = jobs.find(j => j.id === v.job_id);
                return (
                  <div key={v.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{job?.name || "Job"}</p>
                      <p className="text-xs text-muted-foreground">{job?.reference_number}</p>
                    </div>
                    <p className="text-sm font-medium">
                      {new Date(v.scheduled_date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                    </p>
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
              {activeJobs.map(job => (
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
              {completedJobs.slice(0, 10).map(job => (
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

        {jobs.length === 0 && compliance.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            <Briefcase className="mx-auto mb-3 h-8 w-8 opacity-40" />
            <p>No data found for your account.</p>
          </div>
        )}
      </div>
    </div>
  );
}
