import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, BookOpen, Download, LifeBuoy, Search } from "lucide-react";
import { toast } from "sonner";

export type GuideStep = { heading?: string; items?: string[] };
export type GuideProblem = { problem: string; solution: string };
export type Guide = {
  slug: string;
  title: string;
  purpose: string | null;
  steps: GuideStep[];
  common_problems: GuideProblem[];
  keywords: string[] | null;
  category: string | null;
  audience: string[] | null;
  guide_order: number | null;
  related_slugs: string[] | null;
};

const CATEGORY_ORDER = [
  "Getting started",
  "Jobs & planning",
  "In the field",
  "Paper & archive",
  "Templates",
  "RAMS & safety",
  "Office review",
  "Defects & money",
  "Customers",
  "AI assistant",
  "Settings & admin",
];

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function useGuides() {
  const { userRole } = useAuth();
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("help_articles")
        .select("slug,title,purpose,steps,common_problems,keywords,category,audience,guide_order,related_slugs")
        .eq("is_guide", true)
        .order("guide_order", { ascending: true });
      if (cancelled) return;
      if (error) {
        toast.error("Could not load the guides");
        setLoading(false);
        return;
      }
      const rows: Guide[] = (data || []).map((r: any) => ({
        ...r,
        steps: asArray<GuideStep>(r.steps),
        common_problems: asArray<GuideProblem>(r.common_problems),
      }));
      const role = userRole === "engineer" ? "engineer" : "admin";
      setGuides(rows.filter((g) => !g.audience?.length || g.audience.includes(role)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userRole]);

  return { guides, loading };
}

function GuideBody({ guide }: { guide: Guide }) {
  return (
    <div className="space-y-6">
      {guide.purpose && <p className="text-muted-foreground">{guide.purpose}</p>}
      {guide.steps.map((step, i) => (
        <section key={i} className="space-y-2">
          {step.heading && <h2 className="text-base font-semibold">{i + 1}. {step.heading}</h2>}
          <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
            {asArray<string>(step.items).map((item, j) => <li key={j}>{item}</li>)}
          </ol>
        </section>
      ))}
      {guide.common_problems.length > 0 && (
        <section className="space-y-2 rounded-lg border bg-muted/40 p-4">
          <h2 className="text-base font-semibold">Common problems</h2>
          <dl className="space-y-2 text-sm">
            {guide.common_problems.map((p, i) => (
              <div key={i}>
                <dt className="font-medium">{p.problem}</dt>
                <dd className="text-muted-foreground">{p.solution}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}

export default function HelpGuides() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const { guides, loading } = useGuides();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const categories = useMemo(() => {
    const found = Array.from(new Set(guides.map((g) => g.category || "Other")));
    return found.sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [guides]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return guides.filter((g) => {
      if (category && (g.category || "Other") !== category) return false;
      if (!q) return true;
      const hay = [g.title, g.purpose, (g.keywords || []).join(" "), JSON.stringify(g.steps)]
        .join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [guides, query, category]);

  const current = slug ? guides.find((g) => g.slug === slug) : null;

  async function exportEngineerBundle() {
    setExporting(true);
    try {
      const { exportEngineerGuidesPdf } = await import("@/lib/engineerGuidesPdf");
      const engineerGuides = guides.filter((g) => g.audience?.includes("engineer"));
      await exportEngineerGuidesPdf(engineerGuides);
    } catch {
      toast.error("Could not build the guide pack");
    } finally {
      setExporting(false);
    }
  }

  if (slug) {
    if (loading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
    if (!current) {
      return (
        <div className="mx-auto max-w-3xl p-6">
          <Button variant="ghost" onClick={() => navigate("/help")}><ArrowLeft className="mr-2 h-4 w-4" />All guides</Button>
          <p className="mt-6 text-muted-foreground">That guide is not available for your role, or it does not exist.</p>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/help")}><ArrowLeft className="mr-2 h-4 w-4" />All guides</Button>
        <div className="space-y-1">
          {current.category && <Badge variant="secondary">{current.category}</Badge>}
          <h1 className="text-2xl font-bold tracking-tight">{current.title}</h1>
        </div>
        <GuideBody guide={current} />
        {!!current.related_slugs?.length && (
          <div className="space-y-2 border-t pt-4">
            <h2 className="text-sm font-semibold">Related guides</h2>
            <div className="flex flex-wrap gap-2">
              {current.related_slugs.map((s) => {
                const g = guides.find((x) => x.slug === s);
                return g ? <Link key={s} to={`/help/${s}`}><Badge variant="outline">{g.title}</Badge></Link> : null;
              })}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
          <LifeBuoy className="h-4 w-4" />
          Still stuck? Ask the assistant, or raise a support ticket.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BookOpen className="h-6 w-6 text-primary" />Help &amp; guides
        </h1>
        <p className="text-muted-foreground">Step-by-step guides for every part of Servexa, in plain English.</p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 pl-9"
            placeholder="Search guides…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" className="h-11" onClick={exportEngineerBundle} disabled={exporting || loading}>
          <Download className="mr-2 h-4 w-4" />{exporting ? "Building…" : "Engineer guide pack (PDF)"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={category === null ? "default" : "outline"} onClick={() => setCategory(null)}>All</Button>
        {categories.map((c) => (
          <Button key={c} size="sm" variant={category === c ? "default" : "outline"} onClick={() => setCategory(c)}>{c}</Button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">No guides match “{query}”.</p>
      ) : (
        categories
          .filter((c) => filtered.some((g) => (g.category || "Other") === c))
          .map((c) => (
            <section key={c} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{c}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {filtered.filter((g) => (g.category || "Other") === c).map((g) => (
                  <Link key={g.slug} to={`/help/${g.slug}`}>
                    <Card className="h-full transition-colors hover:border-primary/60">
                      <CardHeader className="pb-2"><CardTitle className="text-base">{g.title}</CardTitle></CardHeader>
                      <CardContent className="text-sm text-muted-foreground">
                        {g.purpose}
                        {userRole !== "engineer" && g.audience?.includes("engineer") && (
                          <Badge variant="outline" className="ml-2 align-middle">Engineer</Badge>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}
