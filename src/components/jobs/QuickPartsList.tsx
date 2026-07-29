import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Package, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PartNameSuggestInput, { type SuggestedPart } from "@/components/parts/PartNameSuggestInput";

interface SimplePart {
  id: string;
  name: string;
  quantity: number;
  notes: string | null;
  added_by: string;
  sort_order: number;
}

/**
 * Engineer-facing materials list: part name + quantity, add, done.
 *
 * No library lookup required, no costs — the office can price it later.
 * Big touch targets for gloved field use; the name field carries the
 * dictation mic so it can be spoken in.
 */
export default function QuickPartsList({
  jobId,
  canEdit = true,
}: {
  jobId: string;
  canEdit?: boolean;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [parts, setParts] = useState<SimplePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");

  const load = async () => {
    const { data } = await supabase
      .from("job_parts" as any)
      .select("id, name, quantity, notes, added_by, sort_order")
      .eq("job_id", jobId)
      .order("sort_order", { ascending: true });
    setParts((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const add = async (picked?: SuggestedPart) => {
    const partName = (picked?.name || name).trim();
    if (!partName || !user) return;
    setSaving(true);
    const sort_order = parts.length ? Math.max(...parts.map((p) => p.sort_order || 0)) + 1 : 0;
    const row = {
      job_id: jobId,
      name: partName,
      quantity: parseFloat(qty) || 1,
      // Costs stay optional — the office can price this up later.
      unit_cost: picked?.unit_cost ?? 0,
      sell_price: picked?.sell_price ?? 0,
      notes: picked?.part_number ? `#${picked.part_number}` : null,
      added_by: user.id,
      sort_order,
    };
    const { data, error } = await supabase.from("job_parts" as any).insert(row as any).select().single();
    if (error) {
      toast({ title: "Couldn't add part", description: error.message, variant: "destructive" });
    } else {
      setParts((prev) => [...prev, data as any]);
      setName("");
      setQty("1");
    }
    setSaving(false);
  };

  const remove = async (id: string) => {
    const prev = parts;
    setParts((p) => p.filter((x) => x.id !== id));
    const { error } = await supabase.from("job_parts" as any).delete().eq("id", id);
    if (error) {
      setParts(prev);
      toast({ title: "Couldn't remove part", variant: "destructive" });
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading materials…</p>;

  return (
    <div className="space-y-3">
      {parts.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <Package className="h-4 w-4" /> Nothing used yet — add anything you fitted or used.
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {parts.map((p) => (
            <li key={p.id} className="flex items-center gap-3 p-3">
              <span className="min-w-[2.5rem] rounded-md bg-muted px-2 py-1 text-center text-base font-semibold">
                {p.quantity}×
              </span>
              <span className="min-w-0 flex-1 break-words text-base">{p.name}</span>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => remove(p.id)}
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[180px] flex-1">
            <PartNameSuggestInput
              value={name}
              onChange={setName}
              onPick={(part) => add(part)}
              onEnter={() => add()}
              placeholder="What did you use?"
              className="h-12 text-base"
            />
          </div>
          <Input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            aria-label="Quantity"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="h-12 w-20 text-center text-base"
          />
          <Button
            className="h-12 min-w-[96px] text-base"
            onClick={() => add()}
            disabled={saving || !name.trim()}
          >
            {saving ? <Loader2 className="mr-1 h-5 w-5 animate-spin" /> : <Plus className="mr-1 h-5 w-5" />}
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
