import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import QuickAddSiteDialog from "@/components/sites/QuickAddSiteDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PickedSite = { id: string; name: string; address: string | null; postcode: string | null };

/** Site picker for a chosen customer; linking a site lets the job pick up its risers (print reports / QR stickers). */
export default function CustomerSiteSelect({ customerId, value, onChange }: {
  customerId: string; value: string; onChange: (site: PickedSite | null) => void;
}) {
  const [sites, setSites] = useState<PickedSite[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const addDialog = <QuickAddSiteDialog open={adding} onOpenChange={setAdding} customerId={customerId}
    onCreated={(site) => { setSites((prev) => [...prev, site].sort((a, b) => (a.name || "").localeCompare(b.name || ""))); onChange(site); }} />;

  useEffect(() => {
    if (!customerId) { setSites([]); return; }
    let live = true;
    setLoading(true);
    (async () => {
      const { data: links } = await supabase.from("customer_sites").select("site_id").eq("customer_id", customerId);
      const ids = (links || []).map((l: any) => l.site_id).filter(Boolean);
      const rows: PickedSite[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase.from("sites").select("id, name, address, postcode").in("id", ids.slice(i, i + 200));
        rows.push(...((data || []) as any));
      }
      rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      if (live) { setSites(rows); setLoading(false); }
    })();
    return () => { live = false; };
  }, [customerId]);

  if (!customerId) return <p className="text-xs text-muted-foreground">Choose a customer first to pick a site.</p>;
  if (!loading && sites.length === 0) return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">This customer has no sites yet.</p>
      <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>Add a site for this customer</Button>
      {addDialog}
    </div>
  );

  return (
    <>
    <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? null : sites.find((s) => s.id === v) || null)}>
      <SelectTrigger><SelectValue placeholder={loading ? "Loading sites…" : "Choose a site"} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">No site</SelectItem>
        {sites.map((s) => (
          <SelectItem key={s.id} value={s.id}>{s.name}{s.postcode ? ` — ${s.postcode}` : ""}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    <Button type="button" size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => setAdding(true)}>Add another site for this customer</Button>
    {addDialog}
    </>
  );
}
