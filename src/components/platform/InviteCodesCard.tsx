import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Plus, Ban } from "lucide-react";
import { format } from "date-fns";

type Row = {
  id: string; code: string; note: string | null; expires_at: string | null;
  max_uses: number; uses: number; is_active: boolean; created_at: string;
};

function generateCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

export default function InviteCodesCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase.from("platform_invite_codes").select("*").order("created_at", { ascending: false });
    setRows((data as any[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    const code = generateCode();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("platform_invite_codes").insert({
      code, note: note.trim() || null, max_uses: Math.max(1, maxUses), created_by: user?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Code ${code} created`);
    setNote(""); setMaxUses(1); await load();
  };

  const revoke = async (id: string) => {
    const { error } = await supabase.from("platform_invite_codes").update({ is_active: false }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const copy = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Copied");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signup invite codes</CardTitle>
        <CardDescription>Generate one-off codes for new organisations to join Servexa.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Firetech" />
          </div>
          <div className="w-32">
            <Label className="text-xs">Max uses</Label>
            <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(parseInt(e.target.value) || 1)} />
          </div>
          <Button onClick={create}><Plus className="mr-1 h-4 w-4" /> Generate</Button>
        </div>

        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No codes yet.</p>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Note</TableHead><TableHead>Uses</TableHead><TableHead>Created</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.code}</TableCell>
                  <TableCell>{r.note ?? "—"}</TableCell>
                  <TableCell>{r.uses}/{r.max_uses}</TableCell>
                  <TableCell>{format(new Date(r.created_at), "d MMM")}</TableCell>
                  <TableCell>
                    {r.is_active
                      ? <Badge variant="default">Active</Badge>
                      : <Badge variant="secondary">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => copy(r.code)}><Copy className="h-3.5 w-3.5" /></Button>
                    {r.is_active && (
                      <Button variant="ghost" size="sm" onClick={() => revoke(r.id)}><Ban className="h-3.5 w-3.5" /></Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
