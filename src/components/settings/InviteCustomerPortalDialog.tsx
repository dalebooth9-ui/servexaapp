import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customerId: string;
  customerName: string;
}

/** Admin-side dialog to invite a customer contact to the portal. */
export function InviteCustomerPortalDialog({ open, onOpenChange, customerId, customerName }: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!email.includes("@")) { toast.error("Enter a valid email"); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("invite-customer-portal-user", {
      body: { customer_id: customerId, email: email.trim().toLowerCase() },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast.error(error?.message || (data as any)?.error || "Failed to send invite");
      return;
    }
    toast.success(`Invite sent to ${email}`);
    onOpenChange(false); setEmail("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Invite to customer portal — {customerName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The invited person will get a one-click sign-in link and read-only access to this customer's
            sites, certificates, upcoming services and open quotes. Requires the portal to be enabled in
            organisation settings.
          </p>
          <div>
            <Label htmlFor="em">Email</Label>
            <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="fm@customer.co.uk" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send} disabled={busy}>Send invite</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
