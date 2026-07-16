import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Save, RefreshCcw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Article = {
  id: string;
  slug: string;
  route_pattern: string | null;
  title: string;
  purpose: string;
  steps: { heading: string; items: string[] }[];
  common_problems: { problem: string; fix: string }[];
  related_slugs: string[];
  keywords: string[];
  source_paths: string[];
  last_updated: string;
};

const STALE_DAYS = 90;

export default function HelpArticlesAdmin() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Article | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("help_articles" as any)
      .select("*")
      .order("slug");
    if (error) {
      toast.error("Failed to load help articles");
    } else {
      setArticles((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const selected = articles.find((a) => a.id === selectedId) || null;
  useEffect(() => { setDraft(selected ? JSON.parse(JSON.stringify(selected)) : null); }, [selectedId, selected?.last_updated]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const { error } = await supabase
      .from("help_articles" as any)
      .update({
        title: draft.title,
        purpose: draft.purpose,
        route_pattern: draft.route_pattern,
        steps: draft.steps as any,
        common_problems: draft.common_problems as any,
        related_slugs: draft.related_slugs,
        keywords: draft.keywords,
      })
      .eq("id", draft.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Article updated");
    load();
  };

  const stale = (a: Article) => {
    const days = (Date.now() - new Date(a.last_updated).getTime()) / (1000 * 60 * 60 * 24);
    return days > STALE_DAYS;
  };

  const filtered = articles.filter((a) =>
    !filter ||
    a.slug.toLowerCase().includes(filter.toLowerCase()) ||
    a.title.toLowerCase().includes(filter.toLowerCase())
  );

  const staleCount = articles.filter(stale).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Help Articles</CardTitle>
        </div>
        <CardDescription>
          Knowledge base powering the in-app AI Help Assistant. One entry per page/feature. When you ship a UI change, edit the matching article here so the assistant stays accurate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Input placeholder="Filter by slug or title…" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-sm" />
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
          <div className="ml-auto text-xs text-muted-foreground">
            {articles.length} articles
            {staleCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-warning">
                <AlertTriangle className="h-3 w-3" /> {staleCount} not updated in {STALE_DAYS}+ days
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
          {/* List */}
          <div className="border rounded-md max-h-[520px] overflow-auto">
            {filtered.map((a) => {
              const isSel = a.id === selectedId;
              const isStale = stale(a);
              return (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className={`w-full text-left px-3 py-2 border-b last:border-b-0 text-xs hover:bg-muted/50 ${isSel ? "bg-muted" : ""}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium truncate">{a.title}</span>
                    {isStale && <AlertTriangle className="h-3 w-3 text-warning shrink-0" />}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {a.slug} · {a.route_pattern || "—"}
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="p-4 text-xs text-muted-foreground">No articles match.</div>
            )}
          </div>

          {/* Editor */}
          <div className="space-y-3">
            {!draft && <p className="text-xs text-muted-foreground">Pick an article from the list to edit.</p>}
            {draft && (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{draft.slug}</Badge>
                  <Badge variant="secondary">{draft.route_pattern || "no route"}</Badge>
                  <span className="text-[11px] text-muted-foreground ml-auto">
                    Last updated {new Date(draft.last_updated).toLocaleString("en-GB")}
                    {stale(draft) && <span className="text-warning ml-1">(stale)</span>}
                  </span>
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs">Title</Label>
                  <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs">Route pattern</Label>
                  <Input value={draft.route_pattern || ""} onChange={(e) => setDraft({ ...draft, route_pattern: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs">Purpose (what the page is for)</Label>
                  <Textarea rows={3} value={draft.purpose} onChange={(e) => setDraft({ ...draft, purpose: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs">Steps (JSON: [&#123;heading, items:[…]&#125;])</Label>
                  <Textarea
                    rows={8}
                    className="font-mono text-[11px]"
                    value={JSON.stringify(draft.steps, null, 2)}
                    onChange={(e) => {
                      try { setDraft({ ...draft, steps: JSON.parse(e.target.value) }); } catch { /* ignore parse until valid */ }
                    }}
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs">Common problems (JSON: [&#123;problem, fix&#125;])</Label>
                  <Textarea
                    rows={5}
                    className="font-mono text-[11px]"
                    value={JSON.stringify(draft.common_problems, null, 2)}
                    onChange={(e) => {
                      try { setDraft({ ...draft, common_problems: JSON.parse(e.target.value) }); } catch { /* ignore */ }
                    }}
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <Label className="text-xs">Related slugs (comma-separated)</Label>
                    <Input
                      value={draft.related_slugs.join(", ")}
                      onChange={(e) => setDraft({ ...draft, related_slugs: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Keywords (comma-separated)</Label>
                    <Input
                      value={draft.keywords.join(", ")}
                      onChange={(e) => setDraft({ ...draft, keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={save} disabled={saving}>
                    <Save className="h-3.5 w-3.5 mr-1.5" /> {saving ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
