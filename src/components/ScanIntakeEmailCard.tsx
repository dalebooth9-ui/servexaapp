import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScanLine, Copy, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function ScanIntakeEmailCard() {
  const [scanEmail, setScanEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: orgId, error: orgIdErr } = await supabase.rpc("get_user_org_id");
      if (orgIdErr) { setError(orgIdErr.message); setLoading(false); return; }
      if (!orgId) { setLoading(false); return; }
      const { data, error: qErr } = await supabase
        .from("organisations")
        .select("scan_intake_email")
        .eq("id", orgId as string)
        .maybeSingle();
      if (qErr) setError(qErr.message);
      else setScanEmail(((data as any)?.scan_intake_email as string) ?? null);
      setLoading(false);
    })();
  }, []);

  const copy = () => {
    if (!scanEmail) return;
    navigator.clipboard.writeText(scanEmail);
    setCopied(true);
    toast.success("Scan intake email copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-primary" />
          Scan paper reports here
        </CardTitle>
        <CardDescription>
          Set your office scanner/printer's "scan to email" destination to this address. Servexa
          batches every attachment into the Review tab under Paper scans for template matching and review.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="h-10 rounded-md bg-muted animate-pulse" />
        ) : error ? (
          <p className="text-sm text-destructive">Couldn't load scan intake email: {error}</p>
        ) : scanEmail ? (
          <div className="flex gap-2">
            <Input value={scanEmail} readOnly className="font-mono text-sm" />
            <Button variant="outline" size="icon" onClick={copy} aria-label="Copy scan intake email">
              {copied ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No scan intake email configured yet.</p>
        )}

        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">How it works</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Scan the completed paper job sheets on your office multifunction and send to this address.</li>
            <li>Each attachment (PDF or image) becomes one sheet in a new batch under Paper scans → Review.</li>
            <li>An admin reviews matched jobs / templates and confirms — the original scans stay attached.</li>
          </ol>
          <p className="pt-1">
            This address is unique to your organisation. Attachments must be PDF or image files.
            Inbound is capped at 30 emails per hour per address.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
