import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Link as LinkIcon, Copy, Loader2, Flame } from "lucide-react";
import { format } from "date-fns";

const ENTRY_TYPES = [
  { value: "inspection", label: "Inspection" },
  { value: "test", label: "Test" },
  { value: "fault", label: "Fault" },
  { value: "repair", label: "Repair" },
  { value: "false_alarm", label: "False alarm" },
  { value: "evacuation_drill", label: "Evacuation drill" },
  { value: "maintenance", label: "Maintenance" },
  { value: "other", label: "Other" },
] as const;

const TYPE_BADGE: Record<string, string> = {
  inspection: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  test: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  fault: "bg-red-500/15 text-red-400 border-red-500/30",
  repair: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  false_alarm: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  evacuation_drill: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  maintenance: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  other: "bg-muted text-muted-foreground border-border",
};

interface Entry {
  id: string;
  entry_type: string;
  title: string;
  description: string | null;
  date_of_event: string;
  recorded_by: string | null;
  bs_standard: string | null;
  linked_job_id: string | null;
  created_at: string;
}

interface TokenRow {
  id: string;
  token: string;
  is_active: boolean;
}

interface SiteFireLogProps {
  siteId: string;
  siteName: string;
}

export default function SiteFireLog({ siteId, siteName }: SiteFireLogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    entry_type: "other",
    title: "",
    description: "",
    date_of_event: format(new Date(), "yyyy-MM-dd"),
    recorded_by: "",
    bs_standard: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: ents }, { data: toks }] = await Promise.all([
      supabase
        .from("fire_log_entries" as any)
        .select("*")
        .eq("site_id", siteId)
        .order("date_of_event", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("fire_log_tokens" as any)
        .select("id, token, is_active")
        .eq("site_id", siteId)
        .order("created_at", { ascending: false }),
    ]);
    setEntries((ents as any) || []);
    setTokens((toks as any) || []);
    setLoading(false);
  }, [siteId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!form.title.trim() || !user) return;
    setSaving(true);
    const { error } = await supabase.from("fire_log_entries" as any).insert({
      site_id: siteId,
      entry_type: form.entry_type,
      title: form.title.trim(),
      description: form.description.trim() || null,
      date_of_event: form.date_of_event,
      recorded_by: form.recorded_by.trim() || null,
      bs_standard: form.bs_standard.trim() || null,
      created_by: user.id,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Failed to add entry", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Entry added" });
    setAddOpen(false);
    setForm({
      entry_type: "other",
      title: "",
      description: "",
      date_of_event: format(new Date(), "yyyy-MM-dd"),
      recorded_by: "",
      bs_standard: "",
    });
    load();
  };

  const generateToken = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("fire_log_tokens" as any)
      .insert({ site_id: siteId, created_by: user.id });
    if (error) {
      toast({ title: "Failed to create link", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Customer link created" });
    load();
  };

  const toggleToken = async (id: string, active: boolean) => {
    const { error } = await supabase
      .from("fire_log_tokens" as any)
      .update({ is_active: active })
      .eq("id", id);
    if (error) {
      toast({ title: "Failed to update link", variant: "destructive" });
      return;
    }
    setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, is_active: active } : t)));
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/fire-log/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied", description: url });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          <div>
            <h3 className="text-base font-semibold">Fire Log</h3>
            <p className="text-xs text-muted-foreground">{siteName}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={generateToken}>
            <LinkIcon className="mr-2 h-3.5 w-3.5" /> Generate customer link
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> Add entry
          </Button>
        </div>
      </div>

      {tokens.length > 0 && (
        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Customer links</p>
          {tokens.map((t) => (
            <div key={t.id} className="flex items-center gap-2 text-sm">
              <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs">
                {window.location.origin}/fire-log/{t.token}
              </code>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyLink(t.token)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <div className="flex items-center gap-1.5">
                <Switch checked={t.is_active} onCheckedChange={(v) => toggleToken(t.id, v)} />
                <span className="text-xs text-muted-foreground w-14">{t.is_active ? "Active" : "Disabled"}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          No fire log entries yet. Completed fire-related jobs will appear here automatically.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <div key={e.id} className="rounded-md border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge variant="outline" className={TYPE_BADGE[e.entry_type] || TYPE_BADGE.other}>
                      {ENTRY_TYPES.find((t) => t.value === e.entry_type)?.label || e.entry_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(e.date_of_event), "d MMM yyyy")}
                    </span>
                    {e.bs_standard && (
                      <span className="text-xs font-medium text-muted-foreground">{e.bs_standard}</span>
                    )}
                  </div>
                  <p className="font-medium text-sm">{e.title}</p>
                  {e.description && (
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{e.description}</p>
                  )}
                  {e.recorded_by && (
                    <p className="text-xs text-muted-foreground mt-2">Recorded by {e.recorded_by}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add fire log entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-medium">Type</label>
              <Select value={form.entry_type} onValueChange={(v) => setForm((f) => ({ ...f, entry_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENTRY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">Title</label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Weekly call point test" />
            </div>
            <div>
              <label className="text-xs font-medium">Description</label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium">Date</label>
                <Input type="date" value={form.date_of_event} onChange={(e) => setForm((f) => ({ ...f, date_of_event: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium">BS standard</label>
                <Input value={form.bs_standard} onChange={(e) => setForm((f) => ({ ...f, bs_standard: e.target.value }))} placeholder="BS 5839-1" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Recorded by</label>
              <Input value={form.recorded_by} onChange={(e) => setForm((f) => ({ ...f, recorded_by: e.target.value }))} placeholder="Name" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || !form.title.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
