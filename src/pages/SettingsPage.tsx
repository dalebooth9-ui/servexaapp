import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MessageSquare, Copy, CheckCircle2, ArrowLeft, Loader2, Send, BarChart2, Smartphone, Mail } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import ComplianceReminderSettings from "@/components/ComplianceReminderSettings";
import XeroSettings from "@/components/XeroSettings";
import RamsTemplateSettings from "@/components/RamsTemplateSettings";
import FollowUpReminderSettings from "@/components/FollowUpReminderSettings";
import JobCategorySettings from "@/components/JobCategorySettings";
import AssetCategorySettings from "@/components/AssetCategorySettings";
import UserRoleSettings from "@/components/UserRoleSettings";
import JobTemplateSettings from "@/components/JobTemplateSettings";
import CategoryDocumentTemplateSettings from "@/components/CategoryDocumentTemplateSettings";
import { supabase } from "@/integrations/supabase/client";

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;
const INSTALL_URL = "https://field-aid-box.lovable.app/install";

export default function SettingsPage() {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingReport, setSendingReport] = useState(false);
  const [onboardingEmail, setOnboardingEmail] = useState("");
  const [onboardingName, setOnboardingName] = useState("");
  const [sendingOnboarding, setSendingOnboarding] = useState(false);

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(WEBHOOK_URL);
    setCopied(true);
    toast.success("Webhook URL copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const copyInstallUrl = () => {
    navigator.clipboard.writeText(INSTALL_URL);
    setCopiedInstall(true);
    toast.success("Install link copied to clipboard");
    setTimeout(() => setCopiedInstall(false), 2000);
  };

  const sendOnboardingEmail = async () => {
    if (!onboardingEmail) return;
    setSendingOnboarding(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/send-engineer-onboarding`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ to_email: onboardingEmail, engineer_name: onboardingName || undefined }),
        }
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      toast.success(`Onboarding email sent to ${onboardingEmail}`);
      setOnboardingEmail("");
      setOnboardingName("");
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setSendingOnboarding(false);
    }
  };


  const sendTestReport = async () => {
    if (!testEmail) return;
    setSendingReport(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/send-weekly-report`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ test: true, to_email: testEmail }),
        }
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      toast.success(`Test report sent to ${testEmail}`);
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setSendingReport(false);
    }
  };

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>

      <div className="space-y-6">
        {/* Engineer App Install QR Code */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Engineer App Install</CardTitle>
            </div>
            <CardDescription>
              Share this QR code or link with engineers to install the FieldReport app on their phone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="flex flex-col items-center gap-2 rounded-xl border bg-muted/40 p-4 shrink-0">
                <QRCodeSVG
                  value={INSTALL_URL}
                  size={140}
                  bgColor="transparent"
                  fgColor="hsl(var(--foreground))"
                  level="M"
                />
                <p className="text-xs text-muted-foreground">Scan to install</p>
              </div>
              <div className="flex-1 space-y-3 w-full">
                <div className="space-y-1.5">
                  <Label>Install link</Label>
                  <div className="flex gap-2">
                    <Input value={INSTALL_URL} readOnly className="font-mono text-xs" />
                    <Button variant="outline" size="icon" onClick={copyInstallUrl}>
                      {copiedInstall ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="rounded-lg border border-dashed p-3 space-y-1">
                  <p className="text-xs font-medium">Installation instructions</p>
                  <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                    <li><strong>iPhone:</strong> Open link → Safari Share → "Add to Home Screen"</li>
                    <li><strong>Android:</strong> Open link → Chrome menu → "Install App"</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Onboarding email */}
            <div className="mt-5 pt-5 border-t space-y-3">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">Send onboarding email to an engineer</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Sends a branded email with the install link, QR code, and step-by-step instructions directly to the engineer's inbox.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="onb-name">Engineer name (optional)</Label>
                  <Input
                    id="onb-name"
                    placeholder="e.g. James"
                    value={onboardingName}
                    onChange={(e) => setOnboardingName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="onb-email">Engineer email</Label>
                  <Input
                    id="onb-email"
                    type="email"
                    placeholder="engineer@example.com"
                    value={onboardingEmail}
                    onChange={(e) => setOnboardingEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendOnboardingEmail()}
                  />
                </div>
              </div>
              <Button
                onClick={sendOnboardingEmail}
                disabled={sendingOnboarding || !onboardingEmail}
                size="sm"
              >
                {sendingOnboarding
                  ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Sending…</>
                  : <><Send className="mr-1.5 h-4 w-4" /> Send Onboarding Email</>
                }
              </Button>
            </div>
          </CardContent>
        </Card>

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
                  {copied ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
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
        <UserRoleSettings />
        <FollowUpReminderSettings />
        <ComplianceReminderSettings />
        <JobCategorySettings />
        <AssetCategorySettings />
        <JobTemplateSettings />
        <CategoryDocumentTemplateSettings />
        <RamsTemplateSettings />
        <XeroSettings />

        {/* Weekly Report Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Weekly Management Report</CardTitle>
            </div>
            <CardDescription>
              A rich executive summary email is sent automatically every Monday at 08:00 UTC to all admin users, covering the previous week's revenue, jobs completed, engineer performance, and top customers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-dashed p-4 space-y-2">
              <p className="text-sm font-medium">What's included in the report</p>
              <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                <li>Revenue paid vs prior week (with % delta)</li>
                <li>Jobs created, completed, and completion rate</li>
                <li>Per-engineer breakdown: jobs done, hours logged, submissions</li>
                <li>Job status mix and top customers by volume</li>
                <li>Direct link back to the full Reports dashboard</li>
              </ul>
            </div>
            <div className="space-y-2">
              <Label>Send a test report now</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
                <Button
                  onClick={sendTestReport}
                  disabled={sendingReport || !testEmail}
                  className="shrink-0"
                >
                  {sendingReport
                    ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Sending…</>
                    : <><Send className="mr-1.5 h-4 w-4" /> Send Test</>
                  }
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Sends last week's data to the address above. Marked <strong>[TEST]</strong> in the subject line.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
