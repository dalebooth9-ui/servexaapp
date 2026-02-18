import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, Image, FileText, MapPin, Plus, Upload, Building2, FolderOpen } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import FolderImportDialog, { type FolderImportDialogHandle } from "@/components/FolderImportDialog";

export default function Dashboard() {
  const { userRole, user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ jobs: 0, photos: 0, documents: 0, locations: 0 });
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [fileDragging, setFileDragging] = useState(false);
  const [folderImportOpen, setFolderImportOpen] = useState(false);
  const fileDragCounter = useRef(0);
  const folderImportRef = useRef<FolderImportDialogHandle | null>(null);

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

  const isAdmin = userRole === "admin";

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

  const fetchDashboard = () => {
    // Trigger re-fetch after import
    window.location.reload();
  };

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
        <div className="mb-6 flex flex-wrap gap-3">
          <Button onClick={() => navigate("/jobs")} variant="outline">
            <Plus className="mr-2 h-4 w-4" /> Create Job
          </Button>
          <Button onClick={() => navigate("/customers")} variant="outline">
            <Building2 className="mr-2 h-4 w-4" /> Create Customer
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
      <FolderImportDialog ref={folderImportRef} open={folderImportOpen} onOpenChange={setFolderImportOpen} onImported={fetchDashboard} />
    </div>
  );
}
