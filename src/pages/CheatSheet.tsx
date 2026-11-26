import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Plus, Pencil, Trash2 } from "lucide-react";
import { plainError } from "@/lib/plainError";
import { filterCheat, sectionList, type CheatEntry } from "@/lib/cheatSheet";

export default function CheatSheet() {
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin";
  const [entries, setEntries] = useState<CheatEntry[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Partial<CheatEntry> | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("cheat_sheet_entries").select("id, section, title, body, sort_order").order("sort_order").order("title");
    if (error) toast.error("Cheat sheet not loaded", { description: plainError(error) });
    setEntries((data as CheatEntry[]) || []); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!edit?.section || !edit.title?.trim()) return;
    const row = { section: edit.section, title: edit.title.trim(), body: edit.body?.trim() || null, updated_at: new Date().toISOString() };
    const { data: u } = await supabase.auth.getUser();
    const { error } = edit.id
      ? await supabase.from("cheat_sheet_entries").update(row as any).eq("id", edit.id)
      : await supabase.from("cheat_sheet_entries").insert({ ...row, created_by: u.user?.id } as any);
    if (error) { toast.error("Not saved", { description: plainError(error) }); return; }
    setEdit(null); load();
  };
  const remove = async (e: CheatEntry) => {
    if (!confirm(`Delete "${e.title}"?`)) return;
    const { error } = await supabase.from("cheat_sheet_entries").delete().eq("id", e.id);
    if (error) toast.error("Not deleted", { description: plainError(error) }); else load();
  };

  const shown = filterCheat(entries, q);
  const sections = sectionList(entries);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-1 py-2">
      <div>
        <h1 className="text-2xl font-bold">Cheat sheet</h1>
        <p className="text-sm text-muted-foreground">Quick reference for site work.</p>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Search the cheat sheet" placeholder="Search e.g. Viking, 68°, key" className="h-12 pl-9 text-base" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading && <p className="text-muted-foreground">Loading…</p>}
      {sections.map((sec) => {
        const items = shown.filter((e) => e.section === sec);
        if (q && !items.length) return null;
        return (
          <section key={sec} className="rounded-xl border bg-card">
            <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <h2 className="font-semibold">{sec}</h2>
              {isAdmin && <Button size="sm" variant="outline" onClick={() => setEdit({ section: sec, title: "", body: "" })}><Plus className="mr-1 h-4 w-4" />Add</Button>}
            </header>
            <div className="divide-y">
              {!items.length && <p className="px-4 py-3 text-sm text-muted-foreground">Nothing added yet.</p>}
              {items.map((e) => (
                <div key={e.id} className="flex items-start gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words">{e.title}</p>
                    {e.body && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{e.body}</p>}
                  </div>
                  {isAdmin && <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" aria-label={`Edit ${e.title}`} onClick={() => setEdit(e)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label={`Delete ${e.title}`} className="text-destructive" onClick={() => remove(e)}><Trash2 className="h-4 w-4" /></Button>
                  </div>}
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {q && !shown.length && <p className="text-muted-foreground">No matches.</p>}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Edit note" : "Add note"}</DialogTitle></DialogHeader>
          {edit && <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{edit.section}</p>
            <div className="space-y-1"><Label htmlFor="cs-title">Title</Label><Input id="cs-title" value={edit.title || ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="cs-body">Details</Label><Textarea id="cs-body" rows={5} value={edit.body || ""} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></div>
          </div>}
          <DialogFooter><Button onClick={save} disabled={!edit?.title?.trim()}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
