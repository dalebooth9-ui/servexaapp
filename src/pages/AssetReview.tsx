import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ClipboardCheck } from "lucide-react";

interface Flag {
  id: string; asset_id: string | null; site_id: string | null; job_id: string | null; field: string;
  old_value: string | null; new_value: string | null; reason: string | null; created_at: string;
  assets: { asset_tag: string | null; riser_location: string | null; name: string; sites: { name: string } | null } | null;
  sites: { name: string } | null;
  jobs: { reference_number: string | null } | null;
}

const FIELD_LABEL: Record<string, string> = {
  outlets_count: "Outlets",
  riser_location: "Riser location",
  riser_location_missing: "No riser location on report",
  sync_error: "Register update failed",
};
/** Fields where "Use new value" writes straight onto the asset. */
const EDITABLE = new Set(["outlets_count", "riser_location", "status", "notes"]);

export default function AssetReview() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [editing, setEditing] = useState<Flag | null>(null);
  const [editValue, setEditValue] = useState("");

  const load = async () => {
    const { data, error } = await supabase.from("asset_review_flags")
      .select("id, asset_id, site_id, job_id, field, old_value, new_value, reason, created_at, assets(asset_tag, riser_location, name, sites(name)), sites(name), jobs(reference_number)")
      .eq("status", "open").order("created_at", { ascending: false }).limit(1000);
    if (error) toast({ title: "Couldn't load review flags", description: error.message, variant: "destructive" });
    setFlags((data as any) || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const resolve = async (f: Flag, status: "accepted" | "rejected", value?: string | null) => {
    if (value !== undefined && f.asset_id && EDITABLE.has(f.field)) {
      const v = f.field === "outlets_count" ? (value === null || value === "" ? null : parseInt(value, 10)) : value;
      if (f.field === "outlets_count" && v !== null && (isNaN(v as number) || (v as number) < 0)) {
        toast({ title: "Outlets must be a whole number", variant: "destructive" }); return false;
      }
      const { error } = await supabase.from("assets").update({ [f.field]: v, updated_at: new Date().toISOString() } as any).eq("id", f.asset_id);
      if (error) { toast({ title: "Asset not updated", description: error.message, variant: "destructive" }); return false; }
    }
    const { error } = await supabase.from("asset_review_flags").update({ status, resolved_at: new Date().toISOString(), resolved_by: user?.id ?? null }).eq("id", f.id);
    if (error) { toast({ title: "Couldn't close the flag", description: error.message, variant: "destructive" }); return false; }
    setFlags((prev) => prev?.filter((x) => x.id !== f.id) ?? null);
    window.dispatchEvent(new Event("asset-review:changed"));
    return true;
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ClipboardCheck className="h-6 w-6" /> Asset review</h1>
        <p className="text-sm text-muted-foreground">Differences found by reports that need an office decision before the asset register changes.</p>
      </div>
      <Card><CardContent className="p-0 overflow-auto">
        {!flags ? <div className="flex items-center gap-2 p-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div> : flags.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nothing to review.</p>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Asset</TableHead><TableHead>Site</TableHead><TableHead>Field</TableHead>
              <TableHead>Current value</TableHead><TableHead>New value</TableHead><TableHead>Job</TableHead><TableHead className="text-right">Action</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {flags.map((f) => {
                const canApply = !!f.asset_id && EDITABLE.has(f.field);
                return (
                  <TableRow key={f.id}>
                    <TableCell>{f.asset_id ? <Link to={`/assets/${f.asset_id}`} className="text-primary hover:underline">{f.assets?.riser_location || f.assets?.name || "Asset"}{f.assets?.asset_tag ? ` (${f.assets.asset_tag})` : ""}</Link> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-sm">{f.assets?.sites?.name || f.sites?.name || "—"}</TableCell>
                    <TableCell><Badge variant={f.field === "sync_error" ? "destructive" : "secondary"}>{FIELD_LABEL[f.field] || f.field}</Badge>{f.reason && <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">{f.reason}</p>}</TableCell>
                    <TableCell className="text-sm">{f.old_value ?? "—"}</TableCell>
                    <TableCell className="text-sm max-w-[260px] break-words">{f.new_value ?? "—"}</TableCell>
                    <TableCell className="text-sm">{f.job_id ? <Link to={`/jobs/${f.job_id}`} className="text-primary hover:underline">{f.jobs?.reference_number || "Job"}</Link> : "—"}</TableCell>
                    <TableCell className="text-right whitespace-nowrap space-x-1">
                      {canApply && <Button size="sm" onClick={() => resolve(f, "accepted", f.new_value)}>Use new value</Button>}
                      <Button size="sm" variant="outline" onClick={() => resolve(f, "rejected")}>{canApply ? "Keep current" : "Dismiss"}</Button>
                      {canApply && <Button size="sm" variant="ghost" onClick={() => { setEditing(f); setEditValue(f.new_value ?? ""); }}>Edit</Button>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set {editing ? (FIELD_LABEL[editing.field] || editing.field).toLowerCase() : ""}</DialogTitle></DialogHeader>
          <Input type={editing?.field === "outlets_count" ? "number" : "text"} min={0} value={editValue} onChange={(e) => setEditValue(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={async () => { if (editing && (await resolve(editing, "accepted", editValue))) setEditing(null); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
