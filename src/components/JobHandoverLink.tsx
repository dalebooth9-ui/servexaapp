import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Copy, Loader2, Send, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { format } from "date-fns";

type HandoverToken = {
  id: string; token: string; status: string; signed_at: string | null;
  signer_name: string | null; signature_data: string | null; expires_at: string;
  customer_id: string | null;
};

export default function JobHandoverLink({ jobId, customerId, customerName }: {
  jobId: string; customerId?: string | null; customerName?: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(customerName || "");
  const [email, setEmail] = useState("");
  const [generating, setGenerating] = useState(false);
  const [link, setLink] = useState("");
  const [existing, setExisting] = useState<HandoverToken | null>(null);
  const [loading, setLoading] = useState(true);

  const loadLatest = async () => {
    const { data } = await supabase
      .from("handover_tokens")
      .select("id, token, status, signed_at, signer_name, signature_data, expires_at, customer_id")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setExisting((data as any) || null);
    setLoading(false);
  };

  useEffect(() => { void loadLatest(); }, [jobId]);

  const generate = async () => {
    if (!user) return;
    setGenerating(true);
    const { data, error } = await supabase
      .from("handover_tokens")
      .insert({
        job_id: jobId,
        customer_id: customerId || null,
        signer_name: name || null,
        signer_email: email || null,
        created_by: user.id,
      })
      .select("token")
      .single();
    setGenerating(false);
    if (error || !data) {
      toast({ title: "Error", description: error?.message || "Failed to generate link", variant: "destructive" });
      return;
    }
    setLink(`${window.location.origin}/job-handover/${(data as any).token}`);
    void loadLatest();
  };

  const copyLink = (l: string) => {
    navigator.clipboard.writeText(l);
    toast({ title: "Copied", description: "Sign-off link copied to clipboard." });
  };

  const statusBadge = () => {
    if (loading) return null;
    if (!existing) {
      return <Badge variant="outline" className="text-muted-foreground">No sign-off requested</Badge>;
    }
    if (existing.status === "signed") {
      return (
        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Signed off {existing.signed_at ? format(new Date(existing.signed_at), "dd MMM yyyy") : ""}
        </Badge>
      );
    }
    const expired = new Date(existing.expires_at) < new Date();
    return (
      <Badge variant="outline" className={expired
        ? "bg-muted text-muted-foreground"
        : "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30"}>
        <Clock className="h-3 w-3 mr-1" />
        {expired ? "Sign-off link expired" : "Awaiting sign-off"}
      </Badge>
    );
  };

  const existingLink = existing ? `${window.location.origin}/job-handover/${existing.token}` : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {statusBadge()}
        {existing?.status === "signed" && existing.signature_data && (
          <img src={existing.signature_data} alt="Customer signature" className="h-10 border rounded bg-white px-2" />
        )}
      </div>

      {existing?.status !== "signed" && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {existing ? "Resend Sign-Off Link" : "Send Sign-Off Link"}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Send Job Sign-Off Link</DialogTitle>
            </DialogHeader>

            {existingLink && existing?.status === "pending" && !link && (
              <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Existing pending link:</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs flex-1 break-all">{existingLink}</code>
                  <Button size="sm" variant="ghost" onClick={() => copyLink(existingLink)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Expires {format(new Date(existing.expires_at), "dd MMM yyyy")}
                </p>
              </div>
            )}

            {!link ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cust-name">Customer name</Label>
                  <Input id="cust-name" value={name} onChange={e => setName(e.target.value)} placeholder="Optional — pre-fills the form" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cust-email">Customer email</Label>
                  <Input id="cust-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Optional" />
                </div>
                <Button onClick={generate} disabled={generating} className="w-full">
                  {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Generate New Link
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Share this link with the customer. It expires in 7 days.</p>
                <div className="flex items-center gap-2 bg-muted rounded-lg p-3">
                  <code className="text-xs flex-1 break-all text-foreground">{link}</code>
                  <Button size="sm" variant="ghost" onClick={() => copyLink(link)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button asChild variant="outline" className="flex-1">
                    <a href={link} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Preview
                    </a>
                  </Button>
                  {email && (
                    <Button asChild className="flex-1">
                      <a href={`mailto:${email}?subject=${encodeURIComponent("Sign off your completed job")}&body=${encodeURIComponent(`Hi${name ? ` ${name}` : ""},\n\nPlease review and sign off the completed work using the link below:\n\n${link}\n\nThank you.`)}`}>
                        <Send className="h-3.5 w-3.5 mr-1.5" /> Email
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
