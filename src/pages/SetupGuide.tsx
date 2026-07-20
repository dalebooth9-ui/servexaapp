import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, MessageCircle, Upload } from "lucide-react";
import SetupChecklist from "@/components/SetupChecklist";
import { useSetupProgress } from "@/hooks/useSetupProgress";

export default function SetupGuide() {
  const { reopen, allDone } = useSetupProgress();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Setup guide</h1>
          <p className="text-sm text-muted-foreground">
            A short guided setup for your organisation. Each step opens the right page and highlights what to click.
          </p>
        </div>
        {allDone && (
          <Button variant="outline" size="sm" onClick={reopen}>
            Reset dismissal
          </Button>
        )}
      </div>

      <SetupChecklist variant="page" hideDismiss />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            Bringing in existing customers, sites, and assets
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3">
          <p>
            Switching from Uptick, simPRO, Joblogic, Tradify, or a spreadsheet? Drop your export in
            and our AI will map the columns for you — no reformatting required. You can review and
            correct everything before anything is written.
          </p>
          <Button asChild size="sm">
            <Link to="/settings/import">Import from spreadsheet</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            Filing photos via WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Engineers can send site photos straight to Servexa on WhatsApp. Just message the
            company WhatsApp number with the photo, and include the job or site name in the caption.
          </p>
          <p>
            <span className="font-medium text-foreground">Example caption:</span>{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              Cedartree Court — pump replaced, all tested OK
            </code>
          </p>
          <p>
            The photo is filed to the matching job automatically. Ask your Servexa admin for the
            WhatsApp number if you don't have it — this step auto-completes as soon as the first
            WhatsApp photo reaches the system.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
