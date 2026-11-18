import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { quickAddSite } from "@/lib/quickAddSite";
import { useLookAlike, LookAlikeNotice, findExistingLookAlike, loadNamesForCheck, type NamedRow } from "@/components/shared/LookAlikeNotice";

type Site = { id: string; name: string; address: string | null; postcode: string | null };

/** Add a site with only a name and address; warns about look-alike names but never merges. */
export default function QuickAddSiteDialog({ open, onOpenChange, customerId, customerName, onCreated, onUseExisting }: {
  open: boolean; onOpenChange: (v: boolean) => void; customerId?: string | null; customerName?: string;
  onCreated?: (site: Site) => void; onUseExisting?: (site: { id: string; name: string }) => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [finalMatch, setFinalMatch] = useState<NamedRow | null>(null);
  const askCustomer = !customerId;
  const [customers, setCustomers] = useState<NamedRow[]>([]);
  const [chosenCustomer, setChosenCustomer] = useState<NamedRow | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const live = useLookAlike("site", name, open);

  useEffect(() => {
    if (open && askCustomer && !customers.length) loadNamesForCheck("customer").then(setCustomers);
  }, [open, askCustomer, customers.length]);

  const reset = () => { setName(""); setAddress(""); setFinalMatch(null); setChosenCustomer(null); live.reset(); };
  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const useExisting = (m: NamedRow) => {
    if (onUseExisting) onUseExisting(m); else navigate(`/sites?site=${m.id}`);
    close(false);
  };

  const save = async (skipCheck = false) => {
    if (!name.trim()) { toast.error("Please enter a site name."); return; }
    setBusy(true);
    try {
      if (!skipCheck) {
        const match = await findExistingLookAlike("site", name);
        if (match && !live.isDismissed(match.id)) { setFinalMatch(match); return; }
      }
      const site = await quickAddSite({ name, address, customerId: customerId || chosenCustomer?.id || null });
      toast.success(`Site “${site.name}” added`);
      onCreated?.(site);
      close(false);
    } catch (e: any) {
      toast.error("Site not added", { description: e?.message });
    } finally { setBusy(false); }
  };

  const shown = finalMatch || live.match;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add site{customerName ? ` for ${customerName}` : ""}</DialogTitle>
          <DialogDescription>Just a name and address. You can add buildings, risers and contacts later.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {askCustomer && (
            <div className="space-y-1">
              <Label>Customer (optional)</Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {chosenCustomer ? chosenCustomer.name : "Choose the customer this site belongs to"}
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search customers…" />
                    <CommandList>
                      <CommandEmpty>No customer found.</CommandEmpty>
                      <CommandGroup>
                        {chosenCustomer && <CommandItem value="__none__" onSelect={() => { setChosenCustomer(null); setPickerOpen(false); }}>No customer</CommandItem>}
                        {customers.map((c) => (
                          <CommandItem key={c.id} value={`${c.name} ${c.id}`} onSelect={() => { setChosenCustomer(c); setPickerOpen(false); }}>{c.name}</CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="qas-name">Site name</Label>
            <Input id="qas-name" value={name} onChange={(e) => { setName(e.target.value); setFinalMatch(null); }} autoFocus />
            {shown && (
              <LookAlikeNotice match={shown} onUse={() => useExisting(shown)}
                onDifferent={() => { live.dismiss(shown.id); if (finalMatch) { setFinalMatch(null); save(true); } }} />
            )}
          </div>
          <div className="space-y-1"><Label htmlFor="qas-address">Address</Label><Textarea id="qas-address" value={address} onChange={(e) => setAddress(e.target.value)} rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
          <Button disabled={busy} onClick={() => save(false)}>{busy ? "Adding…" : "Add site"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
