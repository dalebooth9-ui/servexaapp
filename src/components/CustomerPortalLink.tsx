import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Globe, Copy, Check, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface CustomerPortalLinkProps {
  customerId: string;
  customerEmail?: string | null;
  customerName: string;
}

type Token = {
  id: string;
  token: string;
  customer_email: string;
  is_active: boolean;
  last_accessed: string | null;
  created_at: string;
  expires_at: string;
};

export default function CustomerPortalLink({ customerId, customerEmail, customerName }: CustomerPortalLinkProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(customerEmail || "");
  const [generating, setGenerating] = useState(false);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadTokens = async () => {
    const { data } = await supabase
      .from("customer_portal_tokens" as any)
      .select("id, token, customer_email, is_active, last_accessed, created_at, expires_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    setTokens((data || []) as any);
  };

  useEffect(() => { if (open) loadTokens(); }, [open, customerId]);

  const handleGenerate = async () => {
    if (!user || !email.trim()) return;
    setGenerating(true);
    const { data: customer } = await supabase.from("customers").select("org_id").eq("id", customerId).maybeSingle();

    const { error } = await supabase.from("customer_portal_tokens" as any).insert({
      customer_id: customerId,
      customer_email: email.trim(),
      created_by: user.id,
      org_id: customer?.org_id ?? null,
    } as any);
    setGenerating(false);
    if (error) {
      toast({ title: "Error", description: "Failed to generate portal link.", variant: "destructive" });
      return;
    }
    toast({ title: "Link created", description: "Share it with your customer." });
    loadTokens();
  };

  const handleCopy = (t: Token) => {
    const url = `${window.location.origin}/portal?token=${t.token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(t.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "Copied!", description: "Portal link copied to clipboard." });
  };

  const toggleActive = async (t: Token) => {
    await supabase.from("customer_portal_tokens" as any).update({ is_active: !t.is_active }).eq("id", t.id);
    loadTokens();
  };

  const deleteToken = async (t: Token) => {
    await supabase.from("customer_portal_tokens" as any).delete().eq("id", t.id);
    loadTokens();
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Globe className="mr-2 h-4 w-4" />
        Customer Portal
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Customer Portal — {customerName}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Generate a secure portal link so the customer can view their jobs, invoices, certificates, sites and sign-offs. Links expire after 7 days.
          </p>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Customer Email</Label>
              <div className="flex gap-2">
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" type="email" />
                <Button disabled={!email.trim() || generating} onClick={handleGenerate}>
                  {generating ? "..." : "Generate"}
                </Button>
              </div>
            </div>
          </div>

          {tokens.length > 0 && (
            <div className="space-y-2 max-h-72 overflow-auto pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground">Active links</p>
              {tokens.map((t) => {
                const url = `${window.location.origin}/portal?token=${t.token}`;
                const expired = new Date(t.expires_at) < new Date();
                return (
                  <div key={t.id} className="rounded-lg border p-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium truncate">{t.customer_email}</span>
                      <div className="flex items-center gap-1">
                        <Switch checked={t.is_active && !expired} disabled={expired} onCheckedChange={() => toggleActive(t)} />
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteToken(t)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Input readOnly value={url} className="h-8 text-xs font-mono" />
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => handleCopy(t)}>
                        {copiedId === t.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {expired ? "Expired" : `Expires ${format(new Date(t.expires_at), "dd MMM yyyy")}`} ·
                      {t.last_accessed ? ` Last viewed ${format(new Date(t.last_accessed), "dd MMM HH:mm")}` : " Never viewed"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
