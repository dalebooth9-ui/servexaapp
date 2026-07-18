import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { Navigate } from "react-router-dom";
import { useOrgStatus } from "@/hooks/useOrgStatus";
import { PauseCircle, PlayCircle, Shield, History } from "lucide-react";
import InviteCodesCard from "@/components/platform/InviteCodesCard";

const PLATFORM_ORG_ID = "11111111-1111-1111-1111-111111111111";

type Row = {
  id: string;
  name: string;
  slug: string | null;
  plan: string | null;
  status: "active" | "suspended" | "cancelled";
  suspension_reason: string | null;
  suspension_message: string | null;
  suspended_at: string | null;
  created_at: string;
  user_count: number;
  job_count: number;
  last_activity: string;
};

type LogRow = {
  id: string;
  old_status: string | null;
  new_status: string;
  reason: string | null;
  message: string | null;
  source: string;
  changed_by: string | null;
  changed_at: string;
};

export default function PlatformOrganisations() {
  const { is_platform_admin, loading: statusLoading } = useOrgStatus();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [suspendTarget, setSuspendTarget] = useState<Row | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<LogRow[]>([]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("platform_list_organisations");
    if (error) {
      toast.error(error.message);
    } else {
      setRows((data ?? []) as Row[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (is_platform_admin) load();
  }, [is_platform_admin]);

  if (statusLoading) {
    return <div className="p-6 text-muted-foreground">Loading…</div>;
  }
  if (!is_platform_admin) {
    return <Navigate to="/" replace />;
  }

  const confirmSuspend = async () => {
    if (!suspendTarget) return;
    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("suspend_organisation", {
      _org_id: suspendTarget.id,
      _reason: reason.trim(),
      _message: message.trim() || null,
      _source: "manual",
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${suspendTarget.name} suspended`);
    setSuspendTarget(null);
    setReason("");
    setMessage("");
    load();
  };

  const doReactivate = async (row: Row) => {
    if (!confirm(`Reactivate ${row.name}?`)) return;
    const { error } = await supabase.rpc("reactivate_organisation", {
      _org_id: row.id,
      _source: "manual",
      _reason: null,
    });
    if (error) return toast.error(error.message);
    toast.success(`${row.name} reactivated`);
    load();
  };

  const openHistory = async (row: Row) => {
    setHistoryTarget(row);
    const { data } = await supabase
      .from("org_status_log")
      .select("*")
      .eq("org_id", row.id)
      .order("changed_at", { ascending: false });
    setLogs((data ?? []) as LogRow[]);
  };

  const statusBadge = (s: Row["status"]) => {
    if (s === "active") return <Badge variant="outline">Active</Badge>;
    if (s === "suspended") return <Badge variant="destructive">Suspended</Badge>;
    return <Badge variant="secondary">Cancelled</Badge>;
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold">Platform · Organisations</h1>
      </div>

      <InviteCodesCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All organisations ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Jobs</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last activity</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const isPlatform = r.id === PLATFORM_ORG_ID;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">{r.slug}</div>
                      </TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-sm">{r.plan ?? "—"}</TableCell>
                      <TableCell>{r.user_count}</TableCell>
                      <TableCell>{r.job_count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(r.created_at), "d MMM yyyy")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(r.last_activity), "d MMM yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openHistory(r)}
                          title="History"
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        {isPlatform ? (
                          <Badge variant="outline" className="text-xs">
                            Platform owner
                          </Badge>
                        ) : r.status === "active" ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setSuspendTarget(r)}
                          >
                            <PauseCircle className="h-4 w-4 mr-1" /> Suspend
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => doReactivate(r)}>
                            <PlayCircle className="h-4 w-4 mr-1" /> Reactivate
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Suspend dialog */}
      <Dialog
        open={!!suspendTarget}
        onOpenChange={(o) => {
          if (!o) {
            setSuspendTarget(null);
            setReason("");
            setMessage("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend {suspendTarget?.name}</DialogTitle>
            <DialogDescription>
              Users can still sign in but will see an "Account paused" screen. No data will be
              deleted. Reactivate at any time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="reason">Internal reason (required)</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. payment_failed / contract_terminated"
              />
            </div>
            <div>
              <Label htmlFor="message">Customer-facing message (optional)</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Shown on the paused screen. e.g. 'Payment failed — please contact billing to restore service.'"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmSuspend} disabled={busy}>
              Suspend organisation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={!!historyTarget} onOpenChange={(o) => !o && setHistoryTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Status history · {historyTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-2">
            {logs.length === 0 ? (
              <div className="text-sm text-muted-foreground">No status changes yet.</div>
            ) : (
              logs.map((l) => (
                <div key={l.id} className="rounded border p-3 text-sm">
                  <div className="flex justify-between">
                    <div>
                      <Badge variant="outline">{l.old_status ?? "—"}</Badge>{" "}
                      →{" "}
                      <Badge
                        variant={
                          l.new_status === "active"
                            ? "outline"
                            : l.new_status === "suspended"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {l.new_status}
                      </Badge>
                      <span className="ml-2 text-xs text-muted-foreground">
                        source: {l.source}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(l.changed_at), "d MMM yyyy HH:mm")}
                    </div>
                  </div>
                  {l.reason && (
                    <div className="mt-1 text-xs">
                      <span className="text-muted-foreground">Reason:</span> {l.reason}
                    </div>
                  )}
                  {l.message && (
                    <div className="mt-1 text-xs">
                      <span className="text-muted-foreground">Message:</span> {l.message}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
