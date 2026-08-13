import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Save, Trash2, FileDown, Briefcase, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import SiteSurveyPhotos from "@/components/SiteSurveyPhotos";
import SiteSurveySketchPad from "@/components/SiteSurveySketchPad";
import VoiceDictationButton from "@/components/VoiceDictationButton";
import { exportSiteSurveyPdf } from "@/lib/siteSurveyPdf";
import { saveFormDraft, loadFormDraft, clearFormDraft } from "@/lib/offlineFormStorage";
import { useOfflineMutation } from "@/hooks/useOfflineMutation";
import { UKDateInput } from "@/components/ui/uk-date-input";

type Survey = {
  id: string;
  reference_number: string | null;
  title: string;
  status: string;
  survey_date: string | null;
  site_address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  access_notes: string | null;
  hazards: string | null;
  asset_locations: string | null;
  parking_welfare: string | null;
  recommendations: string | null;
  notes: string | null;
};

export default function SiteSurveyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [photosKey, setPhotosKey] = useState(0);

  const convertToJob = async () => {
    if (!survey || !user) return;
    setConverting(true);
    const briefBits = [
      survey.recommendations && `Recommendations:\n${survey.recommendations}`,
      survey.access_notes && `Access:\n${survey.access_notes}`,
      survey.hazards && `Hazards:\n${survey.hazards}`,
      survey.asset_locations && `Assets:\n${survey.asset_locations}`,
    ].filter(Boolean).join("\n\n");
    const { data: newJob, error } = await supabase
      .from("jobs")
      .insert({
        name: `From survey: ${survey.title}`,
        priority: "medium",
        category: "Survey follow-up",
        address: survey.site_address || null,
        description: briefBits || null,
        created_by: user.id,
      } as any)
      .select("id")
      .single();
    setConverting(false);
    if (error || !newJob) {
      toast({ title: "Failed to create job", description: error?.message, variant: "destructive" });
      return;
    }
    await supabase.from("site_surveys" as any).update({ converted_job_id: newJob.id }).eq("id", survey.id);
    toast({ title: "Job created", description: "Opening new job…" });
    navigate(`/jobs/${newJob.id}`);
  };

  const exportPdf = async () => {
    if (!survey) return;
    setExporting(true);
    try { await exportSiteSurveyPdf(survey, survey.id); }
    catch (e: any) { toast({ title: "PDF failed", description: e?.message ?? "Unknown error", variant: "destructive" }); }
    setExporting(false);
  };


  const draftKey = id ? `site-survey-${id}` : null;

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("site_surveys" as any)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) toast({ title: "Failed to load", description: error.message, variant: "destructive" });
      let merged: any = (data as any) || null;
      // Overlay any locally-saved edits (e.g. from lost connection)
      if (merged && draftKey) {
        const draft = await loadFormDraft<Partial<Survey>>(draftKey);
        if (draft) merged = { ...merged, ...draft };
      }
      setSurvey(merged);
      setLoading(false);
    })();
  }, [id]);

  const update = (k: keyof Survey, v: any) => {
    setSurvey((s) => {
      if (!s) return s;
      const next = { ...s, [k]: v };
      if (draftKey) void saveFormDraft(draftKey, next);
      return next;
    });
  };

  const { run: runOffline } = useOfflineMutation();

  const save = async () => {
    if (!survey) return;
    setSaving(true);
    const result = await runOffline(
      {
        kind: "update",
        table: "site_surveys",
        match: { id: survey.id },
        values: {
          title: survey.title,
          status: survey.status,
          survey_date: survey.survey_date,
          site_address: survey.site_address,
          contact_name: survey.contact_name,
          contact_phone: survey.contact_phone,
          access_notes: survey.access_notes,
          hazards: survey.hazards,
          asset_locations: survey.asset_locations,
          parking_welfare: survey.parking_welfare,
          recommendations: survey.recommendations,
          notes: survey.notes,
        },
      },
      `Site survey ${survey.reference_number ?? survey.title}`,
    );
    setSaving(false);
    if (result.ok === false) {
      toast({ title: "Save failed", description: (result.error as any)?.message, variant: "destructive" });
      return;
    }
    if (draftKey) await clearFormDraft(draftKey);
    if (!result.queued) toast({ title: "Site survey saved" });
  };

  const remove = async () => {
    if (!survey) return;
    const { error } = await supabase.from("site_surveys" as any).delete().eq("id", survey.id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else navigate("/site-surveys");
  };

  if (loading) {
    return <div className="p-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!survey) {
    return <div className="p-10 text-center text-sm text-muted-foreground">Survey not found.</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm"><Link to="/site-surveys"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link></Button>
          <span className="font-mono text-xs text-muted-foreground">{survey.reference_number}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportPdf} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileDown className="h-4 w-4 mr-1.5" />}
            Export PDF
          </Button>
          <Button variant="outline" size="sm" onClick={convertToJob} disabled={converting}>
            {converting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Briefcase className="h-4 w-4 mr-1.5" />}
            Convert to Job
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive"><Trash2 className="h-4 w-4 mr-1.5" /> Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this site survey?</AlertDialogTitle>
                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Survey details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Title</Label>
            <Input value={survey.title} onChange={(e) => update("title", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={survey.status} onValueChange={(v) => update("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Survey date</Label>
            <UKDateInput  value={survey.survey_date ?? ""} onChange={(e) => update("survey_date", e.target.value || null)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Site address</Label>
            <Input value={survey.site_address ?? ""} onChange={(e) => update("site_address", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Site contact name</Label>
            <Input value={survey.contact_name ?? ""} onChange={(e) => update("contact_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Site contact phone</Label>
            <Input value={survey.contact_phone ?? ""} onChange={(e) => update("contact_phone", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Site intelligence</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Site access</Label>
            <Textarea rows={3} value={survey.access_notes ?? ""} onChange={(e) => update("access_notes", e.target.value)}
              placeholder="Parking, key collection, working hours, restricted areas…" />
          </div>
          <div className="space-y-1.5">
            <Label>Hazards</Label>
            <Textarea rows={3} value={survey.hazards ?? ""} onChange={(e) => update("hazards", e.target.value)}
              placeholder="Asbestos, working at height, confined space, live systems…" />
          </div>
          <div className="space-y-1.5">
            <Label>Asset locations</Label>
            <Textarea rows={3} value={survey.asset_locations ?? ""} onChange={(e) => update("asset_locations", e.target.value)}
              placeholder="Risers, pump rooms, control valves, extinguisher points…" />
          </div>
          <div className="space-y-1.5">
            <Label>Parking &amp; welfare</Label>
            <Textarea rows={3} value={survey.parking_welfare ?? ""} onChange={(e) => update("parking_welfare", e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <div className="flex items-center justify-between">
              <Label>Recommendations / scope</Label>
              <VoiceDictationButton
                size="sm"
                onTranscript={(t) => update("recommendations", `${survey.recommendations ? survey.recommendations + " " : ""}${t}`)}
              />
            </div>
            <Textarea rows={3} value={survey.recommendations ?? ""} onChange={(e) => update("recommendations", e.target.value)}
              placeholder="Recommended works, parts, follow-up visits, sub-contractor needs…" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <div className="flex items-center justify-between">
              <Label>Additional notes</Label>
              <VoiceDictationButton
                size="sm"
                onTranscript={(t) => update("notes", `${survey.notes ? survey.notes + " " : ""}${t}`)}
              />
            </div>
            <Textarea rows={2} value={survey.notes ?? ""} onChange={(e) => update("notes", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg flex items-center gap-2"><Camera className="h-5 w-5 text-primary" /> Site photos &amp; sketches</CardTitle>
          <SiteSurveySketchPad surveyId={survey.id} onSaved={() => setPhotosKey((k) => k + 1)} />
        </CardHeader>
        <CardContent>
          <SiteSurveyPhotos key={photosKey} surveyId={survey.id} />
        </CardContent>
      </Card>
    </div>
  );
}
