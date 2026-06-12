import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2, Save, Trash2, Plus, Download, ShieldCheck, ArrowLeft } from "lucide-react";
import { generateGenericRamsPdf } from "@/lib/genericRamsPdf";

type Factors = {
  working_at_height: boolean;
  hot_works: boolean;
  confined_space: boolean;
  asbestos: boolean;
  live_systems: boolean;
  public_occupied: boolean;
};

const FACTOR_DEFS: { key: keyof Factors; label: string }[] = [
  { key: "working_at_height", label: "Working at height" },
  { key: "hot_works", label: "Hot works" },
  { key: "confined_space", label: "Confined space" },
  { key: "asbestos", label: "Asbestos present" },
  { key: "live_systems", label: "Live systems / isolation required" },
  { key: "public_occupied", label: "Public / occupied building" },
];

interface RiskRow {
  hazard: string;
  who_at_risk: string;
  l_pre: number;
  s_pre: number;
  controls: string;
  l_post: number;
  s_post: number;
}

const blankFactors: Factors = {
  working_at_height: false, hot_works: false, confined_space: false,
  asbestos: false, live_systems: false, public_occupied: false,
};

export default function GenericRamsPage() {
  const { id: ramsId } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const initialJobId = params.get("job") || "";
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [jobs, setJobs] = useState<{ id: string; reference_number: string; name: string | null }[]>([]);

  const [jobId, setJobId] = useState(initialJobId);
  const [jobRef, setJobRef] = useState("");
  const [contractName, setContractName] = useState("");
  const [siteName, setSiteName] = useState("");
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");
  const [factors, setFactors] = useState<Factors>(blankFactors);
  const [riskRows, setRiskRows] = useState<RiskRow[]>([]);
  const [sequence, setSequence] = useState<string[]>([]);
  const [ppe, setPpe] = useState<string[]>([]);
  const [plant, setPlant] = useState<string[]>([]);
  const [emergency, setEmergency] = useState("");
  const [status, setStatus] = useState<"draft" | "reviewed" | "approved">("draft");
  const [hasGenerated, setHasGenerated] = useState(false);

  // Check admin
  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  // Load jobs list (for picker)
  useEffect(() => {
    supabase.from("jobs")
      .select("id, reference_number, name")
      .not("status", "in", "(completed,archived,cancelled)")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setJobs(data || []));
  }, []);

  // Load existing RAMS
  useEffect(() => {
    if (!ramsId) return;
    setLoading(true);
    supabase.from("generic_rams").select("*").eq("id", ramsId).maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) { toast({ title: "Not found", variant: "destructive" }); setLoading(false); return; }
        setJobId(data.job_id);
        setContractName(data.contract_name || "");
        setSiteName(data.site_name || "");
        setClient(data.client || "");
        setDescription(data.description || "");
        setFactors({ ...blankFactors, ...(data.factors as any || {}) });
        setRiskRows((data.risk_rows as any) || []);
        setSequence((data.sequence_of_works as any) || []);
        setPpe((data.ppe as any) || []);
        setPlant((data.plant_equipment as any) || []);
        setEmergency(data.emergency_arrangements || "");
        setStatus((data.status as any) || "draft");
        setHasGenerated(true);
        setLoading(false);
      });
  }, [ramsId, toast]);

  // Pre-fill from job
  useEffect(() => {
    if (!jobId || ramsId) return;
    supabase.from("jobs")
      .select("reference_number, name, customer, address, sites(name, address), customers(name)")
      .eq("id", jobId).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setJobRef(data.reference_number || "");
        if (!contractName) setContractName(data.name || data.reference_number || "");
        if (!siteName) setSiteName((data.sites as any)?.name || data.address || "");
        if (!client) setClient((data.customers as any)?.name || data.customer || "");
      });
  }, [jobId, ramsId, contractName, siteName, client]);

  const generate = useCallback(async () => {
    if (!description.trim()) {
      toast({ title: "Add a description", description: "Describe the works before generating.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-generate-generic-rams", {
        body: { contract_name: contractName, site_name: siteName, client, description, factors },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setRiskRows(data.risk_rows || []);
      setSequence(data.sequence_of_works || []);
      setPpe(data.ppe || []);
      setPlant(data.plant_equipment || []);
      setEmergency(data.emergency_arrangements || "");
      setHasGenerated(true);
      toast({ title: "Draft generated", description: "Review and edit before saving." });
    } catch (e: any) {
      toast({ title: "AI error", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }, [contractName, siteName, client, description, factors, toast]);

  const save = useCallback(async (newStatus?: typeof status) => {
    if (!jobId) { toast({ title: "Pick a job", variant: "destructive" }); return; }
    if (!user) return;
    setSaving(true);
    const payload: any = {
      job_id: jobId,
      created_by: user.id,
      contract_name: contractName, site_name: siteName, client, description,
      factors, risk_rows: riskRows, sequence_of_works: sequence, ppe,
      plant_equipment: plant, emergency_arrangements: emergency,
      status: newStatus ?? status,
    };
    try {
      if (ramsId) {
        const { error } = await supabase.from("generic_rams").update(payload).eq("id", ramsId);
        if (error) throw error;
        if (newStatus) setStatus(newStatus);
        toast({ title: "Saved" });
      } else {
        const { data, error } = await supabase.from("generic_rams").insert(payload).select("id").single();
        if (error) throw error;
        toast({ title: "Created" });
        navigate(`/rams/generate/${data.id}`, { replace: true });
      }
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [jobId, user, contractName, siteName, client, description, factors, riskRows, sequence, ppe, plant, emergency, status, ramsId, navigate, toast]);

  const exportPdf = useCallback(() => {
    if (status !== "approved") {
      toast({ title: "Approval required", description: "RAMS must be Approved before export.", variant: "destructive" });
      return;
    }
    const { blob, fileName } = generateGenericRamsPdf({
      contract_name: contractName, site_name: siteName, client, description, factors,
      risk_rows: riskRows, sequence_of_works: sequence, ppe, plant_equipment: plant,
      emergency_arrangements: emergency, status,
    }, jobRef);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [status, contractName, siteName, client, description, factors, riskRows, sequence, ppe, plant, emergency, jobRef, toast]);

  const updateRisk = (i: number, k: keyof RiskRow, v: any) => {
    setRiskRows((rows) => rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  };
  const addRisk = () => setRiskRows((r) => [...r, { hazard: "", who_at_risk: "Operatives", l_pre: 3, s_pre: 3, controls: "", l_post: 1, s_post: 2 }]);
  const removeRisk = (i: number) => setRiskRows((r) => r.filter((_, idx) => idx !== i));

  const ListEditor = ({ items, setItems, label }: { items: string[]; setItems: (v: string[]) => void; label: string }) => (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex gap-2">
          <span className="text-xs text-muted-foreground w-6 pt-2">{i + 1}.</span>
          <Textarea value={it} rows={1} className="text-sm flex-1"
            onChange={(e) => setItems(items.map((x, idx) => idx === i ? e.target.value : x))} />
          <Button size="sm" variant="ghost" onClick={() => setItems(items.filter((_, idx) => idx !== i))}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={() => setItems([...items, ""])}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add {label}
      </Button>
    </div>
  );

  const statusBadge = (
    <Badge variant={status === "approved" ? "default" : status === "reviewed" ? "secondary" : "outline"}>
      {status.toUpperCase()}
    </Badge>
  );

  if (loading) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <h1 className="text-2xl font-bold">Generate RAMS</h1>
          {statusBadge}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportPdf} disabled={status !== "approved" || !hasGenerated} title={status !== "approved" ? "Approval required" : "Download PDF"}>
            <Download className="h-4 w-4 mr-1" /> Export PDF
          </Button>
          <Button size="sm" onClick={() => save()} disabled={saving || !hasGenerated}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Job & Context</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Job</Label>
            <Select value={jobId} onValueChange={setJobId} disabled={!!ramsId}>
              <SelectTrigger><SelectValue placeholder="Select a job" /></SelectTrigger>
              <SelectContent>
                {jobs.map((j) => <SelectItem key={j.id} value={j.id}>{j.reference_number} — {j.name || "Untitled"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Contract / Job Name</Label><Input value={contractName} onChange={(e) => setContractName(e.target.value)} /></div>
          <div><Label>Site Name / Address</Label><Input value={siteName} onChange={(e) => setSiteName(e.target.value)} /></div>
          <div><Label>Client</Label><Input value={client} onChange={(e) => setClient(e.target.value)} /></div>
          <div className="md:col-span-2">
            <Label>Description of Works</Label>
            <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Annual service and repair to dry riser system across 12 floors, including replacement of 2x landing valves and pressure test." />
          </div>
          <div className="md:col-span-2">
            <Label className="mb-2 block">Risk Factors</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {FACTOR_DEFS.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-sm border rounded-md p-2 cursor-pointer hover:bg-muted">
                  <Checkbox checked={factors[f.key]} onCheckedChange={(v) => setFactors({ ...factors, [f.key]: !!v })} />
                  {f.label}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={generate} disabled={generating || !description.trim()}>
          {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          {hasGenerated ? "Regenerate Draft with AI" : "Generate Draft with AI"}
        </Button>
      </div>

      {hasGenerated && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Risk Assessment</CardTitle>
              <Button size="sm" variant="outline" onClick={addRisk}><Plus className="h-3.5 w-3.5 mr-1" /> Add hazard</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {riskRows.map((r, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div><Label className="text-xs">Hazard</Label><Input value={r.hazard} onChange={(e) => updateRisk(i, "hazard", e.target.value)} /></div>
                    <div><Label className="text-xs">Who's at risk</Label><Input value={r.who_at_risk} onChange={(e) => updateRisk(i, "who_at_risk", e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    <div><Label className="text-xs">L (pre)</Label><Input type="number" min={1} max={5} value={r.l_pre} onChange={(e) => updateRisk(i, "l_pre", +e.target.value)} /></div>
                    <div><Label className="text-xs">S (pre)</Label><Input type="number" min={1} max={5} value={r.s_pre} onChange={(e) => updateRisk(i, "s_pre", +e.target.value)} /></div>
                    <div className="col-span-1 flex items-end"><Badge variant="outline" className="w-full justify-center">R = {r.l_pre * r.s_pre}</Badge></div>
                    <div><Label className="text-xs">L (post)</Label><Input type="number" min={1} max={5} value={r.l_post} onChange={(e) => updateRisk(i, "l_post", +e.target.value)} /></div>
                    <div><Label className="text-xs">S (post)</Label><Input type="number" min={1} max={5} value={r.s_post} onChange={(e) => updateRisk(i, "s_post", +e.target.value)} /></div>
                  </div>
                  <div><Label className="text-xs">Control Measures</Label>
                    <Textarea rows={2} value={r.controls} onChange={(e) => updateRisk(i, "controls", e.target.value)} />
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => removeRisk(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Method Statement — Sequence of Works</CardTitle></CardHeader>
            <CardContent><ListEditor items={sequence} setItems={setSequence} label="step" /></CardContent>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">PPE</CardTitle></CardHeader>
              <CardContent><ListEditor items={ppe} setItems={setPpe} label="PPE" /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Plant & Equipment</CardTitle></CardHeader>
              <CardContent><ListEditor items={plant} setItems={setPlant} label="item" /></CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Emergency Arrangements</CardTitle></CardHeader>
            <CardContent><Textarea rows={4} value={emergency} onChange={(e) => setEmergency(e.target.value)} /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Approval</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Status:</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="approved" disabled={!isAdmin}>Approved {isAdmin ? "" : "(admin only)"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isAdmin && status !== "approved" && (
                <Button size="sm" variant="default" onClick={() => save("approved")} disabled={saving}>
                  <ShieldCheck className="h-4 w-4 mr-1" /> Approve & Save
                </Button>
              )}
              {status !== "approved" && (
                <span className="text-xs text-muted-foreground">PDF export is enabled once approved.</span>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
