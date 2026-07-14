import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Plus, Camera, ShieldAlert, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";

type Defect = {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  category: string | null;
  photos: string[] | null;
  location_on_site: string | null;
  bs_standard_reference: string | null;
  quote_id: string | null;
  created_at: string;
  reported_by: string;
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/15 text-yellow-800 dark:text-yellow-400 border-yellow-500/30",
  low: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

const STATUS_BADGE: Record<string, string> = {
  open: "bg-red-500/15 text-red-700 dark:text-red-400",
  in_progress: "bg-yellow-500/15 text-yellow-800 dark:text-yellow-400",
  resolved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  deferred: "bg-muted text-muted-foreground",
  quoted: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  approved: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
  job_created: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
  declined: "bg-muted text-muted-foreground line-through",
};

const CATEGORIES = [
  { value: "fire_alarm", label: "Fire Alarm" },
  { value: "emergency_lighting", label: "Emergency Lighting" },
  { value: "extinguisher", label: "Extinguisher" },
  { value: "sprinkler", label: "Sprinkler" },
  { value: "dry_riser", label: "Dry Riser" },
  { value: "suppression", label: "Suppression" },
  { value: "passive_fire", label: "Passive Fire" },
  { value: "other", label: "Other" },
];

interface JobDefectsProps {
  jobId: string;
  siteId: string | null;
}

export default function JobDefects({ jobId, siteId }: JobDefectsProps) {
  const { user } = useAuth();
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    severity: "medium",
    category: "other",
    location_on_site: "",
    bs_standard_reference: "",
  });

  const fetchDefects = async () => {
    const { data } = await supabase
      .from("defects")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    setDefects((data || []) as any);
    setLoading(false);
  };

  useEffect(() => {
    fetchDefects();
  }, [jobId]);

  const uploadPhotos = async (defectId: string, files: File[]) => {
    const urls: string[] = [];
    for (const file of files) {
      const path = `defects/${defectId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("submissions").upload(await buildOrgPathAsync(path), file);
      if (error) { toast.error(`Photo upload failed: ${file.name}`); continue; }
      urls.push(supabase.storage.from("submissions").getPublicUrl(path).data.publicUrl);
    }
    return urls;
  };

  const handleCreate = async () => {
    if (!form.title.trim() || !user) return;
    setCreating(true);
    const { data: inserted, error } = await supabase.from("defects").insert({
      title: form.title.trim(),
      description: form.description || null,
      severity: form.severity,
      category: form.category,
      location_on_site: form.location_on_site || null,
      bs_standard_reference: form.bs_standard_reference || null,
      job_id: jobId,
      site_id: siteId,
      reported_by: user.id,
    } as any).select("id").single();

    if (error || !inserted) {
      toast.error("Failed to log defect. Please try again.");
      setCreating(false);
      return;
    }

    if (pendingPhotos.length > 0) {
      const urls = await uploadPhotos(inserted.id, pendingPhotos);
      if (urls.length) await supabase.from("defects").update({ photos: urls } as any).eq("id", inserted.id);
    }

    toast.success("Defect logged");
    setOpen(false);
    setForm({ title: "", description: "", severity: "medium", category: "other", location_on_site: "", bs_standard_reference: "" });
    setPendingPhotos([]);
    setCreating(false);
    fetchDefects();
  };

  const openCount = defects.filter(d => d.status === "open").length;

  return (
    <Collapsible defaultOpen className="mb-6">
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card border px-4 py-3 text-left font-semibold hover:bg-muted transition-colors">
        <span className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-orange-500" />
          Defects ({defects.length}{openCount > 0 ? ` · ${openCount} open` : ""})
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 space-y-3">
        <div className="flex justify-between items-center">
          <p className="text-xs text-muted-foreground">Track deficiencies found on this job. Logged defects appear in the global Defects page for batch quoting.</p>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Log Defect
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : defects.length === 0 ? (
          <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">No defects logged on this job.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {defects.map(d => {
              const photos = (d.photos as string[] | null) || [];
              return (
                <Card key={d.id}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{d.title}</p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          <Badge variant="outline" className={SEVERITY_BADGE[d.severity] || ""}>{d.severity}</Badge>
                          <Badge variant="outline" className={STATUS_BADGE[d.status] || ""}>{d.status.replace("_", " ")}</Badge>
                          {d.category && <Badge variant="outline" className="text-[10px] capitalize">{d.category.replace("_", " ")}</Badge>}
                          {d.location_on_site && <span className="text-[10px] text-muted-foreground self-center">{d.location_on_site}</span>}
                        </div>
                        {d.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{d.description}</p>}
                        {d.bs_standard_reference && (
                          <p className="text-[10px] text-muted-foreground mt-1 italic">{d.bs_standard_reference}</p>
                        )}
                      </div>
                      <Link to={`/defects?focus=${d.id}`} className="text-muted-foreground hover:text-foreground" title="View in Defects">
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </div>
                    {photos.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap">
                        {photos.slice(0, 4).map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img src={url} alt={`Defect photo ${i + 1}`} className="h-14 w-14 object-cover rounded border" />
                          </a>
                        ))}
                        {photos.length > 4 && <span className="text-xs text-muted-foreground self-center">+{photos.length - 4} more</span>}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground">{format(new Date(d.created_at), "dd MMM yyyy HH:mm")}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-orange-500" /> Log Defect</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Title *</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Fire alarm panel showing fault" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Severity</Label>
                  <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical"><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-2" />Critical</SelectItem>
                      <SelectItem value="high"><span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-2" />High</SelectItem>
                      <SelectItem value="medium"><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-2" />Medium</SelectItem>
                      <SelectItem value="low"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-2" />Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Location on site</Label>
                <Input value={form.location_on_site} onChange={e => setForm(f => ({ ...f, location_on_site: e.target.value }))} placeholder="e.g. 3rd floor, corridor B" />
              </div>
              <div>
                <Label>BS standard reference <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input value={form.bs_standard_reference} onChange={e => setForm(f => ({ ...f, bs_standard_reference: e.target.value }))} placeholder="e.g. BS 5839-1 clause 26.2d" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <Label>Photos</Label>
                <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" className="hidden"
                  onChange={e => { setPendingPhotos(p => [...p, ...Array.from(e.target.files || [])]); if (fileRef.current) fileRef.current.value = ""; }} />
                <div className="flex flex-wrap gap-2 mt-1.5">
                  <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                    <Camera className="h-4 w-4 mr-1.5" /> Add photos
                  </Button>
                  {pendingPhotos.map((f, i) => (
                    <span key={i} className="text-xs bg-muted rounded px-2 py-1 inline-flex items-center gap-1">
                      {f.name.slice(0, 20)}
                      <button onClick={() => setPendingPhotos(p => p.filter((_, idx) => idx !== i))}><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={creating || !form.title.trim()}>{creating ? "Logging…" : "Log Defect"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CollapsibleContent>
    </Collapsible>
  );
}
