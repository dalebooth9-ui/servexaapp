import { useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { quickAddSite, loadSiteNamesForCheck } from "@/lib/quickAddSite";
import { findLookAlike } from "@/lib/similarName";

type Site = { id: string; name: string; address: string | null; postcode: string | null };

/** Add a site with only a name and address; warns about look-alike names but never merges. */
export default function QuickAddSiteDialog({ open, onOpenChange, customerId, customerName, onCreated, onUseExisting }: {
  open: boolean; onOpenChange: (v: boolean) => void; customerId?: string | null; customerName?: string;
  onCreated?: (site: Site) => void; onUseExisting?: (site: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [lookAlike, setLookAlike] = useState<{ id: string; name: string } | null>(null);

  const reset = () => { setName(""); setAddress(""); setLookAlike(null); };
  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const save = async (skipCheck = false) => {
    if (!name.trim()) { toast.error("Please enter a site name."); return; }
    setBusy(true);
    try {
      if (!skipCheck) {
        const match = findLookAlike(name, await loadSiteNamesForCheck(null));
        if (match) { setLookAlike(match); return; }
      }
      const site = await quickAddSite({ name, address, customerId });
      toast.success(`Site “${site.name}” added`);
      onCreated?.(site);
      close(false);
    } catch (e: any) {
      toast.error("Site not added", { description: e?.message });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add site{customerName ? ` for ${customerName}` : ""}</DialogTitle>
          <DialogDescription>Just a name and address. You can add buildings, risers and contacts later.</DialogDescription>
        </DialogHeader>
        {lookAlike ? (
          <div className="space-y-3 rounded-md border border-amber-400 p-3">
            <p className="text-sm font-medium">This looks like “{lookAlike.name}”, use that one?</p>
            <div className="flex flex-wrap gap-2">
              {onUseExisting
                ? <Button size="sm" onClick={() => { onUseExisting(lookAlike); close(false); }}>Use “{lookAlike.name}”</Button>
                : <Button size="sm" asChild><Link to={`/sites?site=${lookAlike.id}`} onClick={() => close(false)}>Open “{lookAlike.name}”</Link></Button>}
              <Button size="sm" variant="outline" disabled={busy} onClick={() => save(true)}>No, add a new site</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1"><Label htmlFor="qas-name">Site name</Label><Input id="qas-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
            <div className="space-y-1"><Label htmlFor="qas-address">Address</Label><Textarea id="qas-address" value={address} onChange={(e) => setAddress(e.target.value)} rows={3} /></div>
          </div>
        )}
        {!lookAlike && (
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
            <Button disabled={busy} onClick={() => save(false)}>{busy ? "Adding…" : "Add site"}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
