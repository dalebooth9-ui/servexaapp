import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mail, Copy, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function PoIntakeEmailCard() {
  const [intakeEmail, setIntakeEmail] = useState<string | null>(null);
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
        .select("intake_email")
        .eq("id", orgId as string)
        .maybeSingle();
      if (qErr) {
        setError(qErr.message);
      } else {
        setIntakeEmail(((data as any)?.intake_email as string) ?? null);
      }
      setLoading(false);
    })();
  }, []);

  const copy = () => {
    if (!intakeEmail) return;
    navigator.clipboard.writeText(intakeEmail);
    setCopied(true);
    toast.success("Intake email copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          Email your POs here
        </CardTitle>
        <CardDescription>
          Forward or send purchase order emails to this address and Servexa will create a pending
          job automatically — attachments (PDFs, images) are saved against the job for review.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="h-10 rounded-md bg-muted animate-pulse" />
        ) : intakeEmail ? (
          <div className="flex gap-2">
            <Input value={intakeEmail} readOnly className="font-mono text-sm" />
            <Button variant="outline" size="icon" onClick={copy} aria-label="Copy intake email">
              {copied ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No intake email is configured for your organisation yet — contact support.
          </p>
        )}

        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">How it works</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Forward the customer's PO email (or CC this address on new orders).</li>
            <li>Servexa reads the subject, body, and attachments and creates a job with status <strong>Pending Review</strong>.</li>
            <li>Michelle (or any admin) approves it from the Jobs list — the original PDF stays attached.</li>
          </ol>
          <p className="pt-1">
            The address is unique to your organisation. Do not share it publicly — treat it like a
            private inbox. Inbound is capped at 30 messages per hour per address.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
