import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getCurrentOrgId } from "@/lib/orgStoragePath";

export default function OfficeEmailSettings() {
  const { toast } = useToast();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const id = await getCurrentOrgId();
      setOrgId(id);
      if (!id) return;
      const { data } = await supabase.from("organisations").select("office_email").eq("id", id).maybeSingle();
      setEmail((data as any)?.office_email || "");
    })();
  }, []);

  const save = async () => {
    const v = email.trim();
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { toast({ title: "Enter a valid email", variant: "destructive" }); return; }
    if (!orgId) return;
    setSaving(true);
    const { error } = await supabase.from("organisations").update({ office_email: v || null } as any).eq("id", orgId);
    setSaving(false);
    toast(error ? { title: "Could not save", description: error.message, variant: "destructive" } : { title: "Office email saved" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Office email</CardTitle>
        <CardDescription>Engineer report submissions and "Message office" notes are emailed here.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row gap-2">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="office@yourcompany.co.uk" />
        <Button onClick={save} disabled={saving}>Save</Button>
      </CardContent>
    </Card>
  );
}
