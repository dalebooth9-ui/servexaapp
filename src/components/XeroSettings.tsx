import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Link2, Unlink, RefreshCw, Download, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";

export default function XeroSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<{
    connected: boolean;
    tenant_name?: string;
    connected_at?: string;
    token_expired?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [importingContacts, setImportingContacts] = useState(false);
  const [syncingPayments, setSyncingPayments] = useState(false);

  const checkStatus = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("xero-auth", {
      body: null,
      method: "GET",
      headers: {},
    });
    // Use fetch directly since invoke doesn't support query params well
    const session = await supabase.auth.getSession();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xero-auth?action=status`,
      {
        headers: {
          Authorization: `Bearer ${session.data.session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      }
    );
    const result = await res.json();
    setStatus(result);
    setLoading(false);
  };

  useEffect(() => {
    checkStatus();

    // Handle OAuth callback params
    const xeroConnected = searchParams.get("xero_connected");
    const xeroError = searchParams.get("xero_error");
    const tenant = searchParams.get("tenant");

    if (xeroConnected === "true") {
      toast.success(`Connected to Xero${tenant ? ` (${tenant})` : ""}`);
      searchParams.delete("xero_connected");
      searchParams.delete("tenant");
      setSearchParams(searchParams, { replace: true });
      checkStatus();
    } else if (xeroError) {
      toast.error(`Xero connection failed: ${xeroError}`);
      searchParams.delete("xero_error");
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const session = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xero-auth?action=authorize`,
        {
          headers: {
            Authorization: `Bearer ${session.data.session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      const result = await res.json();
      if (result.url) {
        window.location.href = result.url;
      } else {
        toast.error("Failed to generate authorization URL");
      }
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
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xero-auth?action=disconnect`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.data.session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      const result = await res.json();
      if (result.success) {
        toast.success("Disconnected from Xero");
        await checkStatus();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  const handleImportContacts = async () => {
    setImportingContacts(true);
    try {
      const { data, error } = await supabase.functions.invoke("xero-sync", {
        body: { action: "import_contacts" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Imported ${data.imported} contacts (${data.skipped} already existed)`);
    } catch (err: any) {
      toast.error(err.message || "Failed to import contacts");
    } finally {
      setImportingContacts(false);
    }
  };

  const handleSyncPayments = async () => {
    setSyncingPayments(true);
    try {
      const { data, error } = await supabase.functions.invoke("xero-sync", {
        body: { action: "sync_payments" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Updated ${data.updated} invoice(s) from Xero (${data.checked} checked)`);
    } catch (err: any) {
      toast.error(err.message || "Failed to sync payments");
    } finally {
      setSyncingPayments(false);
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
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.5 14.5L7 13l1.41-1.41L10.5 13.67l5.09-5.09L17 10l-6.5 6.5z" />
          </svg>
          <CardTitle className="text-lg">Xero Accounting</CardTitle>
          {status?.connected && (
            <Badge variant="secondary" className="bg-accent/10 text-accent ml-2">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Connected
            </Badge>
          )}
        </div>
        <CardDescription>
          Sync invoices, contacts, and payment status with Xero.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.connected ? (
          <>
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Connected to: {status.tenant_name || "Xero Organisation"}</p>
              {status.token_expired && (
                <p className="text-destructive text-xs mt-1">Token expired — reconnect to refresh</p>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" size="sm" onClick={handleImportContacts} disabled={importingContacts}>
                {importingContacts ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                Import Contacts
              </Button>
              <Button variant="outline" size="sm" onClick={handleSyncPayments} disabled={syncingPayments}>
                {syncingPayments ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                Sync Payment Status
              </Button>
            </div>

            <Button variant="ghost" size="sm" className="text-destructive" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Unlink className="mr-1.5 h-4 w-4" />}
              Disconnect Xero
            </Button>
          </>
        ) : (
          <Button onClick={handleConnect} disabled={connecting}>
            {connecting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Link2 className="mr-1.5 h-4 w-4" />}
            Connect to Xero
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
