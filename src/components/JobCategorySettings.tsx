import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useJobCategories } from "@/hooks/useJobCategories";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, GripVertical, Tags } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function JobCategorySettings() {
  const { categories, loading, refetch } = useJobCategories();
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

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
    const { error } = await supabase.from("job_categories" as any).insert({
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

  const handleDelete = async (id: string, name: string) => {
    const { error } = await supabase.from("job_categories" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `"${name}" removed` });
      refetch();
    }
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Tags className="h-5 w-5 text-accent" />
          <CardTitle className="text-lg">Job Categories</CardTitle>
        </div>
        <CardDescription>
          Manage the categories available when creating or filtering jobs.
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
                  <TableCell className="font-medium">{cat.name}</TableCell>
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
