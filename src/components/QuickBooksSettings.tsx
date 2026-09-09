import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Link2,
  Loader2,
  Package,
  RefreshCw,
  Unlink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";

type SyncAction = "import_contacts" | "pull_invoices" | "sync_payments" | "sync_products";

interface QbStatus {
  connected: boolean;
  company_name?: string | null;
  connected_at?: string | null;
  connection_error?: string | null;
  token_expired?: boolean;
}

interface SyncLogEntry {
  id: string;
  action: string;
  entity_type: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  connect: "Connected",
  disconnect: "Disconnected",
  token_refresh: "Sign-in refresh",
  sync_invoice: "Invoice sent",
  import_contacts: "Customers imported",
  pull_invoices: "Invoices pulled",
  sync_payments: "Payments checked",
  sync_products: "Products synced",
};

export default function QuickBooksSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<QbStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [running, setRunning] = useState<SyncAction | null>(null);
  const [log, setLog] = useState<SyncLogEntry[]>([]);

  const loadLog = useCallback(async () => {
    const { data } = await supabase
      .from("accounting_sync_log")
      .select("id, action, entity_type, status, error_message, created_at")
      .eq("provider", "quickbooks")
      .order("created_at", { ascending: false })
      .limit(5);
    setLog((data as SyncLogEntry[]) || []);
  }, []);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-auth?action=status`,
        {
          headers: {
            Authorization: `Bearer ${session.data.session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        },
      );
      setStatus(await res.json());
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
    loadLog();
  }, [loadLog]);

  useEffect(() => {
    checkStatus();

    const connected = searchParams.get("quickbooks_connected");
    const error = searchParams.get("quickbooks_error");
    const company = searchParams.get("company");

    if (connected === "true") {
      toast.success(`Connected to QuickBooks${company ? ` (${company})` : ""}`);
      searchParams.delete("quickbooks_connected");
      searchParams.delete("company");
      setSearchParams(searchParams, { replace: true });
      checkStatus();
    } else if (error) {
      toast.error(`QuickBooks connection failed: ${error}`);
      searchParams.delete("quickbooks_error");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const session = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-auth?action=authorize`,
        {
          headers: {
            Authorization: `Bearer ${session.data.session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        },
      );
      const result = await res.json();
      if (result.url) window.location.href = result.url;
      else toast.error(result.error || "Failed to start QuickBooks sign-in");
    } catch (err: any) {
      toast.error(err.message || "Failed to connect");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const session = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-auth?action=disconnect`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.data.session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        },
      );
      const result = await res.json();
      if (result.success) {
        toast.success("Disconnected from QuickBooks");
        await checkStatus();
      } else {
        toast.error(result.error || "Failed to disconnect");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  const runSync = async (action: SyncAction) => {
    setRunning(action);
    try {
      const { data, error } = await supabase.functions.invoke("quickbooks-sync", {
        body: { action },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (action === "import_contacts") {
        toast.success(`Imported ${data.imported} customers (${data.skipped} already existed)`);
      } else if (action === "pull_invoices") {
        toast.success(`Pulled from QuickBooks: ${data.created} new, ${data.updated} updated`);
      } else if (action === "sync_payments") {
        toast.success(`Updated ${data.updated} invoice(s) (${data.checked} checked)`);
      } else {
        const bits = [`${data.pulled} added`, `${data.pushed} sent to QuickBooks`];
        toast.success(`Products synced: ${bits.join(", ")}`);
        if (data.push_errors?.length) {
          toast.warning(`Some products could not be sent: ${data.push_errors[0]}`);
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Sync failed");
    } finally {
      setRunning(null);
      loadLog();
      checkStatus();
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          <CardTitle className="text-lg">QuickBooks Online</CardTitle>
          {status?.connected && (
            <Badge variant="secondary" className="bg-accent/10 text-accent ml-2">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Connected
            </Badge>
          )}
        </div>
        <CardDescription>
          Sync invoices, quotes, customers, payments and products with QuickBooks Online.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.connected ? (
          <>
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">
                Connected to: {status.company_name || "QuickBooks company"}
              </p>
              {status.connection_error && (
                <p className="text-destructive text-xs mt-1 flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  {status.connection_error}
                </p>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => runSync("import_contacts")}
                disabled={!!running}
              >
                {running === "import_contacts"
                  ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  : <Download className="mr-1.5 h-4 w-4" />}
                Import Contacts
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => runSync("sync_payments")}
                disabled={!!running}
              >
                {running === "sync_payments"
                  ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  : <RefreshCw className="mr-1.5 h-4 w-4" />}
                Sync Payments
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => runSync("pull_invoices")}
                disabled={!!running}
              >
                {running === "pull_invoices"
                  ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  : <Download className="mr-1.5 h-4 w-4" />}
                Pull Unpaid Invoices
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => runSync("sync_products")}
                disabled={!!running}
              >
                {running === "sync_products"
                  ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  : <Package className="mr-1.5 h-4 w-4" />}
                Sync Products
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Send an individual invoice or quote from its own page using “Send to QuickBooks”.
            </p>

            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium mb-2">Recent sync activity</p>
              {log.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing synced yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {log.map((entry) => (
                    <li key={entry.id} className="flex items-start justify-between gap-3 text-xs">
                      <span className="flex-1">
                        <span className="font-medium">
                          {ACTION_LABELS[entry.action] || entry.action}
                        </span>
                        {entry.status === "error" && entry.error_message && (
                          <span className="block text-destructive">{entry.error_message}</span>
                        )}
                      </span>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {new Date(entry.created_at).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting
                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                : <Unlink className="mr-1.5 h-4 w-4" />}
              Disconnect QuickBooks
            </Button>
          </>
        ) : (
          <Button onClick={handleConnect} disabled={connecting}>
            {connecting
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : <Link2 className="mr-1.5 h-4 w-4" />}
            Connect to QuickBooks
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
