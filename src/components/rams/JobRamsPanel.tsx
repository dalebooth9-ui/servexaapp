import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Plus, ShieldCheck, Loader2, ExternalLink } from "lucide-react";
import { useJobRamsStatus, type JobRamsStatus } from "@/hooks/useJobRamsStatus";
import { getRamsDefaults, type RamsType } from "@/lib/ramsDefaults";
import RamsReadAndSignSheet from "@/components/rams/RamsReadAndSignSheet";
import {
  applyHazardModule, appliedFrom, useHazardModules,
  type AppliedHazardModule, type RamsModuleContent,
} from "@/lib/hazardModules";

/**
 * Multi-RAMS panel for a job.
 *
 * Jobs regularly mix work types (e.g. dry riser remedial + dry riser
 * installation) and each type needs its OWN RAMS with trade-correct
 * plant/equipment and method content — they are never merged. This panel
 * lists every RAMS attached to the job, lets the office attach several at
 * once (multi-select of work types), and gives engineers a per-document
 * "Read & sign" action.
 */

export const RAMS_TYPE_LABELS: Record<RamsType, string> = {
  dry_riser: "Dry Riser — Service / Test",
  dry_riser_remedial: "Dry Riser — Remedial Works",
  wet_riser: "Wet Riser",
  sprinkler: "Sprinkler — Service",
  sprinkler_remedial: "Sprinkler — Remedial Works",
  fire_extinguisher: "Fire Extinguishers",
  fire_hydrant: "Fire Hydrants",
  fire_alarm: "Fire Alarm",
  emergency_lighting: "Emergency Lighting",
  aov_smoke_control: "AOV / Smoke Control",
  passive_fire: "Passive Fire Protection",
  gas_suppression: "Gas Suppression",
  kitchen_suppression: "Kitchen Suppression",
  water_mist: "Water Mist",
  hose_reel: "Hose Reels",
  fire_risk_assessment: "Fire Risk Assessment",
  installation: "Installation Works",
  general_remedial: "General Remedial / Repairs",
};

interface Props {
  jobId: string;
  job?: any;
  /** Admin/office mode — can attach, create and edit RAMS. */
  canEdit?: boolean;
  /** Engineer mode — shows per-document Read & sign. */
  showSignActions?: boolean;
  /** Optional shared status so callers don't double-fetch. */
  status?: JobRamsStatus;
}

function editorPathFor(doc: JobRamsStatus["documents"][number], jobId: string): string {
  if (doc.kind === "rams_documents") return `/jobs/${jobId}/rams/${doc.id}`;
  if (doc.kind === "rams") return `/rams/view/${doc.id}`;
  return `/rams/generate/${doc.id}`;
}

export default function JobRamsPanel({ jobId, job, canEdit = false, showSignActions = false, status }: Props) {
  const own = useJobRamsStatus(status ? null : jobId);
  const ramsStatus = status ?? own;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [attachOpen, setAttachOpen] = useState(false);
  const [selected, setSelected] = useState<RamsType[]>([]);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [signDoc, setSignDoc] = useState<JobRamsStatus["documents"][number] | null>(null);
  const [hazardSlugs, setHazardSlugs] = useState<string[]>([]);
  const { modules: hazardModules, loading: hazardLoading } = useHazardModules({ approvedOnly: true });

  const toggleHazard = (slug: string) =>
    setHazardSlugs((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));

  const types = useMemo(() => {
    const all = Object.keys(RAMS_TYPE_LABELS) as RamsType[];
    if (!q.trim()) return all;
    const needle = q.toLowerCase();
    return all.filter((t) => RAMS_TYPE_LABELS[t].toLowerCase().includes(needle));
  }, [q]);

  const toggle = (t: RamsType) =>
    setSelected((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const attachSelected = async () => {
    if (!user || selected.length === 0) return;
    setCreating(true);
    try {
      const siteLocation = job?.sites?.name
        ? `${job.sites.name}${job.sites.address ? ", " + job.sites.address : ""}`
        : (job?.sites?.address || job?.address || "");
      const today = new Date().toLocaleDateString("en-GB");

      const chosenModules = hazardModules.filter((m) => hazardSlugs.includes(m.slug));
      const applied: AppliedHazardModule[] = chosenModules.map((m) =>
        appliedFrom(m, { id: user.id, name: (user as any)?.user_metadata?.full_name || (user as any)?.email }),
      );

      const rows = selected.map((type) => {
        const d = getRamsDefaults(type);
        // Hazard modules merge into the document content itself so they read as
        // part of the RAMS, not as a bolt-on appendix.
        let content: RamsModuleContent = {
          sequenceOfOps: d.sequenceOfOps,
          taskSpecificOps: d.taskSpecificOps,
          plantAndEquipment: d.plantAndEquipment,
          significantRisks: d.significantRisks,
          ppeItems: d.ppeItems,
          riskRows: d.riskRows,
        };
        for (const m of chosenModules) content = applyHazardModule(content, m);
        return {
          job_id: jobId,
          rams_type: type,
          created_by: user.id,
          contract_job_name: `${job?.name || "Works"} — ${RAMS_TYPE_LABELS[type]}`,
          assessment_date: today,
          client: job?.customers?.name || job?.customer || "",
          attendance_date: "",
          site_location: siteLocation,
          description_of_work: d.descriptionOfWork,
          sequence_of_ops: content.sequenceOfOps,
          task_specific_ops: content.taskSpecificOps,
          location: d.location,
          resources: d.resources,
          personnel: d.personnel,
          plant_and_equipment: content.plantAndEquipment,
          significant_risks: content.significantRisks,
          special_training: d.specialTraining,
          ppe_items: content.ppeItems,
          risk_rows: content.riskRows,
          hazard_modules: applied,
        };
      });

      const { data, error } = await (supabase.from("rams_documents" as any) as any)
        .insert(rows)
        .select("id");
      if (error) throw error;

      toast({
        title: selected.length > 1 ? `${selected.length} RAMS attached` : "RAMS attached",
        description: "Each work type has its own document — open to review and edit.",
      });
      setAttachOpen(false);
      setSelected([]);
      setHazardSlugs([]);
      ramsStatus.refetch();
      const first = (data as any[])?.[0]?.id;
      if (first && selected.length === 1) navigate(`/jobs/${jobId}/rams/${first}`);
    } catch (e: any) {
      toast({ title: "Could not attach RAMS", description: e?.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const docs = ramsStatus.documents;

  return (
    <section className="rounded-2xl border bg-card p-4 md:p-5 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            RAMS
            {docs.length > 0 && <Badge variant="secondary">{docs.length}</Badge>}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            A job can carry more than one RAMS — one per work type, each kept separate.
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAttachOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Attach RAMS
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate(`/jobs/${jobId}/rams?new=1`)}>
              Create blank
            </Button>
          </div>
        )}
      </div>

      {ramsStatus.loading ? (
        <div className="h-10 animate-pulse rounded bg-muted/40" />
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No RAMS attached to this job yet.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {docs.map((d) => (
            <li key={`${d.kind}:${d.id}`} className="flex flex-wrap items-center gap-3 p-3">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium break-words">{d.name}</p>
                <p className="text-xs text-muted-foreground">
                  v{d.version} · {d.signoffs} sign-off{d.signoffs === 1 ? "" : "s"}
                </p>
              </div>
              {showSignActions && (
                <Button size="sm" className="min-h-[44px]" onClick={() => setSignDoc(d)}>
                  <ShieldCheck className="h-4 w-4 mr-1.5" /> Read &amp; sign
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className={showSignActions ? "min-h-[44px]" : undefined}
                onClick={() => navigate(editorPathFor(d, jobId))}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> {canEdit ? "Open" : "View"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Attach RAMS to this job</DialogTitle>
            <DialogDescription>
              Tick every work type this job covers. Each one becomes its own RAMS document with the
              correct method statement and plant/equipment — they are never merged.
            </DialogDescription>
          </DialogHeader>
          <Input placeholder="Search work types…" value={q} onChange={(e) => setQ(e.target.value)} />
          <ScrollArea className="max-h-72 rounded-md border">
            {types.map((t) => (
              <label
                key={t}
                className="flex cursor-pointer items-center gap-3 border-b px-3 py-2.5 last:border-0 hover:bg-muted/50"
              >
                <Checkbox checked={selected.includes(t)} onCheckedChange={() => toggle(t)} />
                <span className="text-sm">{RAMS_TYPE_LABELS[t]}</span>
              </label>
            ))}
          </ScrollArea>

          <div className="space-y-2">
            <p className="text-sm font-medium">Additional work types / hazards</p>
            <p className="text-xs text-muted-foreground">
              Tick any high-risk activity involved. Each module's hazard, control measures and risk
              assessment rows are merged into every RAMS created here.
            </p>
            {hazardLoading ? (
              <div className="h-8 animate-pulse rounded bg-muted/40" />
            ) : hazardModules.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No approved hazard modules yet — an admin can review and approve them in
                Settings → RAMS Library → Hazard modules.
              </p>
            ) : (
              <ScrollArea className="max-h-40 rounded-md border">
                {hazardModules.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-start gap-3 border-b px-3 py-2.5 last:border-0 hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={hazardSlugs.includes(m.slug)}
                      onCheckedChange={() => toggleHazard(m.slug)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm">{m.name}</span>
                      {m.summary && (
                        <span className="block text-xs text-muted-foreground">{m.summary}</span>
                      )}
                    </span>
                  </label>
                ))}
              </ScrollArea>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAttachOpen(false)}>Cancel</Button>
            <Button onClick={attachSelected} disabled={creating || selected.length === 0}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Attach {selected.length > 0 ? `${selected.length} RAMS` : "RAMS"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {signDoc && (
        <RamsReadAndSignSheet
          open={!!signDoc}
          onOpenChange={(v) => !v && setSignDoc(null)}
          jobId={jobId}
          ramsKind={signDoc.kind}
          ramsId={signDoc.id}
          ramsName={signDoc.name}
          ramsVersion={signDoc.version}
          onSigned={() => {
            setSignDoc(null);
            ramsStatus.refetch();
          }}
        />
      )}
    </section>
  );
}
