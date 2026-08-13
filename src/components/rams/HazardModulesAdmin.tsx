import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Archive, ArchiveRestore, CheckCircle2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useHazardModules, type HazardModule } from "@/lib/hazardModules";

/**
 * Owner approval screen for RAMS hazard modules.
 *
 * Module content is drafted from standard UK HSE-aligned practice but is NEVER
 * auto-approved: it stays a draft, unusable on live RAMS, until the org's
 * competent person reviews, edits and approves it here.
 */

const linesToArr = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const arrToLines = (a: string[]) => (a || []).join("\n");
const num = (v: string) => parseInt(v, 10) || 0;

interface Draft {
  id?: string;
  slug: string;
  name: string;
  summary: string;
  hazard_description: string;
  control_measures: string;
  sequence_additions: string;
  ppe_additions: string;
  plant_additions: string;
  review_note: string;
  risk_rows: string[][];
}

const emptyRow = () => ["", "", "", "", "", "", "", "", "", "", ""];

function toDraft(m?: HazardModule | null): Draft {
  return {
    id: m?.id,
    slug: m?.slug || "",
    name: m?.name || "",
    summary: m?.summary || "",
    hazard_description: m?.hazard_description || "",
    control_measures: arrToLines(m?.control_measures || []),
    sequence_additions: arrToLines(m?.sequence_additions || []),
    ppe_additions: arrToLines(m?.ppe_additions || []),
    plant_additions: arrToLines(m?.plant_additions || []),
    review_note: m?.review_note || "",
    risk_rows: m?.risk_rows?.length ? m.risk_rows.map((r) => [...r]) : [emptyRow()],
  };
}

export default function HazardModulesAdmin() {
  const { modules, loading, refetch } = useHazardModules();
  const { user, profile } = useAuth() as any;
  const { toast } = useToast();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busySlug, setBusySlug] = useState<string | null>(null);

  const save = async () => {
    if (!editing) return;
    const slug = (editing.slug || editing.name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!editing.name.trim() || !slug) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      slug,
      name: editing.name.trim(),
      summary: editing.summary,
      hazard_description: editing.hazard_description,
      control_measures: linesToArr(editing.control_measures),
      sequence_additions: linesToArr(editing.sequence_additions),
      ppe_additions: linesToArr(editing.ppe_additions),
      plant_additions: linesToArr(editing.plant_additions),
      review_note: editing.review_note,
      risk_rows: editing.risk_rows.filter((r) => r.some((c) => (c || "").trim())),
    };
    let error: any;
    if (editing.id) {
      ({ error } = await (supabase.from("rams_hazard_modules" as any) as any)
        .update(payload).eq("id", editing.id));
    } else {
      ({ error } = await (supabase.from("rams_hazard_modules" as any) as any)
        .insert({ ...payload, created_by: user?.id, is_seeded_template: false }));
    }
    setSaving(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: "Saved", description: "Changes are saved as this module's current content." });
    setEditing(null);
    refetch();
  };

  const setStatus = async (m: HazardModule, status: "draft" | "approved" | "archived") => {
    if (status === "approved" && !confirm(
      `Approve "${m.name}" as competent person?\n\nApproved modules become selectable on live RAMS and their content will be printed in RAMS documents.`,
    )) return;
    setBusySlug(m.slug);
    const patch: any = { status };
    if (status === "approved") {
      patch.approved_by = user?.id ?? null;
      patch.approved_by_name = profile?.full_name || user?.email || null;
      patch.approved_at = new Date().toISOString();
      patch.is_seeded_template = false;
    } else {
      patch.approved_by = null;
      patch.approved_by_name = null;
      patch.approved_at = null;
    }
    const { error } = await (supabase.from("rams_hazard_modules" as any) as any)
      .update(patch).eq("id", m.id);
    setBusySlug(null);
    if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    refetch();
  };

  const remove = async (m: HazardModule) => {
    if (!confirm(`Delete "${m.name}"? This cannot be undone.`)) return;
    const { error } = await (supabase.from("rams_hazard_modules" as any) as any).delete().eq("id", m.id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs max-w-2xl">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Templates — not approved safety content
          </p>
          <p className="mt-1 text-muted-foreground">
            The starter modules are drafted from standard UK HSE-aligned practice. They are
            <strong> your templates to review</strong>: edit the wording and risk ratings to match how your
            business actually works, then approve as competent person. Only approved modules can be
            added to live RAMS.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing(toDraft(null))}>
          <Plus className="h-4 w-4 mr-1" /> New module
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
      ) : modules.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No hazard modules yet.
        </div>
      ) : (
        <div className="divide-y rounded-md border">
          {modules.map((m) => (
            <div key={m.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{m.name}</p>
                  {m.status === "approved" ? (
                    <Badge className="text-[10px]">Approved</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">Draft — not usable</Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {m.risk_rows.length} risk row{m.risk_rows.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                {m.summary && <p className="text-xs text-muted-foreground mt-1">{m.summary}</p>}
                {m.status === "approved" && m.approved_by_name && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Approved by {m.approved_by_name}
                    {m.approved_at ? ` · ${new Date(m.approved_at).toLocaleDateString("en-GB")}` : ""}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setEditing(toDraft(m))}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Review &amp; edit
                </Button>
                {m.status === "approved" ? (
                  <Button size="sm" variant="outline" disabled={busySlug === m.slug}
                    onClick={() => setStatus(m, "draft")}>
                    <Archive className="h-3.5 w-3.5 mr-1" /> Withdraw
                  </Button>
                ) : (
                  <Button size="sm" disabled={busySlug === m.slug} onClick={() => setStatus(m, "approved")}>
                    {busySlug === m.slug
                      ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                    Approve
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => remove(m)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Review hazard module" : "New hazard module"}</DialogTitle>
            <DialogDescription>
              Edit the content so it reflects your own safe systems of work, then approve it.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Module name</Label>
                  <Input className="mt-1" value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Short summary</Label>
                  <Input className="mt-1" value={editing.summary}
                    onChange={(e) => setEditing({ ...editing, summary: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Hazard description</Label>
                <Textarea className="mt-1 text-sm" rows={4} value={editing.hazard_description}
                  onChange={(e) => setEditing({ ...editing, hazard_description: e.target.value })} />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Control measures (one per line)</Label>
                  <Textarea className="mt-1 text-sm" rows={7} value={editing.control_measures}
                    onChange={(e) => setEditing({ ...editing, control_measures: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Method statement steps (one per line)</Label>
                  <Textarea className="mt-1 text-sm" rows={7} value={editing.sequence_additions}
                    onChange={(e) => setEditing({ ...editing, sequence_additions: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Additional PPE (one per line)</Label>
                  <Textarea className="mt-1 text-sm" rows={4} value={editing.ppe_additions}
                    onChange={(e) => setEditing({ ...editing, ppe_additions: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Additional plant &amp; equipment (one per line)</Label>
                  <Textarea className="mt-1 text-sm" rows={4} value={editing.plant_additions}
                    onChange={(e) => setEditing({ ...editing, plant_additions: e.target.value })} />
                </div>
              </div>

              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Risk assessment rows
                  </Label>
                  <Button size="sm" variant="outline"
                    onClick={() => setEditing({ ...editing, risk_rows: [...editing.risk_rows, emptyRow()] })}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add row
                  </Button>
                </div>
                {editing.risk_rows.map((row, i) => {
                  const set = (idx: number, v: string) => {
                    const rows = editing.risk_rows.map((r) => [...r]);
                    rows[i][idx] = v;
                    if (idx === 3 || idx === 4) rows[i][5] = String(num(rows[i][3]) * num(rows[i][4]) || "");
                    if (idx === 7 || idx === 8) rows[i][9] = String(num(rows[i][7]) * num(rows[i][8]) || "");
                    setEditing({ ...editing, risk_rows: rows });
                  };
                  return (
                    <div key={i} className="rounded-lg border p-3 space-y-2">
                      <div className="grid sm:grid-cols-2 gap-2">
                        <Input placeholder="Activity" value={row[0] || ""} onChange={(e) => set(0, e.target.value)} className="text-sm" />
                        <Input placeholder="Hazard" value={row[1] || ""} onChange={(e) => set(1, e.target.value)} className="text-sm" />
                      </div>
                      <Textarea placeholder="Risks / persons at risk" rows={2} value={row[2] || ""}
                        onChange={(e) => set(2, e.target.value)} className="text-sm resize-none" />
                      <Textarea placeholder="Control measures" rows={3} value={row[6] || ""}
                        onChange={(e) => set(6, e.target.value)} className="text-sm resize-none" />
                      <div className="grid grid-cols-6 gap-2">
                        {[
                          ["Pre L", 3], ["Pre S", 4], ["Pre rating", 5],
                          ["Post L", 7], ["Post S", 8], ["Post rating", 9],
                        ].map(([label, idx]) => (
                          <div key={idx as number}>
                            <Label className="text-[10px]">{label as string}</Label>
                            <Input type="number" min={1} max={7} readOnly={idx === 5 || idx === 9}
                              value={row[idx as number] || ""} onChange={(e) => set(idx as number, e.target.value)}
                              className="mt-0.5 h-8 text-xs" />
                          </div>
                        ))}
                      </div>
                      <Button size="sm" variant="ghost"
                        onClick={() => setEditing({ ...editing, risk_rows: editing.risk_rows.filter((_, j) => j !== i) })}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive mr-1" /> Remove row
                      </Button>
                    </div>
                  );
                })}
              </div>

              <div>
                <Label className="text-xs">Reviewer note (internal)</Label>
                <Textarea className="mt-1 text-sm" rows={2} value={editing.review_note}
                  onChange={(e) => setEditing({ ...editing, review_note: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
