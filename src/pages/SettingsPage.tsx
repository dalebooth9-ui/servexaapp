import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MessageSquare, Webhook, Copy, CheckCircle2, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import XeroSettings from "@/components/XeroSettings";
import JobCategorySettings from "@/components/JobCategorySettings";
import AssetCategorySettings from "@/components/AssetCategorySettings";

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

export default function SettingsPage() {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(WEBHOOK_URL);
    setCopied(true);
    toast.success("Webhook URL copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-accent" />
              <CardTitle className="text-lg">WhatsApp Integration (Twilio)</CardTitle>
            </div>
            <CardDescription>
              Receive field reports automatically via WhatsApp using Twilio.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <div className="flex gap-2">
                <Input value={WEBHOOK_URL} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={copyWebhookUrl}>
                  {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Paste this URL into your Twilio WhatsApp Sandbox or Sender configuration as the "When a message comes in" webhook.
              </p>
            </div>

            <div className="rounded-lg border border-dashed p-4">
              <p className="text-sm font-medium">Twilio Setup Checklist</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground list-disc pl-4">
                <li>Twilio Account SID, Auth Token, and WhatsApp number are configured ✓</li>
                <li>Go to <strong>Twilio Console → Messaging → Try WhatsApp</strong> (or your production sender)</li>
                <li>Set the webhook URL above as the "When a message comes in" callback (HTTP POST)</li>
                <li>Ensure each engineer's WhatsApp number is saved in their profile</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                Engineer sends a message to the WhatsApp Business number with the job reference (e.g., "JOB-001")
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                Engineer sends photos, documents, text notes, or location pins
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                The system automatically files everything under the correct job
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">4</span>
                Office staff can view, filter, and download all submissions from the dashboard
              </li>
            </ol>
          </CardContent>
        </Card>
        <JobCategorySettings />
        <AssetCategorySettings />
        <XeroSettings />
      </div>
    </div>
  );
}
