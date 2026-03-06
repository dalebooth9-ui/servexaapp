import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Image, FileText, MapPin, Plus, Upload, Building2, FolderOpen, TrendingUp, PoundSterling, Users, CheckCircle2, AlertTriangle, UserCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import FolderImportDialog, { type FolderImportDialogHandle } from "@/components/FolderImportDialog";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import AiMaintenanceAlerts from "@/components/AiMaintenanceAlerts";

export default function AdminDashboard() {
  const { userRole, user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ jobs: 0, photos: 0, documents: 0, locations: 0 });
  const [kpis, setKpis] = useState({ completedThisMonth: 0, revenue: 0, activeEngineers: 0, completionRate: 0 });
  const [weeklyData, setWeeklyData] = useState<{ name: string; completed: number; created: number }[]>([]);
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [expiringDocs, setExpiringDocs] = useState<{ id: string; title: string; document_type: string; expiry_date: string; engineer_name: string; is_expired: boolean }[]>([]);
  const [fileDragging, setFileDragging] = useState(false);
  const [folderImportOpen, setFolderImportOpen] = useState(false);
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
        setRecentSubmissions(recent.map((s: any) => ({ ...s, engineer_name: nameMap[s.engineer_id] })));
      } else {
        setRecentSubmissions([]);
      }
    };

    fetchStats();

    // Fetch expiring/expired engineer certification documents
    const fetchExpiringDocs = async () => {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      const { data: docs } = await supabase
        .from("engineer_documents" as any)
        .select("id, title, document_type, expiry_date, engineer_id")
        .not("expiry_date", "is", null)
        .lte("expiry_date", thirtyDaysFromNow.toISOString().split("T")[0])
        .order("expiry_date", { ascending: true });

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
  }, [user]);

  const isAdmin = userRole === "admin";

  const kpiCards = [
    { label: "Completed This Month", value: kpis.completedThisMonth, icon: CheckCircle2, color: "text-green-500" },
    { label: "Revenue (Paid)", value: `£${kpis.revenue.toLocaleString()}`, icon: PoundSterling, color: "text-emerald-500" },
    { label: "Active Engineers", value: kpis.activeEngineers, icon: Users, color: "text-blue-500" },
    { label: "Completion Rate", value: `${kpis.completionRate}%`, icon: TrendingUp, color: "text-primary" },
  ];

  const statCards = [
    { label: "Total Jobs", value: stats.jobs, icon: Briefcase, color: "text-primary", link: "/jobs" },
    { label: "Photos", value: stats.photos, icon: Image, color: "text-accent", link: "/jobs" },
    { label: "Documents", value: stats.documents, icon: FileText, color: "text-warning", link: "/jobs" },
    { label: "Locations", value: stats.locations, icon: MapPin, color: "text-destructive", link: "/jobs" },
  ];

  const handleFileDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
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
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>

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
        {statCards.map((stat) => (
          <Link key={stat.label} to={stat.link}>
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
          </Link>
        ))}
      </div>

      {isAdmin && (
        <div className="mb-6 flex flex-wrap gap-3">
          <Button onClick={() => navigate("/jobs")} variant="default">
            <Plus className="mr-2 h-4 w-4" /> Create Job
          </Button>
          <Button onClick={() => navigate("/customers")} variant="outline">
            <Building2 className="mr-2 h-4 w-4" /> New Customer
          </Button>
          <Button onClick={() => { setFolderImportOpen(true); }} variant="outline">
            <Upload className="mr-2 h-4 w-4" /> Import Files
          </Button>
        </div>
      )}

      {isAdmin && expiringDocs.length > 0 && (
        <Card className="mb-6 border-warning/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Engineer Certification Alerts
              <Badge variant="secondary" className="ml-auto">{expiringDocs.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expiringDocs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div className="flex items-center gap-3">
                    <UserCheck className={`h-4 w-4 ${doc.is_expired ? "text-destructive" : "text-warning"}`} />
                    <div>
                      <p className="text-sm font-medium">{doc.engineer_name} — {doc.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{doc.document_type.replace(/_/g, " ")}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-medium ${doc.is_expired ? "text-destructive" : "text-warning"}`}>
                      {doc.is_expired ? "Expired" : "Expires"} {new Date(doc.expiry_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    <Link to="/engineers" className="ml-3 text-xs text-primary hover:underline">View</Link>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
                    <div className="rounded bg-muted p-1.5">
                      {sub.type === "photo" && <Image className="h-4 w-4 text-accent" />}
                      {sub.type === "document" && <FileText className="h-4 w-4 text-warning" />}
                      {sub.type === "note" && <FileText className="h-4 w-4 text-primary" />}
                      {sub.type === "location" && <MapPin className="h-4 w-4 text-destructive" />}
                    </div>
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
    </div>
  );
}
