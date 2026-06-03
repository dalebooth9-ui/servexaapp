import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save, ClipboardList } from "lucide-react";

type Survey = {
  id?: string;
  job_id: string;
  access_notes: string | null;
  hazards: string | null;
  asset_locations: string | null;
  parking_welfare: string | null;
  recommendations: string | null;
  notes: string | null;
  sketch_url: string | null;
};

const EMPTY = (jobId: string): Survey => ({
  job_id: jobId,
  access_notes: "",
  hazards: "",
  asset_locations: "",
  parking_welfare: "",
  recommendations: "",
  notes: "",
  sketch_url: null,
});

export default function SiteSurveyCard({ jobId }: { jobId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [survey, setSurvey] = useState<Survey>(EMPTY(jobId));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("job_site_surveys" as any)
        .select("*")
        .eq("job_id", jobId)
        .maybeSingle();
      if (cancelled) return;
      if (data) setSurvey({ ...EMPTY(jobId), ...(data as any) });
      else setSurvey(EMPTY(jobId));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [jobId]);

  const update = (k: keyof Survey, v: string) =>
    setSurvey((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true);
    const payload: any = {
      job_id: jobId,
      access_notes: survey.access_notes || null,
      hazards: survey.hazards || null,
      asset_locations: survey.asset_locations || null,
      parking_welfare: survey.parking_welfare || null,
      recommendations: survey.recommendations || null,
      notes: survey.notes || null,
      created_by: survey.id ? undefined : user?.id ?? null,
    };
    const { error } = await supabase
      .from("job_site_surveys" as any)
      .upsert(payload, { onConflict: "job_id" });
    setSaving(false);
    if (error) {
      toast({ title: "Failed to save site survey", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Site survey saved" });
    }
  };

  if (loading) {
    return (
      <Card><CardContent className="py-6 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardList className="h-4 w-4 text-primary" />
          Capture key site information before works begin.
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ss-access">Site access</Label>
            <Textarea id="ss-access" rows={3}
              placeholder="Parking, key collection, working hours, restricted areas…"
              value={survey.access_notes ?? ""}
              onChange={(e) => update("access_notes", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ss-hazards">Hazards</Label>
            <Textarea id="ss-hazards" rows={3}
              placeholder="Asbestos, working at height, confined space, live systems…"
              value={survey.hazards ?? ""}
              onChange={(e) => update("hazards", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ss-assets">Asset locations</Label>
            <Textarea id="ss-assets" rows={3}
              placeholder="Riser inlets/outlets, pump room, control valves, extinguisher points…"
              value={survey.asset_locations ?? ""}
              onChange={(e) => update("asset_locations", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ss-welfare">Parking &amp; welfare</Label>
            <Textarea id="ss-welfare" rows={3}
              value={survey.parking_welfare ?? ""}
              onChange={(e) => update("parking_welfare", e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="ss-recs">Recommendations / scope</Label>
            <Textarea id="ss-recs" rows={3}
              placeholder="Recommended works, parts, follow-up visits, sub-contractor needs…"
              value={survey.recommendations ?? ""}
              onChange={(e) => update("recommendations", e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="ss-notes">Additional notes</Label>
            <Textarea id="ss-notes" rows={2}
              value={survey.notes ?? ""}
              onChange={(e) => update("notes", e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Save survey
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Tip: attach photos via the Documents or Submissions sections above — they will be tied to this job automatically.
        </p>
      </CardContent>
    </Card>
  );
}
