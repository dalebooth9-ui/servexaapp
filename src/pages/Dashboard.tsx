import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, Image, FileText, MapPin, Plus, Upload } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { userRole, user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ jobs: 0, photos: 0, documents: 0, locations: 0 });
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      if (!user) return;

      const [jobsRes, subsRes, recentRes] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true }),
        supabase.from("submissions").select("type"),
        supabase
          .from("submissions")
          .select("*, jobs(name, reference_number)")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const subs = subsRes.data || [];
      setStats({
        jobs: jobsRes.count || 0,
        photos: subs.filter((s) => s.type === "photo").length,
        documents: subs.filter((s) => s.type === "document").length,
        locations: subs.filter((s) => s.type === "location").length,
      });

      // Fetch engineer names for recent submissions
      const recent = recentRes.data || [];
      if (recent.length > 0) {
        const engineerIds = [...new Set(recent.map((s: any) => s.engineer_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", engineerIds);
        const nameMap: Record<string, string> = {};
        (profiles || []).forEach((p) => { nameMap[p.user_id] = p.full_name; });
        setRecentSubmissions(recent.map((s: any) => ({ ...s, engineer_name: nameMap[s.engineer_id] })));
      } else {
        setRecentSubmissions([]);
      }
    };

    fetchStats();
  }, [user]);

  const statCards = [
    { label: "Active Jobs", value: stats.jobs, icon: Briefcase, color: "text-primary", link: "/jobs" },
    { label: "Photos", value: stats.photos, icon: Image, color: "text-accent", link: "/jobs" },
    { label: "Documents", value: stats.documents, icon: FileText, color: "text-warning", link: "/jobs" },
    { label: "Locations", value: stats.locations, icon: MapPin, color: "text-destructive", link: "/jobs" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>

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

      {userRole === "admin" && (
        <div className="mb-6 flex gap-3">
          <Button onClick={() => navigate("/jobs")} variant="outline">
            <Plus className="mr-2 h-4 w-4" /> Create Job
          </Button>
          <Button onClick={() => navigate("/jobs")} variant="outline">
            <Upload className="mr-2 h-4 w-4" /> Upload Files
          </Button>
        </div>
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
    </div>
  );
}
