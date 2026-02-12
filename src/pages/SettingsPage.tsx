import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MessageSquare, Webhook } from "lucide-react";

export default function SettingsPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-accent" />
              <CardTitle className="text-lg">WhatsApp Integration</CardTitle>
            </div>
            <CardDescription>
              Configure the WhatsApp Business API to receive field reports automatically. You'll need a WhatsApp Business API provider (like Twilio or Meta Cloud API).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Webhook className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">WhatsApp Webhook</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The webhook endpoint will be set up as a backend function. Once configured, your engineers can send photos, documents, and notes to your WhatsApp Business number, and they'll appear automatically in the relevant job folder.
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Contact your admin to set up the WhatsApp Business API credentials.
              </p>
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
      </div>
    </div>
  );
}
