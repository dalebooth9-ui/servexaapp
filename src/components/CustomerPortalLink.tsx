import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Globe, Copy, Check } from "lucide-react";

interface CustomerPortalLinkProps {
  customerId: string;
  customerEmail?: string | null;
  customerName: string;
}

export default function CustomerPortalLink({ customerId, customerEmail, customerName }: CustomerPortalLinkProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(customerEmail || "");
  const [generating, setGenerating] = useState(false);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!user || !email.trim()) return;
    setGenerating(true);

    // Create token
    const { data, error } = await supabase
      .from("customer_portal_tokens" as any)
      .insert({
        customer_id: customerId,
        customer_email: email.trim(),
        created_by: user.id,
      } as any)
      .select()
      .single();

    if (error || !data) {
      toast({ title: "Error", description: "Failed to generate portal link.", variant: "destructive" });
      setGenerating(false);
      return;
    }

    const url = `${window.location.origin}/portal?token=${(data as any).token}`;
    setPortalUrl(url);
    setGenerating(false);
  };

  const handleCopy = () => {
    if (!portalUrl) return;
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Portal link copied to clipboard." });
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Globe className="mr-2 h-4 w-4" />
        Customer Portal
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPortalUrl(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Customer Portal Link
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Generate a secure read-only portal link for <strong>{customerName}</strong> to view their job history and upcoming visits. Valid for 7 days.
          </p>
          {!portalUrl ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Customer Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" type="email" />
              </div>
              <Button className="w-full" disabled={!email.trim() || generating} onClick={handleGenerate}>
                {generating ? "Generating..." : "Generate Portal Link"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Portal Link (valid 7 days)</Label>
                <div className="flex gap-2">
                  <Input value={portalUrl} readOnly className="font-mono text-xs" />
                  <Button size="icon" variant="outline" onClick={handleCopy}>
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Share this link directly with the customer. No login required.</p>
              <Button variant="outline" className="w-full" onClick={() => setPortalUrl(null)}>
                Generate New Link
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
