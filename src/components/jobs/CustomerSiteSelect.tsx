import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PickedSite = { id: string; name: string; address: string | null; postcode: string | null };

/** Site picker for a chosen customer; linking a site lets the job pick up its risers (print reports / QR stickers). */
export default function CustomerSiteSelect({ customerId, value, onChange }: {
  customerId: string; value: string; onChange: (site: PickedSite | null) => void;
}) {
  const [sites, setSites] = useState<PickedSite[]>([]);
  const [loading, setLoading] = useState(false);

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
  if (!loading && sites.length === 0) return <p className="text-xs text-muted-foreground">This customer has no sites yet. Without a site, Print reports and QR stickers can't be used.</p>;

  return (
    <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? null : sites.find((s) => s.id === v) || null)}>
      <SelectTrigger><SelectValue placeholder={loading ? "Loading sites…" : "Choose a site"} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">No site</SelectItem>
        {sites.map((s) => (
          <SelectItem key={s.id} value={s.id}>{s.name}{s.postcode ? ` — ${s.postcode}` : ""}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
