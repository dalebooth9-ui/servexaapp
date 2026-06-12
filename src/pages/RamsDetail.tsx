import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Plus, Trash2, Save, Loader2, CheckCircle2, ShieldCheck,
  Unlock, FileDown, Lock, AlertTriangle,
} from "lucide-react";
import { generateBrandedRamsPdf } from "@/lib/brandedRamsPdf";

type RiskRow = {
  hazard: string;
  who_at_risk: string;
  initial_risk_rating: "Low" | "Medium" | "High" | string;
  control_measures: string;
  residual_risk_rating: "Low" | "Medium" | "High" | string;
};

type MethodStatement = {
  sequence?: string[];
  ppe?: string[];
  plant_equipment?: string[];
  emergency_arrangements?: string;
  welfare_arrangements?: string;
};

type Status = "Draft" | "Reviewed" | "Approved";

const STATUS_STEPS: Status[] = ["Draft", "Reviewed", "Approved"];

const RATING_COLOR: Record<string, string> = {
  Low: "bg-green-100 text-green-900 border-green-300 dark:bg-green-950 dark:text-green-200",
  Medium: "bg-yellow-100 text-yellow-900 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-200",
  High: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200",
};

export default function RamsDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const isAdmin = userRole === "admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState(false);
  const [rams, setRams] = useState<any>(null);
  const [job, setJob] = useState<any>(null);
  const [reviewerName, setReviewerName] = useState<string>("");
  const [approverName, setApproverName] = useState<string>("");
  const [preparedByName, setPreparedByName] = useState<string>("");

  // editable fields
  const [siteName, setSiteName] = useState("");
  const [clientName, setClientName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [worksDescription, setWorksDescription] = useState("");
  const [risks, setRisks] = useState<RiskRow[]>([]);
  const [method, setMethod] = useState<MethodStatement>({});

  const status: Status = (rams?.status ?? "Draft") as Status;
  const locked = status === "Approved" || status === "Reviewed";
  const canEdit = !locked || isAdmin; // admins can always edit; others only in Draft

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("rams").select("*").eq("id", id).maybeSingle();
      if (error || !data) {
        toast({ title: "RAMS not found", variant: "destructive" });
        navigate(-1);
        return;
      }
      setRams(data);
      setSiteName(data.site_name ?? "");
      setClientName(data.client_name ?? "");
      setSiteAddress(data.site_address ?? "");
      setWorksDescription(data.works_description ?? "");
      setRisks(Array.isArray(data.risk_assessment) ? (data.risk_assessment as any) : []);
      setMethod((data.method_statement as any) ?? {});

      // job + people names
      const [jobRes, profRes] = await Promise.all([
        supabase.from("jobs").select("id, reference_number, name").eq("id", data.job_id).maybeSingle(),
        supabase.from("profiles").select("user_id, full_name").in(
          "user_id",
          [data.created_by, data.reviewed_by, data.approved_by].filter(Boolean) as string[],
        ),
      ]);
      setJob(jobRes.data);
      const map = new Map((profRes.data ?? []).map((p: any) => [p.user_id, p.full_name]));
      setPreparedByName(data.created_by ? map.get(data.created_by) ?? "" : "");
      setReviewerName(data.reviewed_by ? map.get(data.reviewed_by) ?? "" : "");
      setApproverName(data.approved_by ? map.get(data.approved_by) ?? "" : "");
      setLoading(false);
    })();
  }, [id, navigate, toast]);

  const updateRisk = (i: number, patch: Partial<RiskRow>) =>
    setRisks((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addRisk = () =>
    setRisks((rs) => [
      ...rs,
      { hazard: "", who_at_risk: "", initial_risk_rating: "Medium", control_measures: "", residual_risk_rating: "Low" },
    ]);

  const removeRisk = (i: number) => setRisks((rs) => rs.filter((_, idx) => idx !== i));

  const setMethodList = (key: keyof MethodStatement, items: string[]) =>
    setMethod((m) => ({ ...m, [key]: items }));

  async function save(extra: Record<string, any> = {}) {
    if (!rams) return;
    setSaving(true);
    const { error } = await supabase
      .from("rams")
      .update({
        site_name: siteName,
        client_name: clientName,
        site_address: siteAddress,
        works_description: worksDescription,
        risk_assessment: risks as any,
        method_statement: method as any,
        ...extra,
      })
      .eq("id", rams.id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return false;
    }
    // refresh
    const { data } = await supabase.from("rams").select("*").eq("id", rams.id).maybeSingle();
    if (data) setRams(data);
    return true;
  }

  async function onSave() {
    const ok = await save();
    if (ok) toast({ title: "Saved" });
  }

  async function markReviewed() {
    setWorking(true);
    const ok = await save({ status: "Reviewed", reviewed_by: user?.id });
    setWorking(false);
    if (ok) toast({ title: "Marked as Reviewed" });
  }

  async function approve() {
    if (!isAdmin) return;
    setWorking(true);
    const ok = await save({ status: "Approved" });
    setWorking(false);
    if (ok) toast({ title: "RAMS approved", description: "Document is now locked." });
  }

  async function unlock() {
    if (!isAdmin || !rams) return;
    setWorking(true);
    const { error } = await supabase
      .from("rams")
      .update({
        status: "Draft",
        version: (rams.version ?? 1) + 1,
        reviewed_by: null,
      })
      .eq("id", rams.id);
    setWorking(false);
    if (error) {
      toast({ title: "Unlock failed", description: error.message, variant: "destructive" });
      return;
    }
    const { data } = await supabase.from("rams").select("*").eq("id", rams.id).maybeSingle();
    if (data) setRams(data);
    setReviewerName("");
    setApproverName("");
    toast({ title: "Unlocked for revision", description: `Now version ${(rams.version ?? 1) + 1}` });
  }

  async function exportPdf() {
    if (status !== "Approved") {
      toast({ title: "Approval required", description: "Approve the RAMS before exporting." });
      return;
    }
    const { blob, fileName } = await generateBrandedRamsPdf({
      job_reference: job?.reference_number ?? null,
      job_name: job?.name ?? null,
      site_name: siteName,
      site_address: siteAddress,
      client_name: clientName,
      works_description: worksDescription,
      factors: (rams?.factors ?? {}) as Record<string, boolean>,
      risk_assessment: risks,
      method_statement: method,
      status,
      version: rams?.version ?? 1,
      prepared_by: preparedByName,
      prepared_at: rams?.created_at ?? null,
      reviewed_by: reviewerName,
      approved_by: approverName,
      approved_at: rams?.approved_at ?? null,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  const stepIndex = useMemo(() => STATUS_STEPS.indexOf(status), [status]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline">v{rams?.version ?? 1}</Badge>
          {job?.reference_number && <Badge variant="outline">{job.reference_number}</Badge>}
          <Badge
            className={
              status === "Approved" ? "bg-green-600 text-white" :
              status === "Reviewed" ? "bg-blue-600 text-white" :
              "bg-amber-500 text-white"
            }
          >
            {status === "Approved" && <Lock className="h-3 w-3 mr-1" />}
            {status}
          </Badge>
        </div>
      </div>

      {/* Status bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            {STATUS_STEPS.map((s, i) => {
              const done = i <= stepIndex;
              return (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div
                    className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                      done
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-muted"
                    }`}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-semibold ${done ? "" : "text-muted-foreground"}`}>{s}</div>
                    {s === "Reviewed" && reviewerName && (
                      <div className="text-[10px] text-muted-foreground truncate">by {reviewerName}</div>
                    )}
                    {s === "Approved" && approverName && (
                      <div className="text-[10px] text-muted-foreground truncate">
                        by {approverName}
                        {rams?.approved_at ? ` · ${new Date(rams.approved_at).toLocaleDateString("en-GB")}` : ""}
                      </div>
                    )}
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={`h-0.5 flex-1 ${i < stepIndex ? "bg-primary" : "bg-muted"}`} />
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <Button size="sm" onClick={onSave} disabled={!canEdit || saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Save
            </Button>
            {status === "Draft" && (
              <Button size="sm" variant="secondary" onClick={markReviewed} disabled={working}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Mark as Reviewed
              </Button>
            )}
            {status === "Reviewed" && isAdmin && (
              <Button size="sm" onClick={approve} disabled={working} className="bg-green-600 hover:bg-green-700">
                <ShieldCheck className="h-4 w-4 mr-1" /> Approve
              </Button>
            )}
            {status === "Reviewed" && !isAdmin && (
              <span className="text-xs text-muted-foreground self-center flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Approval requires admin
              </span>
            )}
            {locked && isAdmin && (
              <Button size="sm" variant="outline" onClick={unlock} disabled={working}>
                <Unlock className="h-4 w-4 mr-1" /> Unlock to revise
              </Button>
            )}
            <Button
              size="sm"
              variant={status === "Approved" ? "default" : "outline"}
              onClick={exportPdf}
              disabled={status !== "Approved"}
              title={status !== "Approved" ? "Approve before exporting" : ""}
            >
              <FileDown className="h-4 w-4 mr-1" /> Export PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Site / client */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Job & Site</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Site name</Label>
            <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} disabled={!canEdit} />
          </div>
          <div>
            <Label className="text-xs">Client</Label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Site address</Label>
            <Input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Works description</Label>
            <Textarea
              value={worksDescription}
              onChange={(e) => setWorksDescription(e.target.value)}
              rows={4}
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>

      {/* Risk Assessment */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Risk Assessment</CardTitle>
          <Button size="sm" variant="outline" onClick={addRisk} disabled={!canEdit}>
            <Plus className="h-4 w-4 mr-1" /> Add hazard
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {risks.length === 0 && (
            <p className="text-sm text-muted-foreground">No hazards yet. Add a row to begin.</p>
          )}
          {risks.map((r, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2 bg-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-muted-foreground">Hazard {i + 1}</span>
                <Button
                  size="icon" variant="ghost"
                  className="h-7 w-7 text-destructive/70 hover:text-destructive"
                  onClick={() => removeRisk(i)} disabled={!canEdit}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid md:grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Hazard</Label>
                  <Input value={r.hazard} onChange={(e) => updateRisk(i, { hazard: e.target.value })} disabled={!canEdit} />
                </div>
                <div>
                  <Label className="text-xs">Who is at risk</Label>
                  <Input value={r.who_at_risk} onChange={(e) => updateRisk(i, { who_at_risk: e.target.value })} disabled={!canEdit} />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Initial risk rating</Label>
                  <Select
                    value={r.initial_risk_rating}
                    onValueChange={(v) => updateRisk(i, { initial_risk_rating: v })}
                    disabled={!canEdit}
                  >
                    <SelectTrigger className={`mt-1 ${RATING_COLOR[r.initial_risk_rating] ?? ""}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Residual risk rating</Label>
                  <Select
                    value={r.residual_risk_rating}
                    onValueChange={(v) => updateRisk(i, { residual_risk_rating: v })}
                    disabled={!canEdit}
                  >
                    <SelectTrigger className={`mt-1 ${RATING_COLOR[r.residual_risk_rating] ?? ""}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Control measures</Label>
                <Textarea
                  value={r.control_measures}
                  onChange={(e) => updateRisk(i, { control_measures: e.target.value })}
                  rows={3}
                  disabled={!canEdit}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Method Statement */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Method Statement</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ListField
            label="Sequence of works"
            items={method.sequence ?? []}
            onChange={(items) => setMethodList("sequence", items)}
            disabled={!canEdit}
            numbered
          />
          <ListField
            label="PPE required"
            items={method.ppe ?? []}
            onChange={(items) => setMethodList("ppe", items)}
            disabled={!canEdit}
          />
          <ListField
            label="Plant & equipment"
            items={method.plant_equipment ?? []}
            onChange={(items) => setMethodList("plant_equipment", items)}
            disabled={!canEdit}
          />
          <div>
            <Label className="text-xs">Emergency arrangements</Label>
            <Textarea
              value={method.emergency_arrangements ?? ""}
              onChange={(e) => setMethod((m) => ({ ...m, emergency_arrangements: e.target.value }))}
              rows={3}
              disabled={!canEdit}
            />
          </div>
          <div>
            <Label className="text-xs">Welfare arrangements</Label>
            <Textarea
              value={method.welfare_arrangements ?? ""}
              onChange={(e) => setMethod((m) => ({ ...m, welfare_arrangements: e.target.value }))}
              rows={3}
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ListField({
  label, items, onChange, disabled, numbered,
}: { label: string; items: string[]; onChange: (items: string[]) => void; disabled?: boolean; numbered?: boolean }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      {items.map((it, i) => (
        <div key={i} className="flex gap-2 items-start">
          {numbered && <span className="mt-2 text-muted-foreground text-xs font-mono w-5 shrink-0">{i + 1}.</span>}
          <Textarea
            value={it}
            rows={2}
            className="flex-1 text-sm resize-none"
            onChange={(e) => {
              const next = [...items]; next[i] = e.target.value; onChange(next);
            }}
            disabled={disabled}
          />
          <Button
            size="icon" variant="ghost"
            className="mt-1 shrink-0 h-7 w-7 text-destructive/70 hover:text-destructive"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            disabled={disabled}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline" size="sm" className="gap-1.5 text-xs"
        onClick={() => onChange([...items, ""])} disabled={disabled}
      >
        <Plus className="h-3.5 w-3.5" /> Add item
      </Button>
    </div>
  );
}
