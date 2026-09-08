import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, ExternalLink, FileText, Loader2, Sparkles } from "lucide-react";
import { draftQuoteFromDefects } from "@/lib/draftDefectQuote";
import { toast } from "sonner";

type Row = {
  id: string;
  title: string;
  description: string | null;
  severity: string | null;
  status: string;
  location_on_site: string | null;
  site_id: string | null;
  quote_id: string | null;
  source_kind: string | null;
};

const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  high: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  medium: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  low: "bg-muted text-muted-foreground",
};

/** Open defects across every site linked to this customer, with AI quote drafting. */
export default function CustomerDefectsCard({ customerId }: { customerId: string }) {
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin";
  const navigate = useNavigate();

  const [rows, setRows] = useState<Row[]>([]);
  const [siteNames, setSiteNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafting, setDrafting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: links } = await supabase
        .from("customer_sites")
        .select("site_id")
        .eq("customer_id", customerId);
      const siteIds = (links || []).map((l: any) => l.site_id).filter(Boolean);
      if (siteIds.length === 0) {
        if (!cancelled) { setRows([]); setLoading(false); }
        return;
      }
      const [{ data: defects }, { data: sites }] = await Promise.all([
        supabase
          .from("defects")
          .select("id, title, description, severity, status, location_on_site, site_id, quote_id, source_kind")
          .in("site_id", siteIds)
          .not("status", "in", "(resolved,deferred)")
          .order("created_at", { ascending: false }),
        supabase.from("sites").select("id, name").in("id", siteIds),
      ]);
      if (cancelled) return;
      setRows((defects || []) as Row[]);
      setSiteNames(Object.fromEntries((sites || []).map((s: any) => [s.id, s.name])));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [customerId]);

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const selectedSites = new Set(selectedRows.map((r) => r.site_id));
  const canDraft = selectedRows.length > 0 && selectedSites.size === 1 && !selectedRows.some((r) => r.quote_id);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleDraft = async () => {
    if (!canDraft) {
      toast.error("Pick defects from a single site that aren't already quoted.");
      return;
    }
    setDrafting(true);
    const result = await draftQuoteFromDefects(selectedRows.map((r) => r.id));
    setDrafting(false);
    if (result) navigate(`/invoices/${result.invoice_id}`);
  };

  if (loading) return null;
  if (rows.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Outstanding defects ({rows.length})
        </h2>
        <div className="flex gap-2">
          {isAdmin && selected.size > 0 && (
            <Button size="sm" variant="secondary" onClick={handleDraft} disabled={drafting}>
              {drafting ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
              Draft quote from {selected.size} selected
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link to="/defects">
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              All defects
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 divide-y">
          {rows.map((d) => (
            <div key={d.id} className="flex items-start gap-3 p-3">
              {isAdmin && !d.quote_id && (
                <Checkbox
                  className="mt-0.5"
                  checked={selected.has(d.id)}
                  onCheckedChange={() => toggle(d.id)}
                  aria-label={`Select ${d.title}`}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{d.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[d.site_id ? siteNames[d.site_id] : null, d.location_on_site].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {d.source_kind === "archive" && (
                  <Badge variant="outline" className="text-[10px]">From archive</Badge>
                )}
                {d.severity && (
                  <Badge variant="outline" className={`text-[10px] capitalize ${SEVERITY_STYLE[d.severity] || ""}`}>
                    {d.severity}
                  </Badge>
                )}
                {d.quote_id ? (
                  <Button variant="ghost" size="sm" title="View quote" onClick={() => navigate(`/invoices/${d.quote_id}`)}>
                    <FileText className="h-3.5 w-3.5 text-primary" />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
