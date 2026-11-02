import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

interface Row {
  id: string; asset_tag: string | null; riser_location: string | null; outlets_count: number | null;
  status: string; site_id: string | null; last_inspection_at: string | null; last_inspection_result: string | null;
  sites: { name: string } | null;
}

/** Office table of every dry riser with inline editing of location and outlets. */
export default function DryRisersTable() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [blankOutlets, setBlankOutlets] = useState(false);
  const [faulty, setFaulty] = useState(false);

  const load = async () => {
    const all: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("assets")
        .select("id, asset_tag, riser_location, outlets_count, status, site_id, last_inspection_at, last_inspection_result, sites(name)")
        .or("asset_type.ilike.dry%riser%,category.ilike.dry%riser%")
        .order("riser_location").range(from, from + 999);
      if (error) { toast({ title: "Couldn't load dry risers", description: error.message, variant: "destructive" }); break; }
      all.push(...((data as any) || []));
      if (!data || data.length < 1000) break;
    }
    setRows(all);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const save = async (id: string, patch: Partial<Row>) => {
    const prev = rows;
    setRows((r) => r?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? null);
    const { error } = await supabase.from("assets").update({ ...patch, updated_at: new Date().toISOString() } as any).eq("id", id);
    if (error) { setRows(prev); toast({ title: "Not saved", description: error.message, variant: "destructive" }); }
  };

  const shown = useMemo(() => (rows || []).filter((r) => {
    if (blankOutlets && r.outlets_count != null) return false;
    if (faulty && r.status !== "faulty") return false;
    if (q) {
      const t = `${r.asset_tag || ""} ${r.riser_location || ""} ${r.sites?.name || ""}`.toLowerCase();
      if (!t.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [rows, q, blankOutlets, faulty]);

  if (!rows) return <div className="flex items-center gap-2 text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading dry risers…</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tag, location or site" className="max-w-xs" />
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={blankOutlets} onCheckedChange={(v) => setBlankOutlets(!!v)} /> Blank outlets</label>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={faulty} onCheckedChange={(v) => setFaulty(!!v)} /> Faulty</label>
        <span className="text-sm text-muted-foreground">{shown.length} of {rows.length}</span>
      </div>
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tag</TableHead><TableHead>Site</TableHead><TableHead>Riser location</TableHead>
              <TableHead className="w-28">Outlets</TableHead><TableHead>Status</TableHead><TableHead>Last inspection</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No dry risers match.</TableCell></TableRow>}
            {shown.map((r) => (
              <TableRow key={r.id}>
                <TableCell><Link to={`/assets/${r.id}`} className="font-mono text-primary hover:underline">{r.asset_tag || "—"}</Link></TableCell>
                <TableCell className="text-sm">{r.sites?.name || "—"}</TableCell>
                <TableCell>
                  <Input defaultValue={r.riser_location || ""} className="h-8 text-sm"
                    onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== r.riser_location) save(r.id, { riser_location: v }); }} />
                </TableCell>
                <TableCell>
                  <Input type="number" min={0} defaultValue={r.outlets_count ?? ""} className="h-8 text-sm"
                    onBlur={(e) => { const v = e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10)); if (v !== r.outlets_count) save(r.id, { outlets_count: v }); }} />
                </TableCell>
                <TableCell><Badge variant={r.status === "faulty" ? "destructive" : "secondary"} className="capitalize">{r.status}</Badge></TableCell>
                <TableCell className="text-sm">
                  {r.last_inspection_at ? format(new Date(r.last_inspection_at), "dd/MM/yyyy") : "—"}
                  {r.last_inspection_result ? ` · ${r.last_inspection_result}` : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
