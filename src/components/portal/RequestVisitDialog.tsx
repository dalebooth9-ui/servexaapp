import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { UKDateInput } from "@/components/ui/uk-date-input";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  site: { id: string; name: string };
  customerId: string;
  orgId: string;
}

export function RequestVisitDialog({ open, onOpenChange, site, customerId, orgId }: Props) {
  const { user } = useAuth();
  const [preferredDate, setPreferredDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("portal_visit_requests").insert({
      org_id: orgId, customer_id: customerId, site_id: site.id,
      requested_by: user.id,
      preferred_date: preferredDate || null,
      notes: notes || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Visit request sent — the office will be in touch.");
    onOpenChange(false);
    setPreferredDate(""); setNotes("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Request a visit — {site.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="pd">Preferred date (optional)</Label>
            <UKDateInput id="pd"  value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="nt">Notes</Label>
            <Textarea id="nt" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What do you need looked at?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving} onClick={submit}>Send request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
