import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getRecentErrors, logError } from "@/lib/errorLogger";

export default function ReportProblemDialog({
  trigger,
}: {
  trigger?: React.ReactNode;
}) {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const text = description.trim();
    if (text.length < 5) {
      toast.error("Please describe what went wrong (at least a few words).");
      return;
    }
    if (!user) {
      toast.error("You need to be signed in to report a problem.");
      return;
    }
    setSubmitting(true);
    try {
      const { data: membership } = await supabase
        .from("organisation_members")
        .select("org_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      const recent = getRecentErrors().slice(-10);

      const { error } = await supabase.from("support_tickets").insert([{
        user_id: user.id,
        org_id: membership?.org_id ?? undefined,
        reporter_name: profile?.full_name || undefined,
        reporter_email: user.email || undefined,
        description: text.slice(0, 4000),
        page_url: window.location.href,
        route: window.location.pathname,
        user_agent: navigator.userAgent,
        context: { recent_errors: recent } as never,
      }]);
      if (error) throw error;
      toast.success("Thanks — your report was sent to the admin team.");
      setDescription("");
      setOpen(false);
    } catch (err) {
      logError({ source: "client", error: err, context: { where: "ReportProblemDialog.submit" } });
      toast.error("Could not send your report. Please try again shortly.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <div onClick={() => setOpen(true)} className="inline-flex">{trigger}</div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          className="gap-2"
        >
          <LifeBuoy className="h-4 w-4" />
          Report a problem
        </Button>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Report a problem</DialogTitle>
          <DialogDescription>
            Tell us what happened. We'll also attach the page you're on and any
            recent errors so the team can investigate.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="report-desc">What went wrong?</Label>
            <Textarea
              id="report-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. When I clicked Save on the job, nothing happened and no message showed."
              rows={6}
              maxLength={4000}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {description.length}/4000
            </p>
          </div>
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <p><strong>Auto-attached:</strong> page URL, your user, organisation, browser, and up to 10 most recent client errors.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Sending…" : "Send report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
