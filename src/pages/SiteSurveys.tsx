import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Loader2, Plus, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Row = {
  id: string;
  reference_number: string | null;
  title: string;
  status: string;
  survey_date: string | null;
  site_address: string | null;
  created_at: string;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  draft: "secondary",
  scheduled: "outline",
  completed: "default",
};

export default function SiteSurveys() {
  const { user, userRole, effectiveUserId, isPreviewingAsEngineer, previewEngineerId } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");

  const isEngineerView = userRole === "engineer";
  const isGenericEngineerPreview = isPreviewingAsEngineer && !previewEngineerId;

  const fetchRows = async () => {
    setLoading(true);
    if (isGenericEngineerPreview) { setRows([]); setLoading(false); return; }
    let query = supabase
      .from("site_surveys" as any)
      .select("id, reference_number, title, status, survey_date, site_address, created_at, engineer_id, created_by")
      .order("created_at", { ascending: false });
    if (isEngineerView && user) {
      const engineerId = effectiveUserId ?? user.id;
      query = query.or(`engineer_id.eq.${engineerId},created_by.eq.${engineerId}`);
    }
    const { data, error } = await query;
    if (error) toast({ title: "Failed to load site surveys", description: error.message, variant: "destructive" });
    setRows((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchRows(); /* eslint-disable-next-line */ }, [user?.id, effectiveUserId, isGenericEngineerPreview]);

  const createNew = async () => {
    if (!user) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("site_surveys" as any)
      .insert({ title: "New site survey", status: "draft", created_by: user.id, engineer_id: user.id })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) {
      toast({ title: "Failed to create survey", description: error?.message, variant: "destructive" });
      return;
    }
    navigate(`/site-surveys/${(data as any).id}`);
  };

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [r.title, r.reference_number, r.site_address].some((v) => (v || "").toLowerCase().includes(s));
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" /> Site Surveys
          </h1>
          <p className="text-sm text-muted-foreground">Standalone site visits — independent of jobs.</p>
        </div>
        <Button onClick={createNew} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
          New survey
        </Button>
      </div>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, reference or address…" className="pl-9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No site surveys yet. Click <span className="font-medium">New survey</span> to start one.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Link key={r.id} to={`/site-surveys/${r.id}`} className="block">
              <Card className="hover:bg-accent/30 transition-colors">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{r.reference_number || "—"}</span>
                      <Badge variant={STATUS_VARIANT[r.status] || "outline"} className="capitalize">{r.status}</Badge>
                    </div>
                    <p className="font-medium truncate">{r.title}</p>
                    {r.site_address && <p className="text-xs text-muted-foreground truncate">{r.site_address}</p>}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {r.survey_date ? new Date(r.survey_date).toLocaleDateString("en-GB") : new Date(r.created_at).toLocaleDateString("en-GB")}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
