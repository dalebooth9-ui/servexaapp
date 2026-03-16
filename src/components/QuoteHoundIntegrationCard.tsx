import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, CheckCircle2, Link2, ExternalLink, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/receive-quote-hound`;
const QUOTE_HOUND_URL = "https://spark-chaser-pro.lovable.app";

export default function QuoteHoundIntegrationCard() {
  const [copiedUrl, setCopiedUrl] = useState(false);

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(WEBHOOK_URL);
    setCopiedUrl(true);
    toast.success("Webhook URL copied");
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
          When a quote is marked as <strong>Won</strong> in Quote Hound, it automatically creates a job and syncs the customer here in Servexa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Webhook URL */}
        <div className="space-y-2">
          <Label>Servexa Webhook URL</Label>
          <div className="flex gap-2">
            <Input value={WEBHOOK_URL} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={copyWebhookUrl}>
              {copiedUrl
                ? <CheckCircle2 className="h-4 w-4 text-primary" />
                : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This is the receiving endpoint in Servexa. Quote Hound is already configured to call it.
          </p>
        </div>

        {/* How to connect */}
        <div className="rounded-lg border border-dashed p-4 space-y-3">
          <p className="text-sm font-semibold">How to activate the integration</p>
          <ol className="space-y-2.5 text-xs text-muted-foreground list-none pl-0">
            <li className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">1</span>
              <span>
                Open{" "}
                <a href={QUOTE_HOUND_URL} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-0.5">
                  Quote Hound <ExternalLink className="h-3 w-3" />
                </a>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">2</span>
              <span>Click the <strong>Company Settings</strong> popover (top-right ⚙️ icon on the pipeline view)</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">3</span>
              <span>In the <strong>Servexa API Key</strong> field, enter the <code className="bg-muted px-1 rounded text-[11px]">QUOTEHOUND_WEBHOOK_SECRET</code> value you set up in Servexa's backend secrets</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">4</span>
              <span>Click <strong>Save</strong> — the next quote marked Won will automatically push a job here</span>
            </li>
          </ol>
        </div>

        {/* Data synced */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What syncs from Quote Hound → Servexa</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><ArrowRight className="h-3 w-3 text-primary shrink-0" /> Customer name &amp; contact details</span>
            <span className="flex items-center gap-1.5"><ArrowRight className="h-3 w-3 text-primary shrink-0" /> Job type &amp; site address</span>
            <span className="flex items-center gap-1.5"><ArrowRight className="h-3 w-3 text-primary shrink-0" /> Quote value &amp; notes</span>
            <span className="flex items-center gap-1.5"><ArrowRight className="h-3 w-3 text-primary shrink-0" /> Job reference (prefixed QH-)</span>
            <span className="flex items-center gap-1.5"><ArrowRight className="h-3 w-3 text-primary shrink-0" /> Customer auto-created if new</span>
            <span className="flex items-center gap-1.5"><ArrowRight className="h-3 w-3 text-primary shrink-0" /> Duplicate protection (idempotent)</span>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
