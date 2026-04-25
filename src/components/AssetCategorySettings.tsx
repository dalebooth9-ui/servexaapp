import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAssetCategories } from "@/hooks/useAssetCategories";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AssetCategorySettings() {
  const { categories, loading, refetch } = useAssetCategories();
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const toSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    const slug = toSlug(name);
    if (categories.some((c) => c.slug === slug)) {
      toast({ title: "Category already exists", variant: "destructive" });
      return;
    }
    setAdding(true);
    const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order), -1);
    const { error } = await supabase.from("asset_categories" as any).insert({
      name,
      slug,
      sort_order: maxOrder + 1,
    } as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setNewName("");
      toast({ title: "Category added" });
      refetch();
    }
    setAdding(false);
  };

  const handleRename = async (id: string, oldName: string) => {
    const name = editName.trim();
    if (!name || name === oldName) {
      setEditingId(null);
      return;
    }
    const slug = toSlug(name);
    const { error } = await supabase
      .from("asset_categories" as any)
      .update({ name, slug } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Category renamed" });
      refetch();
    }
    setEditingId(null);
  };

  const handleDelete = async (id: string, name: string) => {
    const { error } = await supabase.from("asset_categories" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `"${name}" removed` });
      refetch();
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm("Are you sure you want to delete ALL asset categories? This cannot be undone.")) return;
    const ids = categories.map((c) => c.id);
    const { error } = await supabase.from("asset_categories" as any).delete().in("id", ids);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "All categories removed" });
      refetch();
    }
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-accent" />
          <CardTitle className="text-lg">Asset Categories</CardTitle>
        </div>
        <CardDescription>
          Manage the categories available when creating or filtering assets.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="New category name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Button onClick={handleAdd} disabled={adding || !newName.trim()} size="sm">
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
          {categories.length > 0 && (
            <Button onClick={handleDeleteAll} variant="destructive" size="sm">
              <Trash2 className="mr-1 h-4 w-4" /> Delete All
            </Button>
          )}
        </div>

        {categories.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((cat, i) => (
                <TableRow key={cat.id}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    {editingId === cat.id ? (
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(cat.id, cat.name);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onBlur={() => handleRename(cat.id, cat.name)}
                        autoFocus
                        className="h-7 text-sm"
                      />
                    ) : (
                      <span
                        className="cursor-pointer hover:underline"
                        onDoubleClick={() => {
                          setEditingId(cat.id);
                          setEditName(cat.name);
                        }}
                        title="Double-click to rename"
                      >
                        {cat.name}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">{cat.slug}</TableCell>
                  <TableCell>
                    <button
                      onClick={() => handleDelete(cat.id, cat.name)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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
