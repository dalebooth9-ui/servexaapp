import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2, ArrowLeft } from "lucide-react";
import VoiceDictationButton from "@/components/VoiceDictationButton";

type Factors = {
  working_at_height: boolean;
  hot_works: boolean;
  confined_space: boolean;
  asbestos_present: boolean;
  live_systems: boolean;
  occupied_building: boolean;
  lone_working: boolean;
  manual_handling: boolean;
};

const FACTOR_DEFS: { key: keyof Factors; label: string; help?: string }[] = [
  { key: "working_at_height", label: "Working at height" },
  { key: "hot_works", label: "Hot works" },
  { key: "confined_space", label: "Confined space" },
  { key: "asbestos_present", label: "Asbestos present" },
  { key: "live_systems", label: "Live / energised systems" },
  { key: "occupied_building", label: "Occupied / public building" },
  { key: "lone_working", label: "Lone working" },
  { key: "manual_handling", label: "Manual handling" },
];

const blankFactors: Factors = {
  working_at_height: false, hot_works: false, confined_space: false,
  asbestos_present: false, live_systems: false, occupied_building: false,
  lone_working: false, manual_handling: false,
};

type JobOpt = { id: string; reference_number: string; name: string | null };

export default function NewRamsPage() {
  const [params] = useSearchParams();
  const initialJobId = params.get("job") || "";
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [jobs, setJobs] = useState<JobOpt[]>([]);
  const [jobId, setJobId] = useState(initialJobId);
  const [siteName, setSiteName] = useState("");
  const [clientName, setClientName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [worksDescription, setWorksDescription] = useState("");
  const [factors, setFactors] = useState<Factors>(blankFactors);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    supabase.from("jobs")
      .select("id, reference_number, name")
      .not("status", "in", "(completed,archived,cancelled)")
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data }) => setJobs(data || []));
  }, []);

  // Auto-fill site/client/address from the selected job
  useEffect(() => {
    if (!jobId) return;
    supabase.from("jobs")
      .select("id, reference_number, name, address, sites(name, address), customers(name)")
      .eq("id", jobId).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const site = (data.sites as any) || {};
        const cust = (data.customers as any) || {};
        setSiteName((prev) => prev || site.name || site.address || data.address || data.name || "");
        setSiteAddress((prev) => prev || site.address || data.address || "");
        setClientName((prev) => prev || cust.name || "");
      });
  }, [jobId]);

  const onDictate = useCallback((text: string) => {
    setWorksDescription((prev) => (prev ? prev.trimEnd() + " " : "") + text);
  }, []);

  const onGenerate = useCallback(async () => {
    if (!user) return;
    if (!jobId) { toast({ title: "Select a job", variant: "destructive" }); return; }
    if (!worksDescription.trim()) {
      toast({ title: "Add a works description", description: "Describe the works before generating.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      // 1) Create a Draft row
      const { data: inserted, error: insErr } = await supabase
        .from("rams")
        .insert({
          job_id: jobId,
          created_by: user.id,
          site_name: siteName || null,
          client_name: clientName || null,
          site_address: siteAddress || null,
          works_description: worksDescription,
          factors,
          status: "Draft",
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      // 2) Call AI
      const { data: ai, error: aiErr } = await supabase.functions.invoke("ai-generate-rams", {
        body: {
          site_name: siteName, client_name: clientName, site_address: siteAddress,
          works_description: worksDescription, factors,
        },
      });
      if (aiErr) throw aiErr;
      if ((ai as any)?.error) throw new Error((ai as any).error);

      // 3) Store result on the row
      const { error: updErr } = await supabase
        .from("rams")
        .update({
          risk_assessment: ai.risk_assessment || [],
          method_statement: ai.method_statement || {},
        })
        .eq("id", inserted.id);
      if (updErr) throw updErr;

      toast({ title: "RAMS draft generated", description: "Opening editor…" });
      navigate(`/rams/view/${inserted.id}`);
    } catch (e: any) {
      toast({ title: "Generate failed", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }, [user, jobId, siteName, clientName, siteAddress, worksDescription, factors, navigate, toast]);

  return (
    <div className="container max-w-3xl py-6 space-y-6">
      <div className="rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-100">
        <strong>Important:</strong> RAMS are safety-critical legal documents. The AI produces a <em>draft only</em> — a competent person must review and approve before anything goes to site. Do not send unapproved RAMS to site.
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">New RAMS</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Job</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Select job</Label>
            <Select value={jobId} onValueChange={setJobId}>
              <SelectTrigger><SelectValue placeholder="Pick a job…" /></SelectTrigger>
              <SelectContent>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.reference_number} — {j.name || "Untitled"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Site name</Label><Input value={siteName} onChange={(e) => setSiteName(e.target.value)} /></div>
            <div><Label>Client</Label><Input value={clientName} onChange={(e) => setClientName(e.target.value)} /></div>
            <div className="md:col-span-2"><Label>Site address</Label><Input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Works description</CardTitle>
          <VoiceDictationButton onTranscript={onDictate} size="sm" />
        </CardHeader>
        <CardContent>
          <Textarea
            rows={8}
            value={worksDescription}
            onChange={(e) => setWorksDescription(e.target.value)}
            placeholder="Describe the works in detail — scope, locations, systems, access, anything the engineer needs to know. You can dictate with the microphone."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Risk factors</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FACTOR_DEFS.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-3 border rounded-md px-3 py-2 cursor-pointer hover:bg-muted/50">
              <span className="text-sm">{f.label}</span>
              <Switch
                checked={factors[f.key]}
                onCheckedChange={(v) => setFactors({ ...factors, [f.key]: v })}
              />
            </label>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={onGenerate} disabled={generating || !jobId || !worksDescription.trim()}>
          {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Generate RAMS
        </Button>
      </div>
    </div>
  );
}
