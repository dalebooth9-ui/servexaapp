import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Package, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ImportPartsDialog from "@/components/ImportPartsDialog";

interface JobPart {
  id: string;
  name: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  notes: string | null;
  added_by: string;
  created_at: string;
}

export default function JobParts({ jobId }: { jobId: string }) {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [parts, setParts] = useState<JobPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", quantity: "1", unit_cost: "0", notes: "" });
  const [importOpen, setImportOpen] = useState(false);

  const fetchParts = async () => {
    const { data } = await supabase
      .from("job_parts" as any)
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    setParts((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchParts(); }, [jobId]);

  const handleAdd = async () => {
    if (!form.name.trim() || !user) return;
    setAdding(true);
    const { error } = await supabase.from("job_parts" as any).insert({
      job_id: jobId,
      name: form.name.trim(),
      quantity: parseFloat(form.quantity) || 1,
      unit_cost: parseFloat(form.unit_cost) || 0,
      notes: form.notes.trim() || null,
      added_by: user.id,
    } as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setForm({ name: "", quantity: "1", unit_cost: "0", notes: "" });
      fetchParts();
      toast({ title: "Part added" });
    }
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("job_parts" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setParts((prev) => prev.filter((p) => p.id !== id));
      toast({ title: "Part removed" });
    }
  };

  const totalCost = parts.reduce((sum, p) => sum + (p.total_cost || 0), 0);

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading parts...</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[150px]">
          <Input placeholder="Part / material name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="w-20">
          <Input type="number" placeholder="Qty" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} min="0" step="1" />
        </div>
        <div className="w-24">
          <Input type="number" placeholder="Unit £" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} min="0" step="0.01" />
        </div>
        <div className="flex-1 min-w-[120px]">
          <Input placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <Button onClick={handleAdd} disabled={adding || !form.name.trim()} size="sm">
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
          <Upload className="mr-1 h-4 w-4" /> Import
        </Button>
      </div>

      {parts.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p className="text-sm">No parts or materials logged yet.</p>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part / Material</TableHead>
                <TableHead className="text-right w-20">Qty</TableHead>
                <TableHead className="text-right w-24">Unit Cost</TableHead>
                <TableHead className="text-right w-24">Total</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {parts.map((part) => (
                <TableRow key={part.id}>
                  <TableCell className="font-medium">{part.name}</TableCell>
                  <TableCell className="text-right">{part.quantity}</TableCell>
                  <TableCell className="text-right">£{Number(part.unit_cost).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-medium">£{Number(part.total_cost).toFixed(2)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{part.notes || "—"}</TableCell>
                  <TableCell>
                    {(userRole === "admin" || part.added_by === user?.id) && (
                      <button onClick={() => handleDelete(part.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="text-right text-sm font-semibold">
            Total: £{totalCost.toFixed(2)}
          </div>
        </>
      )}
      <ImportPartsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        jobId={jobId}
        onImported={fetchParts}
      />
    </div>
  );
}
