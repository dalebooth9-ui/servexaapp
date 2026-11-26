import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trash2, Plus, CalendarCog } from "lucide-react";
import { usePlannerConfig } from "@/hooks/usePlannerConfig";
import { PLANNER_FEATURES, DEFAULT_JOB_TAGS, newTagKey, tagChipStyle, type JobTagDef, type PlannerConfig } from "@/lib/plannerConfig";
import { plainError } from "@/lib/plainError";

/** Settings › Planner features: per-company switches and the company's own job tags. Admin only (RLS enforces). */
export default function PlannerFeaturesCard() {
  const { config, loaded, save, canChange } = usePlannerConfig();
  const [tags, setTags] = useState<JobTagDef[]>(config.tags);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (loaded) setTags(config.tags); }, [loaded, JSON.stringify(config.tags)]);

  const persist = async (next: PlannerConfig, ok: string) => {
    setSaving(true);
    try { await save(next); toast.success(ok); } catch (e) { toast.error("Not saved", { description: plainError(e) }); }
    finally { setSaving(false); }
  };
  const setTag = (i: number, patch: Partial<JobTagDef>) => setTags((t) => t.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const tagsDirty = JSON.stringify(tags) !== JSON.stringify(config.tags);
  const validTags = tags.every((t) => t.label.trim());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CalendarCog className="h-5 w-5" />Planner features</CardTitle>
        <CardDescription>Switch off anything your company doesn't use. Switched-off features disappear from menus, forms and the Today screen; nothing saved is deleted.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="divide-y rounded-md border">
          {PLANNER_FEATURES.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0"><Label htmlFor={`pf-${f.key}`} className="font-medium">{f.label}</Label><p className="text-xs text-muted-foreground">{f.description}</p></div>
              <Switch id={`pf-${f.key}`} checked={config.features[f.key]} disabled={!canChange || saving || !loaded}
                onCheckedChange={(v) => persist({ ...config, features: { ...config.features, [f.key]: v } }, `${f.label} ${v ? "on" : "off"}`)} />
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Job tags</h3>
          <p className="text-xs text-muted-foreground">Rename, recolour, add or remove tags. Tick "Highlight on printed sheet" to shade those jobs pink on the weekly sheet. Removing a tag hides it; jobs keep it in case you add it back.</p>
          {tags.map((t, i) => (
            <div key={t.key} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
              <input type="color" aria-label={`Colour for ${t.label || "tag"}`} value={t.color} disabled={!canChange} onChange={(e) => setTag(i, { color: e.target.value })} className="h-8 w-10 cursor-pointer rounded border bg-background" />
              <Input aria-label="Tag name" value={t.label} disabled={!canChange} onChange={(e) => setTag(i, { label: e.target.value })} className="h-8 w-44 flex-1 min-w-[8rem]" />
              <span style={tagChipStyle(t.color)} className="rounded border px-1.5 text-[10px] font-semibold leading-5">{t.label || "Tag"}</span>
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={t.highlight} disabled={!canChange} onChange={(e) => setTag(i, { highlight: e.target.checked })} />Highlight on printed sheet</label>
              <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Remove ${t.label}`} disabled={!canChange} onClick={() => setTags((x) => x.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          {canChange && <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setTags((x) => [...x, { key: newTagKey(`tag ${x.length + 1}`, x), label: "New tag", color: "#64748b", highlight: false }])}><Plus className="mr-1 h-4 w-4" />Add tag</Button>
            <Button size="sm" variant="ghost" onClick={() => setTags(DEFAULT_JOB_TAGS.map((t) => ({ ...t })))}>Reset to starter set</Button>
            <Button size="sm" disabled={!tagsDirty || !validTags || saving} onClick={() => persist({ ...config, tags: tags.map((t) => ({ ...t, label: t.label.trim() })) }, "Tags saved")}>Save tags</Button>
          </div>}
        </div>
      </CardContent>
    </Card>
  );
}
