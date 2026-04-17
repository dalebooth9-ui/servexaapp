import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Briefcase, Image, FileText, MapPin, Plus, Upload, Building2, FolderOpen, TrendingUp, PoundSterling, Users, CheckCircle2, AlertTriangle, UserCheck, CalendarDays, ClipboardList } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import FolderImportDialog, { type FolderImportDialogHandle } from "@/components/FolderImportDialog";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import AiMaintenanceAlerts from "@/components/AiMaintenanceAlerts";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import OnboardingTour from "@/components/OnboardingTour";
import QuickScanDialog from "@/components/QuickScanDialog";
import BatchScanDialog from "@/components/BatchScanDialog";
import PendingWhatsAppScans from "@/components/PendingWhatsAppScans";

export default function AdminDashboard() {
  const { userRole, user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ jobs: 0, photos: 0, documents: 0, locations: 0 });
  const [kpis, setKpis] = useState({ completedThisMonth: 0, revenue: 0, activeEngineers: 0, completionRate: 0 });
  const [weeklyData, setWeeklyData] = useState<{ name: string; completed: number; created: number }[]>([]);
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [recentPhotoUrls, setRecentPhotoUrls] = useState<Record<string, string>>({});
  const [expiringDocs, setExpiringDocs] = useState<{ id: string; title: string; document_type: string; certification_type: string | null; expiry_date: string; engineer_id: string; engineer_name: string; is_expired: boolean }[]>([]);
  const [fileDragging, setFileDragging] = useState(false);
  const [folderImportOpen, setFolderImportOpen] = useState(false);
  const [submissionListType, setSubmissionListType] = useState<string | null>(null);
  const [submissionListItems, setSubmissionListItems] = useState<any[]>([]);
  const [submissionListLoading, setSubmissionListLoading] = useState(false);
  const [submissionThumbUrls, setSubmissionThumbUrls] = useState<Record<string, string>>({});
  const [todaysJobs, setTodaysJobs] = useState<{ id: string; name: string; reference_number: string; customer: string | null; address: string | null; priority: string; engineer_name: string | null }[]>([]);
  const fileDragCounter = useRef(0);
  const folderImportRef = useRef<FolderImportDialogHandle | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      if (!user) return;

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString();

      const [jobsRes, subsRes, recentRes, completedRes, allJobsRes, invoiceRes, engRes] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true }),
        supabase.from("submissions").select("type"),
        supabase.from("submissions").select("*, jobs(name, reference_number)").order("created_at", { ascending: false }).limit(5),
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "completed").gte("updated_at", startOfMonth),
        supabase.from("jobs").select("id, status, created_at, updated_at").gte("created_at", fourWeeksAgo),
        supabase.from("invoices").select("total, status").gte("created_at", startOfMonth),
        supabase.from("job_assignments").select("engineer_id").gte("assigned_at", startOfMonth),
      ]);

      const subs = subsRes.data || [];
      const totalJobs = jobsRes.count || 0;
      const completedCount = completedRes.count || 0;
      const invoices = invoiceRes.data || [];
      const revenue = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.total || 0), 0);
      const uniqueEngineers = new Set((engRes.data || []).map((e) => e.engineer_id)).size;

      setStats({
        jobs: totalJobs,
        photos: subs.filter((s) => s.type === "photo").length,
        documents: subs.filter((s) => s.type === "document").length,
        locations: subs.filter((s) => s.type === "location").length,
      });

      setKpis({
        completedThisMonth: completedCount,
        revenue,
        activeEngineers: uniqueEngineers,
        completionRate: totalJobs > 0 ? Math.round((completedCount / totalJobs) * 100) : 0,
      });

      const allJobs = allJobsRes.data || [];
      const weeks: { name: string; completed: number; created: number }[] = [];
      for (let i = 3; i >= 0; i--) {
        const weekStart = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        const label = `W${4 - i}`;
        weeks.push({
          name: label,
          completed: allJobs.filter((j) => j.status === "completed" && new Date(j.updated_at) >= weekStart && new Date(j.updated_at) < weekEnd).length,
          created: allJobs.filter((j) => new Date(j.created_at) >= weekStart && new Date(j.created_at) < weekEnd).length,
        });
      }
      setWeeklyData(weeks);

      const recent = recentRes.data || [];
      if (recent.length > 0) {
        const engineerIds = [...new Set(recent.map((s: any) => s.engineer_id))];
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", engineerIds);
        const nameMap: Record<string, string> = {};
        (profiles || []).forEach((p) => { nameMap[p.user_id] = p.full_name; });
        const withNames = recent.map((s: any) => ({ ...s, engineer_name: nameMap[s.engineer_id] }));
        setRecentSubmissions(withNames);

        // Generate signed URLs for photo submissions
        const photoSubs = withNames.filter((s: any) => s.type === "photo" && s.file_url);
        const urlMap: Record<string, string> = {};
        await Promise.all(
          photoSubs.map(async (s: any) => {
            const { data } = await supabase.storage.from("submissions").createSignedUrl(s.file_url, 300);
            if (data?.signedUrl) urlMap[s.id] = data.signedUrl;
          })
        );
        setRecentPhotoUrls(urlMap);
      } else {
        setRecentSubmissions([]);
        setRecentPhotoUrls({});
      }
    };

    fetchStats();

    // Fetch today's scheduled jobs
    const fetchTodaysJobs = async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data: schedules } = await supabase
        .from("job_schedule")
        .select("job_id, engineer_id")
        .eq("schedule_date", today);
      if (!schedules || schedules.length === 0) { setTodaysJobs([]); return; }
      const jobIds = [...new Set(schedules.map((s) => s.job_id))];
      const engIds = [...new Set(schedules.map((s) => s.engineer_id))];
      const [jobsRes, profilesRes] = await Promise.all([
        supabase.from("jobs").select("id, name, reference_number, customer, address, priority").in("id", jobIds),
        supabase.from("profiles").select("user_id, full_name").in("user_id", engIds),
      ]);
      const nameMap: Record<string, string> = {};
      (profilesRes.data || []).forEach((p) => { nameMap[p.user_id] = p.full_name; });
      const scheduleMap: Record<string, string> = {};
      schedules.forEach((s) => { scheduleMap[s.job_id] = s.engineer_id; });
      setTodaysJobs((jobsRes.data || []).map((j) => ({
        ...j,
        engineer_name: nameMap[scheduleMap[j.id]] || null,
      })));
    };
    fetchTodaysJobs();

    // Fetch expiring/expired engineer certification documents
    const fetchExpiringDocs = async () => {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      let query = supabase
        .from("engineer_documents" as any)
        .select("id, title, document_type, certification_type, expiry_date, engineer_id")
        .not("expiry_date", "is", null)
        .lte("expiry_date", thirtyDaysFromNow.toISOString().split("T")[0])
        .order("expiry_date", { ascending: true });

      // Engineers see only their own
      if (userRole !== "admin" && user?.id) {
        query = query.eq("engineer_id", user.id);
      }
      const { data: docs } = await query;

      if (!docs || docs.length === 0) { setExpiringDocs([]); return; }
      const engIds = [...new Set((docs as any[]).map((d) => d.engineer_id))];
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", engIds);
      const nameMap: Record<string, string> = {};
      (profiles || []).forEach((p) => { nameMap[p.user_id] = p.full_name; });
      const today = new Date();
      setExpiringDocs((docs as any[]).map((d) => ({
        ...d,
        engineer_name: nameMap[d.engineer_id] || "Unknown",
        is_expired: new Date(d.expiry_date) < today,
      })));
    };
    fetchExpiringDocs();
  }, [user, userRole]);

  const isAdmin = userRole === "admin";

  const kpiCards = [
    { label: "Completed This Month", value: kpis.completedThisMonth, icon: CheckCircle2, color: "text-green-500" },
    { label: "Revenue (Paid)", value: `£${kpis.revenue.toLocaleString()}`, icon: PoundSterling, color: "text-emerald-500" },
    { label: "Active Engineers", value: kpis.activeEngineers, icon: Users, color: "text-blue-500" },
    { label: "Completion Rate", value: `${kpis.completionRate}%`, icon: TrendingUp, color: "text-primary" },
  ];

  const openSubmissionList = async (type: string) => {
    setSubmissionListType(type);
    setSubmissionListLoading(true);
    setSubmissionListItems([]);
    setSubmissionThumbUrls({});
    try {
      const { data } = await supabase
        .from("submissions")
        .select("*, jobs(name, reference_number)")
        .eq("type", type)
        .order("created_at", { ascending: false })
        .limit(100);
      const items = data || [];
      if (items.length > 0) {
        const engIds = [...new Set(items.map((s: any) => s.engineer_id))];
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", engIds);
        const nameMap: Record<string, string> = {};
        (profiles || []).forEach((p) => { nameMap[p.user_id] = p.full_name; });
        const withNames = items.map((s: any) => ({ ...s, engineer_name: nameMap[s.engineer_id] }));
        setSubmissionListItems(withNames);

        // Generate signed URLs for photo thumbnails
        if (type === "photo") {
          const photoSubs = withNames.filter((s: any) => s.file_url);
          const urlMap: Record<string, string> = {};
          await Promise.all(
            photoSubs.map(async (s: any) => {
              const { data: signedData } = await supabase.storage.from("submissions").createSignedUrl(s.file_url, 300);
              if (signedData?.signedUrl) urlMap[s.id] = signedData.signedUrl;
            })
          );
          setSubmissionThumbUrls(urlMap);
        }
      }
    } finally {
      setSubmissionListLoading(false);
    }
  };

  const statCards = [
    { label: "Total Jobs", value: stats.jobs, icon: Briefcase, color: "text-primary", link: "/jobs" },
    { label: "Photos", value: stats.photos, icon: Image, color: "text-accent", type: "photo" },
    { label: "Documents", value: stats.documents, icon: FileText, color: "text-warning", type: "document" },
    { label: "Locations", value: stats.locations, icon: MapPin, color: "text-destructive", type: "location" },
  ];

  const handleFileDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    // Don't show folder overlay when a dialog is open (e.g. QuickScanDialog)
    if (document.querySelector('[role="dialog"]')) return;
    fileDragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setFileDragging(true);
  };
  const handleFileDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    fileDragCounter.current--;
    if (fileDragCounter.current === 0) setFileDragging(false);
  };
  const handleFileDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setFileDragging(false);
    fileDragCounter.current = 0;
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setFolderImportOpen(true);
      setTimeout(() => folderImportRef.current?.processFiles(files), 100);
    }
  };

  const fetchDashboard = () => { window.location.reload(); };

  return (
    <div
      onDragEnter={isAdmin ? handleFileDragEnter : undefined}
      onDragLeave={isAdmin ? handleFileDragLeave : undefined}
      onDragOver={isAdmin ? handleFileDragOver : undefined}
      onDrop={isAdmin ? handleFileDrop : undefined}
      className="relative"
    >
      {fileDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-primary">
            <FolderOpen className="h-10 w-10" />
            <p className="font-medium">Drop folder to import jobs</p>
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold flex-1" data-tour="dashboard-heading">Dashboard</h1>
        <OnboardingTour />
      </div>
      <OnboardingChecklist />

      {isAdmin && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpiCards.map((kpi) => (
            <Card key={kpi.label} className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-5">
                <div className={cn("rounded-lg bg-muted p-2.5", kpi.color)}>
                  <kpi.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{kpi.value}</p>
                  <p className="text-sm text-muted-foreground">{kpi.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isAdmin && weeklyData.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Weekly Job Trends (Last 4 Weeks)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis allowDecimals={false} className="text-xs" />
                <Tooltip />
                <Bar dataKey="created" fill="hsl(var(--primary))" name="Created" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" fill="hsl(var(--accent))" name="Completed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const cardContent = (
            <Card className="transition-shadow hover:shadow-md cursor-pointer">
              <CardContent className="flex items-center gap-4 p-5">
                <div className={cn("rounded-lg bg-muted p-2.5", stat.color)}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          );
          if ((stat as any).link) {
            return <Link key={stat.label} to={(stat as any).link}>{cardContent}</Link>;
          }
          return (
            <div key={stat.label} onClick={() => openSubmissionList((stat as any).type)}>
              {cardContent}
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <div className="mb-6 flex flex-wrap gap-3" data-tour="quick-actions">
          <Button
            onClick={() => {
              navigate("/jobs");
              setTimeout(() => window.dispatchEvent(new Event("shortcut:new-job")), 150);
            }}
            variant="default"
          >
            <Plus className="mr-2 h-4 w-4" /> Create Job
          </Button>
          <Button onClick={() => navigate("/customers")} variant="outline">
            <Building2 className="mr-2 h-4 w-4" /> New Customer
          </Button>
          <Button onClick={() => navigate("/quotes")} variant="outline">
            <ClipboardList className="mr-2 h-4 w-4" /> New Quote
          </Button>
          <Button onClick={() => setFolderImportOpen(true)} variant="outline">
            <Upload className="mr-2 h-4 w-4" /> Import Files
          </Button>
          <QuickScanDialog />
          <BatchScanDialog />
          <AiMaintenanceAlerts />
        </div>
      )}

      {isAdmin && <PendingWhatsAppScans />}

      {isAdmin && todaysJobs.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarDays className="h-5 w-5 text-primary" />
              Today's Scheduled Jobs
              <Badge variant="secondary" className="ml-auto">{todaysJobs.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {todaysJobs.map((job) => (
                <Link
                  key={job.id}
                  to={`/jobs/${job.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-mono text-muted-foreground">{job.reference_number}</span>
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0",
                        job.priority === "high" ? "bg-destructive/10 text-destructive border-destructive/20" :
                        job.priority === "medium" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                        "bg-muted text-muted-foreground"
                      )}>{job.priority}</Badge>
                    </div>
                    <p className="text-sm font-medium truncate">{job.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {job.customer}{job.engineer_name ? ` • ${job.engineer_name}` : ""}
                    </p>
                  </div>
                  {job.address && (
                    <span className="text-xs text-muted-foreground truncate max-w-[200px] hidden sm:block ml-2">
                      <MapPin className="h-3 w-3 inline mr-0.5" />{job.address}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {expiringDocs.length > 0 && (() => {
        const today = new Date();
        const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        const expiredCount = expiringDocs.filter((d) => d.is_expired).length;
        const next30Count = expiringDocs.filter((d) => !d.is_expired && new Date(d.expiry_date) <= in30).length;
        // Group by engineer
        const groups = expiringDocs.reduce<Record<string, { name: string; docs: typeof expiringDocs }>>((acc, d) => {
          if (!acc[d.engineer_id]) acc[d.engineer_id] = { name: d.engineer_name, docs: [] };
          acc[d.engineer_id].docs.push(d);
          return acc;
        }, {});

        return (
          <Card className={`mb-6 ${expiredCount > 0 ? "border-destructive/40" : "border-warning/40"}`}>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                <AlertTriangle className={`h-5 w-5 ${expiredCount > 0 ? "text-destructive" : "text-warning"}`} />
                {isAdmin ? "Engineer Certification Alerts" : "Your Expiring Certifications"}
                {expiredCount > 0 && <Badge variant="destructive">{expiredCount} expired</Badge>}
                {next30Count > 0 && <Badge variant="outline" className="border-warning/50 text-warning">{next30Count} in next 30 days</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(groups).map(([engId, g]) => (
                  <div key={engId} className="rounded-lg border">
                    <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-semibold">{g.name}</span>
                        <Badge variant="secondary" className="text-[10px]">{g.docs.length}</Badge>
                      </div>
                      {isAdmin && <Link to="/engineers" className="text-xs text-primary hover:underline">Manage</Link>}
                    </div>
                    <div className="divide-y">
                      {g.docs.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{doc.title}</p>
                            <p className="text-xs text-muted-foreground capitalize">{(doc.certification_type || doc.document_type).replace(/_/g, " ")}</p>
                          </div>
                          <span className={`shrink-0 text-sm font-medium ${doc.is_expired ? "text-destructive" : "text-warning"}`}>
                            {doc.is_expired ? "Expired" : "Expires"} {new Date(doc.expiry_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentSubmissions.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No submissions yet. Reports sent via WhatsApp will appear here.</p>
          ) : (
            <div className="space-y-3">
              {recentSubmissions.map((sub) => (
                <div key={sub.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    {sub.type === "photo" && recentPhotoUrls[sub.id] ? (
                      <img
                        src={recentPhotoUrls[sub.id]}
                        alt="Photo submission thumbnail"
                        className="h-10 w-10 rounded object-cover shrink-0 border"
                      />
                    ) : (
                      <div className="rounded bg-muted p-1.5">
                        {sub.type === "photo" && <Image className="h-4 w-4 text-accent" />}
                        {sub.type === "document" && <FileText className="h-4 w-4 text-warning" />}
                        {sub.type === "note" && <FileText className="h-4 w-4 text-primary" />}
                        {sub.type === "location" && <MapPin className="h-4 w-4 text-destructive" />}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium capitalize">{sub.type}</p>
                      <p className="text-xs text-muted-foreground">
                        {(sub as any).jobs?.name || "Unknown job"}
                        {sub.engineer_name && ` • ${sub.engineer_name}`}
                        {" • "}
                        {new Date(sub.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Link to={`/jobs/${sub.job_id}`} className="text-xs font-medium text-primary hover:underline">
                    View
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <FolderImportDialog ref={folderImportRef} open={folderImportOpen} onOpenChange={setFolderImportOpen} onImported={fetchDashboard} />

      <Dialog open={!!submissionListType} onOpenChange={(o) => { if (!o) setSubmissionListType(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="capitalize">{submissionListType}s</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2">
            {submissionListLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : submissionListItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No {submissionListType}s found.</p>
            ) : (
              submissionListItems.map((sub) => (
                <Link
                  key={sub.id}
                  to={`/jobs/${sub.job_id}`}
                  onClick={() => setSubmissionListType(null)}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {submissionListType === "photo" && submissionThumbUrls[sub.id] ? (
                      <img
                        src={submissionThumbUrls[sub.id]}
                        alt="Thumbnail"
                        className="h-10 w-10 rounded object-cover shrink-0 border"
                      />
                    ) : (
                      <div className="rounded bg-muted p-1.5 shrink-0">
                        {submissionListType === "photo" && <Image className="h-4 w-4 text-accent" />}
                        {submissionListType === "document" && <FileText className="h-4 w-4 text-warning" />}
                        {submissionListType === "location" && <MapPin className="h-4 w-4 text-destructive" />}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{sub.file_name || (sub as any).jobs?.name || "Submission"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {(sub as any).jobs?.reference_number || (sub as any).jobs?.name || "Unknown job"}
                        {sub.engineer_name && ` • ${sub.engineer_name}`}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {new Date(sub.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                </Link>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
