import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LifeBuoy, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getRecentErrors, logError } from "@/lib/errorLogger";
import { Link } from "react-router-dom";

// Fired anywhere in the app to open the support form (optionally pre-filled).
// Example: window.dispatchEvent(new CustomEvent("open-support-feedback", { detail: { subject, description, type: "question" } }))
export const openSupportEvent = "open-support-feedback";

type TicketType = "problem" | "question" | "feature" | "feedback";

const TYPE_LABEL: Record<TicketType, string> = {
  problem: "Problem / bug",
  question: "Question",
  feature: "Feature request",
  feedback: "Feedback",
};

export default function ReportProblemDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TicketType>("problem");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastTicketId, setLastTicketId] = useState<string | null>(null);

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail || {};
      if (detail.type) setType(detail.type);
      if (detail.subject) setSubject(String(detail.subject).slice(0, 140));
      if (detail.description) setDescription(String(detail.description).slice(0, 4000));
      setOpen(true);
    };
    window.addEventListener(openSupportEvent, handler as EventListener);
    return () => window.removeEventListener(openSupportEvent, handler as EventListener);
  }, []);

  const submit = async () => {
    const msg = description.trim();
    if (msg.length < 5) return toast.error("Please describe the issue (at least a few words).");
    if (!user) return toast.error("You need to be signed in.");
    setSubmitting(true);
    try {
      const { data: membership } = await supabase
        .from("organisation_members")
        .select("org_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      let attachment_path: string | undefined;
      if (file) {
        if (file.size > 10 * 1024 * 1024) throw new Error("Attachment must be under 10 MB.");
        const ext = file.name.split(".").pop() || "bin";
        const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("support-attachments").upload(path, file, { upsert: false });
        if (up.error) throw up.error;
        attachment_path = up.data.path;
      }

      const recent = getRecentErrors().slice(-10);
      const version = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : undefined;

      const { data: inserted, error } = await supabase
        .from("support_tickets")
        .insert([{
          user_id: user.id,
          org_id: membership?.org_id ?? undefined,
          reporter_name: profile?.full_name || undefined,
          reporter_email: user.email || undefined,
          ticket_type: type,
          subject: subject.trim().slice(0, 140) || msg.slice(0, 80),
          description: msg.slice(0, 4000),
          page_url: window.location.href,
          route: window.location.pathname,
          user_agent: navigator.userAgent,
          app_version: version,
          attachment_path,
          context: { recent_errors: recent } as never,
        }])
        .select("id")
        .maybeSingle();
      if (error) throw error;

      // Fire-and-forget notification to Servexa support inbox.
      if (inserted?.id) {
        supabase.functions.invoke("notify-support-ticket", {
          body: { ticketId: inserted.id, event: "created" },
        }).catch((e) => console.warn("notify-support-ticket failed:", e));
        setLastTicketId(inserted.id);
      }

      toast.success("Thanks — your ticket was sent to the Servexa support team.");
      setDescription("");
      setSubject("");
      setFile(null);
      setOpen(false);
    } catch (err) {
      logError({ source: "client", error: err, context: { where: "ReportProblemDialog.submit" } });
      toast.error(err instanceof Error ? err.message : "Could not send. Please try again shortly.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {trigger ? (
          <div onClick={() => setOpen(true)} className="inline-flex">{trigger}</div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="gap-2">
            <LifeBuoy className="h-4 w-4" /> Support & feedback
          </Button>
        )}
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Support & feedback</DialogTitle>
            <DialogDescription>
              Sends to the Servexa support team. We'll email you when someone replies.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as TicketType)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sf-subject">Subject</Label>
                <Input
                  id="sf-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="One-line summary"
                  maxLength={140}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="sf-desc">Message</Label>
              <Textarea
                id="sf-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell us what's going on…"
                rows={6}
                maxLength={4000}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">{description.length}/4000</p>
            </div>
            <div>
              <Label>Attachment (optional — screenshot, file up to 10 MB)</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="file"
                  accept="image/*,.pdf,.txt,.log"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                {file && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => setFile(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {file && (
                <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                  <Paperclip className="h-3 w-3" /> {file.name}
                </p>
              )}
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              Auto-attached: page URL, your user, organisation, browser, app version, recent client errors.
            </div>
          </div>
          <DialogFooter className="justify-between sm:justify-between">
            <Link
              to="/support/my-tickets"
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              onClick={() => setOpen(false)}
            >
              View my tickets
            </Link>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={submit} disabled={submitting}>{submitting ? "Sending…" : "Send"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {lastTicketId && null}
    </>
  );
}
