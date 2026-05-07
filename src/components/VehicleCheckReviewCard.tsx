import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Car, CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

type Row = {
  id: string;
  engineer_id: string;
  check_date: string;
  vehicle_reg: string | null;
  mileage: number | null;
  has_defects: boolean;
  defect_notes: string | null;
  defect_photo_urls: string[] | null;
  items: Record<string, "ok" | "defect"> | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  engineer_name?: string;
};

export default function VehicleCheckReviewCard() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("vehicle_checks")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    const list = (data || []) as Row[];
    const ids = Array.from(new Set(list.map((r) => r.engineer_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      const map = new Map((profs || []).map((p: any) => [p.user_id, p.full_name]));
      list.forEach((r) => (r.engineer_name = map.get(r.engineer_id) || "Engineer"));
    }
    setRows(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("vehicle-checks-review")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicle_checks" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const accept = async (row: Row) => {
    setBusy(true);
    const { error } = await supabase
      .from("vehicle_checks")
      .update({
        status: "accepted",
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: null,
      } as any)
      .eq("id", row.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Check accepted");
  };

  const reject = async () => {
    if (!rejecting) return;
    if (!reason.trim()) return toast.error("Please provide a reason");
    setBusy(true);
    const { error } = await supabase
      .from("vehicle_checks")
      .update({
        status: "rejected",
        rejection_reason: reason.trim(),
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      } as any)
      .eq("id", rejecting.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Check rejected — engineer notified");
    setRejecting(null);
    setReason("");
  };

  const signedPhoto = async (path: string) => {
    const { data } = await supabase.storage
      .from("vehicle-checks")
      .createSignedUrl(path, 3600);
    return data?.signedUrl;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Car className="h-5 w-5" />
          Vehicle checks awaiting review
          {rows.length > 0 && <Badge variant="destructive">{rows.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No checks awaiting review.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const defectCount = r.items
                ? Object.values(r.items).filter((v) => v === "defect").length
                : 0;
              return (
                <div key={r.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{r.engineer_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(r.created_at), "d MMM HH:mm")}
                        {r.vehicle_reg && ` · ${r.vehicle_reg}`}
                        {r.mileage != null && ` · ${r.mileage.toLocaleString()} mi`}
                      </p>
                    </div>
                    {r.has_defects && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {defectCount} defect{defectCount === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </div>
                  {r.defect_notes && (
                    <p className="text-sm bg-muted/50 rounded p-2">{r.defect_notes}</p>
                  )}
                  {r.defect_photo_urls && r.defect_photo_urls.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {r.defect_photo_urls.map((p, i) => (
                        <PhotoThumb key={i} path={p} loader={signedPhoto} />
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={() => accept(r)}
                      disabled={busy}
                      className="flex-1"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setRejecting(r);
                        setReason("");
                      }}
                      disabled={busy}
                      className="flex-1"
                    >
                      <XCircle className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject vehicle check</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The engineer will be blocked from accessing today's jobs until they resubmit.
          </p>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (e.g. missing photo, please re-check brakes)..."
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={reject} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject & notify"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PhotoThumb({ path, loader }: { path: string; loader: (p: string) => Promise<string | undefined> }) {
  const [url, setUrl] = useState<string | undefined>();
  useEffect(() => {
    loader(path).then(setUrl);
  }, [path, loader]);
  if (!url) return <div className="h-16 w-16 rounded bg-muted animate-pulse" />;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="" className="h-16 w-16 object-cover rounded border" />
    </a>
  );
}
