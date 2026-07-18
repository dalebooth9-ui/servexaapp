import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, BookOpen, Search, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

type Item = {
  id: string;
  code: string | null;
  description: string;
  category: string | null;
  unit: string;
  unit_price: number;
  notes: string | null;
  is_active: boolean;
};

const EMPTY: Omit<Item, "id"> = {
  code: "",
  description: "",
  category: "",
  unit: "each",
  unit_price: 0,
  notes: "",
  is_active: true,
};

export default function PriceBook() {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState<Omit<Item, "id">>(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("price_book_items")
      .select("*")
      .order("description", { ascending: true });
    if (error) toast.error(error.message);
    setItems((data as Item[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      it.description.toLowerCase().includes(q) ||
      (it.code || "").toLowerCase().includes(q) ||
      (it.category || "").toLowerCase().includes(q),
    );
  }, [items, search]);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setDialogOpen(true);
  };
  const openEdit = (it: Item) => {
    setEditing(it);
    const { id, ...rest } = it;
    setForm(rest);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!user) return;
    if (!form.description.trim()) return toast.error("Description is required");
    setBusy(true);
    const payload: any = {
      code: form.code?.trim() || null,
      description: form.description.trim(),
      category: form.category?.trim() || null,
      unit: form.unit.trim() || "each",
      unit_price: Number(form.unit_price) || 0,
      notes: form.notes?.trim() || null,
      is_active: form.is_active,
    };
    let err: any = null;
    if (editing) {
      const { error } = await (supabase as any)
        .from("price_book_items").update(payload).eq("id", editing.id);
      err = error;
    } else {
      const { data: prof } = await supabase
        .from("profiles").select("org_id").eq("user_id", user.id).maybeSingle();
      const org_id = (prof as any)?.org_id;
      if (!org_id) { setBusy(false); return toast.error("No organisation"); }
      const { error } = await (supabase as any)
        .from("price_book_items").insert({ ...payload, org_id, created_by: user.id });
      err = error;
    }
    setBusy(false);
    if (err) return toast.error(err.message);
    toast.success(editing ? "Updated" : "Added");
    setDialogOpen(false);
    setEditing(null);
    setForm(EMPTY);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any)
      .from("price_book_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  return (
    <div className="container max-w-5xl py-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" /> Price Book
          </h1>
          <p className="text-sm text-muted-foreground">
            Reusable remedial line items — used when drafting quotes from defects.
          </p>
        </div>
        <Button onClick={openNew} size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> New line
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search description, code, category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground text-sm">
            No price book lines yet. Add your first common remedial line.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {filtered.map((it) => (
            <Card key={it.id}>
              <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {it.code && (
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                        {it.code}
                      </span>
                    )}
                    <span className="font-medium">{it.description}</span>
                    {it.category && (
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {it.category}
                      </Badge>
                    )}
                    {!it.is_active && <Badge variant="secondary">inactive</Badge>}
                  </div>
                  {it.notes && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{it.notes}</p>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-semibold">
                    £{Number(it.unit_price).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-muted-foreground">per {it.unit}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(it)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete price line?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This cannot be undone. Existing quotes are unaffected.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => remove(it.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) { setEditing(null); setForm(EMPTY); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit price line" : "New price line"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="text-xs text-muted-foreground">Code (optional)</label>
                <Input
                  value={form.code || ""}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="ARV-25"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Description</label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Supply & fit 25mm air release valve"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Category</label>
                <Input
                  value={form.category || ""}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="dry riser"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Unit</label>
                <Input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="each"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Unit price (£)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={String(form.unit_price)}
                  onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notes</label>
              <Textarea
                value={form.notes || ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Active
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
