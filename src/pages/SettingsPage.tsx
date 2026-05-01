import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MessageSquare, Copy, CheckCircle2, ArrowLeft, Loader2, Send, BarChart2, Smartphone, Mail, ShieldCheck, RotateCcw, AlertTriangle, Calendar, Link2, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import ComplianceReminderSettings from "@/components/ComplianceReminderSettings";
import XeroSettings from "@/components/XeroSettings";
import RamsTemplateSettings from "@/components/RamsTemplateSettings";
import FollowUpReminderSettings from "@/components/FollowUpReminderSettings";
import EmailDeliveryTestCard from "@/components/EmailDeliveryTestCard";
import JobCategorySettings from "@/components/JobCategorySettings";
import AssetCategorySettings from "@/components/AssetCategorySettings";
import UserRoleSettings from "@/components/UserRoleSettings";
import JobTemplateSettings from "@/components/JobTemplateSettings";
import CategoryDocumentTemplateSettings from "@/components/CategoryDocumentTemplateSettings";
import CustomerReassignWizard from "@/components/CustomerReassignWizard";
import CustomerMergeSuggestionsPanel from "@/components/CustomerMergeSuggestionsPanel";
import { supabase } from "@/integrations/supabase/client";
import QuoteHoundIntegrationCard from "@/components/QuoteHoundIntegrationCard";
import JobDocumentReattachSettings from "@/components/JobDocumentReattachSettings";
import FilenameFormatSettings from "@/components/FilenameFormatSettings";
import { WordExportSettings } from "@/components/WordExportSettings";
import WatermarkSettings from "@/components/WatermarkSettings";

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;
const INSTALL_URL = "https://servexaapp.lovable.app/install";

const API_KEY_ROTATION_DAYS = 90;

function getRotationStatus(lastRotatedIso: string | null) {
  if (!lastRotatedIso) return { daysLeft: 0, status: "unknown" as const };
  const last = new Date(lastRotatedIso);
  const due = new Date(last.getTime() + API_KEY_ROTATION_DAYS * 24 * 60 * 60 * 1000);
  const today = new Date();
  const daysLeft = Math.ceil((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  const status = daysLeft <= 0 ? "overdue" : daysLeft <= 14 ? "due_soon" : "ok";
  return { daysLeft, status: status as "overdue" | "due_soon" | "ok" | "unknown", dueDate: due };
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingReport, setSendingReport] = useState(false);
  const [onboardingEmail, setOnboardingEmail] = useState("");
  const [onboardingName, setOnboardingName] = useState("");
  const [sendingOnboarding, setSendingOnboarding] = useState(false);

  const [lastRotated, setLastRotated] = useState<string | null>(() =>
    localStorage.getItem("api_key_last_rotated")
  );

  const markRotated = () => {
    const now = new Date().toISOString();
    localStorage.setItem("api_key_last_rotated", now);
    setLastRotated(now);
    toast.success("API key rotation logged. Next rotation due in 90 days.");
  };

  const rotationInfo = getRotationStatus(lastRotated);

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configure your workspace — integrations, reminders, templates, and team access.</p>
      </div>

      <div className="space-y-6">
        {/* Engineer App Install QR Code */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Engineer App Install</CardTitle>
            </div>
            <CardDescription>
              Share this QR code or link with engineers to install the Servexa app on their phone.
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
              Receive Servexa reports automatically via WhatsApp using Twilio.
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
        <FilenameFormatSettings />
        <WordExportSettings />
        <WatermarkSettings />
        <XeroSettings />

        {/* The Mellor Integration */}
        <QuoteHoundIntegrationCard />

        {/* Customer merge suggestions (admin-only) */}
        <CustomerMergeSuggestionsPanel />

        {/* Customer Reassignment (admin-only) */}
        <CustomerReassignWizard />

        {/* Document Re-attach Tool */}
        <JobDocumentReattachSettings />

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

        {/* API Key Security */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">API Key Security</CardTitle>
            </div>
            <CardDescription>
              Track and manage your 90-day API key rotation schedule. Rotating keys regularly limits exposure if a key is ever compromised.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Stored in environment secrets", done: true, detail: "Google Maps, Twilio, Resend, Xero" },
                { label: "Restricted to your domain", done: true, detail: "Google Cloud Console HTTP referrer restriction" },
                { label: "Rotated every 90 days", done: !!lastRotated && rotationInfo.status === "ok", detail: lastRotated ? `Last rotated ${new Date(lastRotated).toLocaleDateString()}` : "Not yet logged" },
              ].map(({ label, done, detail }) => (
                <div key={label} className={`flex items-start gap-3 rounded-lg border p-3 ${done ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"}`}>
                  <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${done ? "text-success" : "text-muted-foreground/40"}`} />
                  <div>
                    <p className="text-xs font-medium">{label}</p>
                    <p className="text-[11px] text-muted-foreground">{detail}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Rotation countdown */}
            <div className={`flex items-center justify-between rounded-lg border p-4 ${
              rotationInfo.status === "overdue" ? "border-destructive/40 bg-destructive/5"
              : rotationInfo.status === "due_soon" ? "border-warning/40 bg-warning/5"
              : rotationInfo.status === "ok" ? "border-success/30 bg-success/5"
              : "border-border bg-muted/30"
            }`}>
              <div className="flex items-center gap-3">
                {rotationInfo.status === "overdue" ? (
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                ) : rotationInfo.status === "due_soon" ? (
                  <AlertTriangle className="h-5 w-5 text-warning" />
                ) : rotationInfo.status === "ok" ? (
                  <ShieldCheck className="h-5 w-5 text-success" />
                ) : (
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  {rotationInfo.status === "unknown" && (
                    <>
                      <p className="text-sm font-medium">No rotation logged yet</p>
                      <p className="text-xs text-muted-foreground">Click "Mark as Rotated" after you rotate your keys in Google Cloud Console, Twilio, and Resend.</p>
                    </>
                  )}
                  {rotationInfo.status === "ok" && (
                    <>
                      <p className="text-sm font-medium text-success">{rotationInfo.daysLeft} days until next rotation</p>
                      <p className="text-xs text-muted-foreground">Due {rotationInfo.dueDate?.toLocaleDateString()}</p>
                    </>
                  )}
                  {rotationInfo.status === "due_soon" && (
                    <>
                      <p className="text-sm font-medium text-warning">Rotation due in {rotationInfo.daysLeft} days</p>
                      <p className="text-xs text-muted-foreground">Due {rotationInfo.dueDate?.toLocaleDateString()} — rotate soon</p>
                    </>
                  )}
                  {rotationInfo.status === "overdue" && (
                    <>
                      <p className="text-sm font-medium text-destructive">Rotation overdue!</p>
                      <p className="text-xs text-muted-foreground">Last rotated {lastRotated ? new Date(lastRotated).toLocaleDateString() : "never"}. Rotate your keys now.</p>
                    </>
                  )}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={markRotated} className="shrink-0 gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                Mark as Rotated
              </Button>
            </div>

            <div className="rounded-lg border border-dashed p-4 space-y-2">
              <p className="text-xs font-medium">Keys to rotate every 90 days</p>
              <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                <li><strong>Google Maps API key</strong> — Google Cloud Console → APIs &amp; Services → Credentials</li>
                <li><strong>Resend API key</strong> — resend.com → API Keys</li>
                <li><strong>Twilio Auth Token</strong> — console.twilio.com → Account Info</li>
                <li><strong>Xero Client Secret</strong> — developer.xero.com → My Apps</li>
              </ul>
              <p className="text-[11px] text-muted-foreground mt-2">After rotating each key, update it in Settings → Lovable Cloud → Secrets, then click "Mark as Rotated" above.</p>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
