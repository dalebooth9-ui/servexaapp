import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";

type Found = {
  id: string; asset_tag: string; riser_location: string | null; outlets_count: number | null; status: string;
  last_inspection_at: string | null; last_inspection_type: string | null; last_inspection_result: string | null;
  label_status: string; site_id: string | null; site_name: string | null; site_address: string | null;
  customer_id: string | null; customer_name: string | null; open_defects: number;
};

const cleanTag = (t: string | undefined) => (t || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

/** Sticker scan page. Signed out (or customer portal users) see only the ID. */
export default function RiserScan() {
  const { tag: rawTag } = useParams();
  const tag = cleanTag(rawTag);
  const { user, userRole, loading } = useAuth();
  const navigate = useNavigate();
  const [asset, setAsset] = useState<Found | null | undefined>(undefined);
  const [defects, setDefects] = useState<{ id: string; title: string; severity: string | null }[]>([]);
  const [wrongOpen, setWrongOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const isStaff = !!user && userRole !== "customer_user";

  useEffect(() => {
    if (!isStaff || !tag) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("lookup_asset_by_tag", { _tag: tag });
      if (cancelled) return;
      const row = !error && Array.isArray(data) ? (data[0] as Found | undefined) : undefined;
      setAsset(row ?? null);
      if (row && row.open_defects > 0) {
        const { data: d } = await supabase.from("defects").select("id, title, severity")
          .eq("asset_id", row.id).neq("status", "resolved").order("created_at", { ascending: false }).limit(20);
        if (!cancelled) setDefects((d as any) || []);
      }
    })();
    return () => { cancelled = true; };
  }, [isStaff, tag]);

  if (loading) return <Shell><p className="text-muted-foreground">Loading…</p></Shell>;

  if (!isStaff) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground uppercase tracking-wide">Riser ID</p>
        <p className="text-4xl font-bold font-mono tracking-widest">{tag}</p>
        {!user && (
          <Button className="mt-6" onClick={() => navigate(`/auth?next=${encodeURIComponent(`/r/${tag}`)}`)}>Staff login</Button>
        )}
      </Shell>
    );
  }

  if (asset === undefined) return <Shell><p className="text-muted-foreground">Looking up sticker…</p></Shell>;

  if (asset === null) {
    return (
      <Shell>
        <p className="text-2xl font-bold">Sticker not found</p>
        <p className="text-sm text-muted-foreground mt-1 font-mono">{tag}</p>
        <Button asChild variant="outline" className="mt-6"><Link to="/">Go to dashboard</Link></Button>
      </Shell>
    );
  }

  const labelFitted = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("mark_asset_label_placed", { _asset_id: asset.id });
    setBusy(false);
    if (error) { toast.error("Couldn't save – label not marked as fitted"); return; }
    setAsset({ ...asset, label_status: "placed" });
    toast.success("Label fitted");
  };

  const wrongRiser = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("report_wrong_riser", { _asset_id: asset.id, _note: note });
    setBusy(false);
    if (error) { toast.error("Couldn't send – please try again"); return; }
    setWrongOpen(false); setNote("");
    toast.success("Office told – sent to Asset review");
  };

  const startService = async () => {
    if (!asset.site_id) { toast.error("This riser isn't linked to a site"); return; }
    setBusy(true);
    const { data, error } = await supabase.from("jobs").insert({
      name: `Dry riser service – ${asset.riser_location || asset.asset_tag}`,
      category: "dry_riser_service",
      priority: "medium",
      status: "active",
      site_id: asset.site_id,
      address: asset.site_address,
      customer_id: asset.customer_id,
      customer: asset.customer_name,
      asset_id: asset.id,
      created_by: user!.id,
    } as any).select("id").single();
    setBusy(false);
    if (error || !data) { toast.error("Couldn't start the job: " + (error?.message || "unknown error")); return; }
    toast.success("Job created");
    navigate(`/jobs/${data.id}`);
  };

  return (
    <Shell wide>
      <p className="text-xs text-muted-foreground font-mono">Riser ID {asset.asset_tag}</p>
      <h1 className="text-3xl font-bold leading-tight">{asset.riser_location || "Unnamed riser"}</h1>
      <p className="text-base mt-1">{asset.site_name || "No site"}</p>
      <div className="grid grid-cols-2 gap-3 mt-4 text-left text-sm">
        <Info label="Outlets" value={asset.outlets_count ?? "—"} />
        <Info label="Status" value={asset.status} />
        <Info label="Last inspection" value={asset.last_inspection_at
          ? `${format(new Date(asset.last_inspection_at), "dd/MM/yyyy")}${asset.last_inspection_type ? ` · ${asset.last_inspection_type}` : ""}${asset.last_inspection_result ? ` · ${asset.last_inspection_result}` : ""}`
          : "None recorded"} />
        <Info label="Sticker" value={asset.label_status} />
      </div>
      <div className="mt-4 text-left">
        <p className="text-sm font-semibold">Open defects ({asset.open_defects})</p>
        {defects.length > 0 && (
          <ul className="mt-1 text-sm list-disc pl-5">
            {defects.map((d) => <li key={d.id}>{d.title}{d.severity ? ` (${d.severity})` : ""}</li>)}
          </ul>
        )}
      </div>
      <div className="mt-6 flex flex-col gap-2">
        {asset.label_status !== "placed" && <Button size="lg" onClick={labelFitted} disabled={busy}>Label fitted</Button>}
        <Button size="lg" variant="outline" onClick={() => setWrongOpen(true)} disabled={busy}>Wrong riser</Button>
        <Button size="lg" variant="secondary" onClick={startService} disabled={busy}>Start service</Button>
      </div>
      <Dialog open={wrongOpen} onOpenChange={setWrongOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Wrong riser</DialogTitle></DialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's wrong? e.g. this sticker is on the east stairwell riser" />
          <DialogFooter><Button onClick={wrongRiser} disabled={busy}>Send to office</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className={`w-full ${wide ? "max-w-md" : "max-w-sm"}`}>
        <CardContent className="p-6 text-center">{children}</CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium capitalize-first">{value}</p>
    </div>
  );
}
