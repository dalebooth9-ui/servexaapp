import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Library, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface LibraryPart {
  id: string;
  name: string;
  unit_cost: number;
  sell_price: number;
  supplier: string | null;
  part_number: string | null;
  category: string;
}

export default function PartsLibraryPicker({
  open,
  onOpenChange,
  jobId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  onAdded: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [parts, setParts] = useState<LibraryPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setQuantities({});
    setSearch("");
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("parts_library")
        .select("id, name, unit_cost, sell_price, supplier, part_number, category")
        .order("name", { ascending: true });
      setParts((data as any) || []);
      setLoading(false);
    })();
  }, [open]);

  const filtered = parts.filter((p) => {
    const q = search.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) ||
      (p.part_number || "").toLowerCase().includes(q) ||
      (p.supplier || "").toLowerCase().includes(q);
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
        if (!quantities[id]) setQuantities((q) => ({ ...q, [id]: 1 }));
      }
      return n;
    });
  };

  const handleAdd = async () => {
    if (!user || selected.size === 0) return;
    setAdding(true);
    const rows = Array.from(selected).map((id) => {
      const part = parts.find((p) => p.id === id)!;
      return {
        job_id: jobId,
        name: part.name,
        quantity: quantities[id] || 1,
        unit_cost: part.unit_cost,
        sell_price: part.sell_price,
        notes: [part.part_number && `#${part.part_number}`, part.supplier].filter(Boolean).join(" — ") || null,
        added_by: user.id,
      };
    });

    const { error } = await supabase.from("job_parts" as any).insert(rows as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${rows.length} part(s) added from library` });
      onAdded();
      onOpenChange(false);
    }
    setAdding(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5" /> Pick from Parts Library
          </DialogTitle>
        </DialogHeader>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search parts, suppliers, part numbers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Loading library...</p>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Library className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p className="text-sm">{parts.length === 0 ? "Parts library is empty." : "No matching parts."}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Part</TableHead>
                <TableHead className="text-sm">Part #</TableHead>
                <TableHead className="text-sm">Supplier</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right w-20">Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((part) => (
                <TableRow key={part.id} className={selected.has(part.id) ? "bg-muted/50" : ""}>
                  <TableCell>
                    <Checkbox checked={selected.has(part.id)} onCheckedChange={() => toggleSelect(part.id)} />
                  </TableCell>
                  <TableCell className="font-medium">{part.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{part.part_number || "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{part.supplier || "—"}</TableCell>
                  <TableCell className="text-right">£{Number(part.unit_cost).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    {selected.has(part.id) ? (
                      <Input
                        type="number" min="1" step="1"
                        className="h-8 w-20 text-right text-sm"
                        value={quantities[part.id] || 1}
                        onChange={(e) => setQuantities((q) => ({ ...q, [part.id]: parseInt(e.target.value) || 1 }))}
                      />
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {selected.size > 0 && (
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={adding}>
              {adding ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Library className="mr-1 h-4 w-4" />}
              Add {selected.size} Part(s)
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
