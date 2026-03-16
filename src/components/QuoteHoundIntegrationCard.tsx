import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, CheckCircle2, Link2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/receive-quote-hound`;
const QUOTE_HOUND_URL = "https://spark-chaser-pro.lovable.app";

export default function QuoteHoundIntegrationCard() {
  const [copiedUrl, setCopiedUrl] = useState(false);

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(WEBHOOK_URL);
    setCopiedUrl(true);
    toast.success("Webhook URL copied to clipboard");
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Quote Hound Integration</CardTitle>
        </div>
        <CardDescription>
          When a quote is marked as Won in Quote Hound, it automatically creates a job and syncs the customer here in Servexa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Webhook endpoint */}
        <div className="space-y-2">
          <Label>Servexa Webhook URL</Label>
          <div className="flex gap-2">
            <Input
              value={WEBHOOK_URL}
              readOnly
              className="font-mono text-xs"
            />
            <Button variant="outline" size="icon" onClick={copyWebhookUrl}>
              {copiedUrl
                ? <CheckCircle2 className="h-4 w-4 text-primary" />
                : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Paste this URL into Quote Hound's Settings → Company Details → Servexa Webhook URL field.
          </p>
        </div>

        {/* Setup steps */}
        <div className="rounded-lg border border-dashed p-4 space-y-3">
          <p className="text-sm font-medium">How to connect</p>
          <ol className="space-y-2 text-xs text-muted-foreground list-decimal pl-4">
            <li>
              Open <a href={QUOTE_HOUND_URL} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-0.5">
                Quote Hound <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>Go to the <strong>Company Settings</strong> popover (top-right of the pipeline view)</li>
            <li>Paste the webhook URL above into <strong>"Servexa Webhook URL"</strong></li>
            <li>Enter the shared webhook secret into <strong>"Servexa Webhook Secret"</strong> — contact your admin for the value</li>
            <li>Click Save — the next won quote will push here automatically</li>
          </ol>
        </div>

        {/* What gets synced */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What gets synced on each Won quote</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span>✓ Customer name &amp; contact details</span>
            <span>✓ Job type &amp; address</span>
            <span>✓ Quote value &amp; notes</span>
            <span>✓ Job reference (prefixed QH-)</span>
            <span>✓ Customer auto-created if new</span>
            <span>✓ Duplicate protection (idempotent)</span>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
