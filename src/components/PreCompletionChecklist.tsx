import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ClipboardCheck, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

// BS 9990:2015 pre-handover default items
const BS9990_DEFAULTS: { label: string; category: string }[] = [
  // System Integrity
  { label: "All riser pipework installed and supported correctly", category: "System Integrity" },
  { label: "Inlet breeching connections labelled and accessible", category: "System Integrity" },
  { label: "Outlet valves installed at each landing and labelled", category: "System Integrity" },
  { label: "Air release valve fitted at highest point", category: "System Integrity" },
  { label: "Drain valve fitted at lowest point", category: "System Integrity" },
  // Testing
  { label: "System pressure tested to 1.5x working pressure for 2 hours – no drop", category: "Testing" },
  { label: "System flushed and free from debris", category: "Testing" },
  { label: "All outlet valves operate correctly", category: "Testing" },
  { label: "Inlet pressure gauge reading within spec", category: "Testing" },
  // Documentation
  { label: "RAMS reviewed and signed by site manager", category: "Documentation" },
  { label: "Commissioning certificate completed and signed", category: "Documentation" },
  { label: "As-built drawings provided", category: "Documentation" },
  { label: "BS 9990 compliance confirmed by supervising engineer", category: "Documentation" },
  // Signage & Access
  { label: "All fire brigade inlet signs fixed and compliant", category: "Signage & Access" },
  { label: "Landing outlet signage in place", category: "Signage & Access" },
  { label: "Clear access maintained to all inlets", category: "Signage & Access" },
  // Handover
  { label: "Site cleaned and waste removed", category: "Handover" },
  { label: "Defects / snag list reviewed with client", category: "Handover" },
  { label: "All snags resolved or agreed action plan in place", category: "Handover" },
  { label: "Handover pack issued to client", category: "Handover" },
];

interface ChecklistItem {
  id: string;
  job_id: string;
  label: string;
  category: string;
  sort_order: number;
  checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
  notes: string | null;
}

interface Props {
  jobId: string;
}

export default function PreCompletionChecklist({ jobId }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [addingItem, setAddingItem] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState("General");

  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from("pre_completion_checklist_items" as any)
      .select("*")
      .eq("job_id", jobId)
      .order("sort_order");
    setItems((data as unknown as ChecklistItem[]) || []);
    setLoading(false);
  }, [jobId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const seedDefaults = async () => {
    setSeeding(true);
    const toInsert = BS9990_DEFAULTS.map((d, i) => ({
      job_id: jobId,
      label: d.label,
      category: d.category,
      sort_order: i,
    }));
    const { error } = await supabase
      .from("pre_completion_checklist_items" as any)
      .insert(toInsert);
    if (error) { toast.error("Failed to seed checklist"); }
    else { toast.success("BS 9990 checklist loaded"); fetchItems(); }
    setSeeding(false);
  };

  const toggleItem = async (item: ChecklistItem) => {
    const now = new Date().toISOString();
    const update = item.checked
      ? { checked: false, checked_by: null, checked_at: null }
      : { checked: true, checked_by: user?.id, checked_at: now };
    await supabase.from("pre_completion_checklist_items" as any).update(update).eq("id", item.id);
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, ...update } : i));
  };

  const deleteItem = async (id: string) => {
    await supabase.from("pre_completion_checklist_items" as any).delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const addItem = async () => {
    if (!newLabel.trim()) return;
    const { data, error } = await supabase
      .from("pre_completion_checklist_items" as any)
      .insert({ job_id: jobId, label: newLabel.trim(), category: newCategory, sort_order: items.length })
      .select().single();
    if (error) { toast.error("Failed to add item"); return; }
    setItems((prev) => [...prev, data as unknown as ChecklistItem]);
    setNewLabel("");
    setAddingItem(false);
    toast.success("Item added");
  };

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  // Group by category
  const grouped = items.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    (acc[item.category] = acc[item.category] || []).push(item);
    return acc;
  }, {});

  const totalCount = items.length;
  const checkedCount = items.filter((i) => i.checked).length;
  const percent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading checklist…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          <div>
            <p className="font-semibold text-sm">Pre-Completion Checklist</p>
            <p className="text-xs text-muted-foreground">
              {checkedCount} / {totalCount} complete
              {totalCount > 0 && (
                <span className={`ml-2 font-medium ${percent === 100 ? "text-green-600" : "text-amber-600"}`}>
                  ({percent}%)
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {items.length === 0 && (
            <Button size="sm" variant="outline" onClick={seedDefaults} disabled={seeding}>
              {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />}
              Load BS 9990 Checklist
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setAddingItem(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Item
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${percent === 100 ? "bg-green-500" : "bg-primary"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center py-8 border border-dashed rounded-lg bg-muted/30">
          <ClipboardCheck className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No checklist items yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Load the BS 9990 template or add items manually.</p>
        </div>
      )}

      {/* Grouped items */}
      {Object.entries(grouped).map(([category, catItems]) => {
        const collapsed = collapsedCategories.has(category);
        const catChecked = catItems.filter((i) => i.checked).length;
        return (
          <div key={category} className="border rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors"
              onClick={() => toggleCategory(category)}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{category}</span>
                <Badge variant={catChecked === catItems.length ? "default" : "secondary"} className="text-xs">
                  {catChecked}/{catItems.length}
                </Badge>
              </div>
              {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
            </button>

            {!collapsed && (
              <div className="divide-y">
                {catItems.map((item) => (
                  <div key={item.id} className={`flex items-center gap-3 px-4 py-2.5 ${item.checked ? "bg-green-50 dark:bg-green-950/20" : ""}`}>
                    <Checkbox
                      checked={item.checked}
                      onCheckedChange={() => toggleItem(item)}
                      className="shrink-0"
                    />
                    <span className={`flex-1 text-sm ${item.checked ? "line-through text-muted-foreground" : ""}`}>
                      {item.label}
                    </span>
                    {item.checked && item.checked_at && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(item.checked_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </span>
                    )}
                    <Button
                      size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => deleteItem(item.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Add item form */}
      {addingItem && (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <div className="grid grid-cols-2 gap-2">
            <Input
              autoFocus
              placeholder="Item description…"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addItem(); if (e.key === "Escape") setAddingItem(false); }}
              className="col-span-2 text-sm"
            />
            <Input
              placeholder="Category (e.g. Testing)"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={addItem} disabled={!newLabel.trim()} className="flex-1">Add</Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingItem(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
