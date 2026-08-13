import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useRamsLibrary, RamsLibraryItem } from "@/hooks/useRamsLibrary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Library, Plus, Trash2, Pencil, Archive, ArchiveRestore, ArrowLeft } from "lucide-react";
import { Link, Navigate } from "react-router-dom";

const BLOCK_TYPES = [
  { value: "working_at_height", label: "Working at height (ladders / MEWP)" },
  { value: "water_discharge", label: "Water discharge & drainage" },
  { value: "manual_handling", label: "Manual handling — riser equipment" },
  { value: "lone_working", label: "Lone working" },
  { value: "cosh", label: "COSHH — general" },
  { value: "electrical_isolation", label: "Electrical isolation" },
  { value: "public_areas", label: "Public areas / occupied buildings" },
  { value: "hot_works", label: "Hot works" },
  { value: "confined_space", label: "Confined space" },
  { value: "other", label: "Other" },
];

const WORK_TYPES = [
  "dry_riser", "wet_riser", "sprinkler", "fire_extinguisher", "fire_hydrant",
  "gas_suppression", "fire_alarm", "em_lighting", "hose_reels", "smoke_vents",
  "fire_doors", "kitchen_suppression", "pressure_test", "install", "remedial",
];

export default function RamsLibrary() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<"whole" | "block" | "hazard">("block");
  const libraryKind: "whole" | "block" = tab === "hazard" ? "block" : tab;
  const { items, loading, refetch } = useRamsLibrary({ kind: libraryKind, includeArchived: true });
  const [editing, setEditing] = useState<RamsLibraryItem | null>(null);
  const [creating, setCreating] = useState(false);

  if (userRole && userRole !== "admin") return <Navigate to="/" replace />;

  const handleArchive = async (item: RamsLibraryItem) => {
    const { error } = await supabase
      .from("rams_library_items" as any)
      .update({ archived: !item.archived } as any)
      .eq("id", item.id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    refetch();
  };

  const handleDelete = async (item: RamsLibraryItem) => {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("rams_library_items" as any).delete().eq("id", item.id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Deleted" });
    refetch();
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/settings"><ArrowLeft className="h-4 w-4 mr-1" /> Settings</Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Library className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg">RAMS Library</CardTitle>
                <CardDescription>
                  Reusable RAMS templates and content blocks — used as a starting point for new
                  RAMS and composed into AI Auto-Fill output for consistent, vetted wording.
                </CardDescription>
              </div>
            </div>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 mr-1" /> New {tab === "whole" ? "template" : "block"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList>
              <TabsTrigger value="block">Content blocks</TabsTrigger>
              <TabsTrigger value="whole">Whole RAMS templates</TabsTrigger>
            </TabsList>
            <TabsContent value={tab} className="mt-4">
              {loading ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
              ) : items.length === 0 ? (
                <div className="rounded-md border border-dashed p-8 text-center">
                  <p className="text-sm font-medium">No {tab === "whole" ? "templates" : "blocks"} yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {tab === "block"
                      ? "Add reusable hazard / control sections engineers can insert into any RAMS."
                      : "Save completed RAMS as templates for future jobs."}
                  </p>
                </div>
              ) : (
                <div className="divide-y border rounded-md">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{item.name}</p>
                          {item.archived && <Badge variant="secondary">Archived</Badge>}
                          {item.block_type && <Badge variant="outline" className="text-[10px]">{item.block_type}</Badge>}
                          {item.work_types?.map((w) => (
                            <Badge key={w} variant="secondary" className="text-[10px]">{w}</Badge>
                          ))}
                        </div>
                        {item.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleArchive(item)}>
                          {item.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(item)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {(editing || creating) && (
        <LibraryItemDialog
          kind={tab}
          item={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); refetch(); }}
        />
      )}
    </div>
  );
}

function LibraryItemDialog({
  kind, item, onClose, onSaved,
}: { kind: "whole" | "block"; item: RamsLibraryItem | null; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(item?.name || "");
  const [description, setDescription] = useState(item?.description || "");
  const [blockType, setBlockType] = useState(item?.block_type || "");
  const [workTypes, setWorkTypes] = useState<string[]>(item?.work_types || []);
  const [hazards, setHazards] = useState(((item?.payload?.hazards as string[]) || []).join("\n"));
  const [controls, setControls] = useState(((item?.payload?.controls as string[]) || []).join("\n"));
  const [method, setMethod] = useState(((item?.payload?.method_steps as string[]) || []).join("\n"));
  const [ppe, setPpe] = useState(((item?.payload?.ppe as string[]) || []).join(", "));
  const [saving, setSaving] = useState(false);

  const toggleWt = (w: string) =>
    setWorkTypes((cur) => (cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w]));

  const save = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    try {
      const { data: prof } = await supabase.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
      const orgId = (prof as any)?.org_id;
      if (!orgId) throw new Error("Missing organisation");

      const payload = kind === "block" ? {
        hazards: hazards.split("\n").map((s) => s.trim()).filter(Boolean),
        controls: controls.split("\n").map((s) => s.trim()).filter(Boolean),
        method_steps: method.split("\n").map((s) => s.trim()).filter(Boolean),
        ppe: ppe.split(",").map((s) => s.trim()).filter(Boolean),
      } : item?.payload || {};

      const row = {
        org_id: orgId,
        kind,
        name: name.trim(),
        description: description.trim() || null,
        block_type: kind === "block" ? (blockType || null) : null,
        work_types: workTypes,
        payload,
      };

      if (item) {
        const { error } = await supabase.from("rams_library_items" as any).update(row as any).eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rams_library_items" as any).insert({ ...row, created_by: user.id } as any);
        if (error) throw error;
      }
      toast({ title: item ? "Updated" : "Created" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit" : "New"} {kind === "whole" ? "RAMS template" : "content block"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. "Working at height — ladders"' />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          {kind === "block" && (
            <div>
              <Label>Block type</Label>
              <select value={blockType} onChange={(e) => setBlockType(e.target.value)} className="w-full h-9 rounded-md border bg-background px-2 text-sm">
                <option value="">Uncategorised</option>
                {BLOCK_TYPES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <Label>Applies to work types <span className="text-xs text-muted-foreground">(leave empty for all)</span></Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {WORK_TYPES.map((w) => (
                <Badge key={w} variant={workTypes.includes(w) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleWt(w)}>
                  {w}
                </Badge>
              ))}
            </div>
          </div>
          {kind === "block" && (
            <>
              <div>
                <Label>Hazards <span className="text-xs text-muted-foreground">(one per line)</span></Label>
                <Textarea value={hazards} onChange={(e) => setHazards(e.target.value)} rows={4} />
              </div>
              <div>
                <Label>Control measures <span className="text-xs text-muted-foreground">(one per line)</span></Label>
                <Textarea value={controls} onChange={(e) => setControls(e.target.value)} rows={4} />
              </div>
              <div>
                <Label>Method steps <span className="text-xs text-muted-foreground">(one per line)</span></Label>
                <Textarea value={method} onChange={(e) => setMethod(e.target.value)} rows={4} />
              </div>
              <div>
                <Label>PPE <span className="text-xs text-muted-foreground">(comma-separated)</span></Label>
                <Input value={ppe} onChange={(e) => setPpe(e.target.value)} placeholder="Hard hat, gloves, hi-vis" />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
