import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireCurrentOrgId } from "@/lib/tenantQueries";

/** Company details → brand colour used for printed watermarks and accents. */
export default function CompanyBrandColourCard() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [colour, setColour] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { (async () => {
    const id = await requireCurrentOrgId(); setOrgId(id);
    const { data } = await supabase.from("organisations").select("primary_color").eq("id", id).maybeSingle();
    setColour((data as any)?.primary_color || "");
  })().catch(() => {}); }, []);
  const valid = !colour || /^#[0-9a-f]{6}$/i.test(colour);
  const save = async (value: string | null) => {
    if (!orgId) return; setSaving(true);
    const { error } = await supabase.from("organisations").update({ primary_color: value } as any).eq("id", orgId);
    setSaving(false);
    if (error) toast.error("Only company admins can change the brand colour."); else { setColour(value || ""); toast.success("Brand colour saved"); }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Company details — brand colour</CardTitle>
        <CardDescription>Used for the faint watermark and colour accents on printed paperwork. Leave blank for a neutral grey watermark.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="brand-colour">Brand colour</Label>
          <div className="flex gap-2">
            <input type="color" aria-label="Pick brand colour" value={valid && colour ? colour : "#808080"} onChange={e => setColour(e.target.value)} className="h-10 w-12 cursor-pointer rounded border border-input bg-background" />
            <Input id="brand-colour" value={colour} onChange={e => setColour(e.target.value.trim())} placeholder="#1F4E79" className="w-32 font-mono" />
          </div>
        </div>
        <Button disabled={!valid || saving} onClick={() => save(colour || null)}>Save</Button>
        {colour && <Button variant="outline" disabled={saving} onClick={() => save(null)}>Clear</Button>}
      </CardContent>
    </Card>
  );
}
