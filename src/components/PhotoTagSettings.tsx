/**
 * PhotoTagSettings — org settings card for managing the photo tag options
 * engineers can apply to job photos.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Tag } from "lucide-react";
import { fetchPhotoTags, type PhotoTag } from "@/lib/photoTags";

const DEFAULT_COLOR = "#6b7280";

export default function PhotoTagSettings() {
  const { orgId, userRole } = useAuth();
  const { toast } = useToast();
  const isAdmin = userRole === "admin";
  const [tags, setTags] = useState<PhotoTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PhotoTag | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setTags(await fetchPhotoTags());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    const name = newName.trim();
    if (!name || !orgId) return;
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      toast({ title: "That tag already exists", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("photo_tags").insert({ org_id: orgId, name, color: newColor });
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't add tag", description: error.message, variant: "destructive" });
      return;
    }
    setNewName("");
    setNewColor(DEFAULT_COLOR);
    toast({ title: "Tag added" });
    void load();
  };

  const update = async (tag: PhotoTag, patch: Partial<Pick<PhotoTag, "name" | "color">>) => {
    const name = (patch.name ?? tag.name).trim();
    if (!name) return;
    if (name === tag.name && (patch.color ?? tag.color) === tag.color) return;
    setTags((prev) => prev.map((t) => (t.id === tag.id ? { ...t, ...patch, name } : t)));
    const { error } = await supabase.from("photo_tags").update({ name, color: patch.color ?? tag.color }).eq("id", tag.id);
    if (error) {
      toast({ title: "Couldn't save tag", description: error.message, variant: "destructive" });
      void load();
    }
  };

  const remove = async (tag: PhotoTag) => {
    const { error } = await supabase.from("photo_tags").delete().eq("id", tag.id);
    setPendingDelete(null);
    if (error) {
      toast({ title: "Couldn't delete tag", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `"${tag.name}" removed` });
    void load();
  };

  if (!isAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-accent" />
          <CardTitle className="text-lg">Photo Tags</CardTitle>
        </div>
        <CardDescription>
          Tags engineers can put on job photos — used for filtering evidence on a job.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            aria-label="New tag colour"
            className="h-10 w-12 cursor-pointer rounded border bg-background p-1"
          />
          <Input
            placeholder="New tag name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            className="max-w-xs"
          />
          <Button size="sm" onClick={add} disabled={saving || !newName.trim()}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tags yet.</p>
        ) : (
          <div className="space-y-1.5">
            {tags.map((tag) => (
              <div key={tag.id} className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5">
                <input
                  type="color"
                  value={tag.color}
                  onChange={(e) => update(tag, { color: e.target.value })}
                  aria-label={`Colour for ${tag.name}`}
                  className="h-8 w-10 cursor-pointer rounded border bg-background p-1"
                />
                <Input
                  defaultValue={tag.name}
                  onBlur={(e) => update(tag, { name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="h-9 max-w-xs text-sm"
                  aria-label={`Name for ${tag.name}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-9 w-9 text-muted-foreground hover:text-destructive"
                  onClick={() => setPendingDelete(tag)}
                  aria-label={`Delete ${tag.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The tag is removed from every photo that currently carries it. Photos themselves are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingDelete && remove(pendingDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
