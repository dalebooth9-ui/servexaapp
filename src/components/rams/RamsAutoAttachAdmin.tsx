import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

type Category = { slug: string; name: string };
type SourceDoc = { key: string; kind: string; id: string; label: string };
type Mapping = { category_slug: string; source_kind: string; source_id: string };

/**
 * Lets an org admin choose, per job type, which existing RAMS document is copied
 * onto every new job of that type. Editable and removable at any time.
 */
export default function RamsAutoAttachAdmin() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sources, setSources] = useState<SourceDoc[]>([]);
  const [mapping, setMapping] = useState<Record<string, Mapping>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) { setLoading(false); return; }
      const { data: prof } = await supabase.from("profiles").select("org_id").eq("id", uid).maybeSingle();
      const org = (prof as any)?.org_id ?? null;
      setOrgId(org);

      const [catRes, docsRes, ramsRes, genRes, mapRes] = await Promise.all([
        supabase.from("job_categories" as any).select("slug, name").order("name"),
        supabase.from("rams_documents").select("id, contract_job_name, description_of_work, created_at").order("created_at", { ascending: false }).limit(100),
        supabase.from("rams").select("id, site_name, works_description, created_at").order("created_at", { ascending: false }).limit(100),
        supabase.from("generic_rams").select("id, contract_name, description, created_at").order("created_at", { ascending: false }).limit(100),
        supabase.from("rams_autoattach_map" as any).select("category_slug, source_kind, source_id"),
      ]);

      setCategories(((catRes.data as any[]) || []).map((c) => ({ slug: c.slug, name: c.name })));
      const list: SourceDoc[] = [
        ...((docsRes.data as any[]) || []).map((d) => ({
          key: `rams_documents:${d.id}`, kind: "rams_documents", id: d.id,
          label: d.contract_job_name || d.description_of_work?.slice(0, 60) || "RAMS document",
        })),
        ...((ramsRes.data as any[]) || []).map((r) => ({
          key: `rams:${r.id}`, kind: "rams", id: r.id,
          label: r.site_name || r.works_description?.slice(0, 60) || "RAMS",
        })),
        ...((genRes.data as any[]) || []).map((g) => ({
          key: `generic_rams:${g.id}`, kind: "generic_rams", id: g.id,
          label: g.contract_name || g.description?.slice(0, 60) || "Generic RAMS",
        })),
      ];
      setSources(list);
      const m: Record<string, Mapping> = {};
      ((mapRes.data as any[]) || []).forEach((r) => { m[r.category_slug] = r; });
      setMapping(m);
      setLoading(false);
    };
    load();
  }, []);

  const setFor = async (slug: string, value: string) => {
    if (!orgId) return;
    setSaving(slug);
    try {
      if (!value) {
        const { error } = await supabase.from("rams_autoattach_map" as any).delete().eq("org_id", orgId).eq("category_slug", slug);
        if (error) throw error;
        setMapping((p) => { const n = { ...p }; delete n[slug]; return n; });
      } else {
        const [kind, id] = value.split(":");
        const { error } = await supabase
          .from("rams_autoattach_map" as any)
          .upsert({ org_id: orgId, category_slug: slug, source_kind: kind, source_id: id } as any, { onConflict: "org_id,category_slug" });
        if (error) throw error;
        setMapping((p) => ({ ...p, [slug]: { category_slug: slug, source_kind: kind, source_id: id } }));
      }
      toast({ title: "Saved" });
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <p className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading…</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Pick the RAMS to copy onto every new job of each type. The copy is a draft on the job —
        you can edit or delete it like any other RAMS.
      </p>
      {sources.length === 0 && (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No RAMS documents saved yet — create one on a job first, then come back to set it as the default.
        </p>
      )}
      <div className="divide-y rounded-md border">
        {categories.map((c) => {
          const cur = mapping[c.slug];
          const value = cur ? `${cur.source_kind}:${cur.source_id}` : "";
          return (
            <div key={c.slug} className="flex flex-wrap items-center gap-3 p-3">
              <span className="min-w-[180px] flex-1 text-sm font-medium">{c.name}</span>
              <select
                className="h-9 min-w-[260px] rounded-md border bg-background px-2 text-sm"
                value={value}
                disabled={saving === c.slug}
                onChange={(e) => setFor(c.slug, e.target.value)}
              >
                <option value="">No RAMS attached automatically</option>
                {sources.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
