/**
 * Compact list of imported historic (pre-Servexa) reports for a site.
 * Newest first, with search and open-file button. Shown inline on the
 * Site page and used by the Previous-report fallback.
 */
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, History, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/dateFormat";
import { fuzzyFilter } from "@/lib/fuzzyMatch";
import { useToast } from "@/hooks/use-toast";

type Report = {
  id: string;
  report_date: string | null;
  report_type: string | null;
  report_type_label: string | null;
  original_filename: string;
  storage_path: string;
  mime_type: string | null;
  extracted_notes: string | null;
};

interface Props {
  siteId: string;
  /** Optional: caller may pass a preloaded list to avoid a round-trip. */
  initial?: Report[];
  /** Show delete buttons (admin-only pages). */
  canDelete?: boolean;
}

export default function HistoricReportsList({ siteId, initial, canDelete }: Props) {
  const { toast } = useToast();
  const [reports, setReports] = useState<Report[]>(initial || []);
  const [loading, setLoading] = useState(!initial);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("historic_reports")
        .select(
          "id, report_date, report_type, report_type_label, original_filename, storage_path, mime_type, extracted_notes",
        )
        .eq("site_id", siteId)
        .order("report_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setReports((data as Report[]) || []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId, initial]);

  const filtered = useMemo(
    () => fuzzyFilter(reports, query, (r) => [r.original_filename, r.report_type_label, r.report_type]),
    [reports, query],
  );

  const openFile = async (r: Report) => {
    const { data, error } = await supabase.storage
      .from("submissions")
      .createSignedUrl(r.storage_path, 60 * 5);
    if (error || !data?.signedUrl) {
      toast({ title: "Could not open file", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noreferrer");
  };

  const deleteReport = async (r: Report) => {
    if (!confirm(`Delete historic report "${r.original_filename}"? This cannot be undone.`)) return;
    const { error } = await (supabase as any)
      .from("historic_reports")
      .delete()
      .eq("id", r.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.storage.from("submissions").remove([r.storage_path]);
    setReports((prev) => prev.filter((x) => x.id !== r.id));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Historic reports</span>
        <Badge variant="outline" className="text-[10px]">{reports.length}</Badge>
        {reports.length > 4 && (
          <div className="relative ml-auto">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="h-7 pl-7 text-xs w-[180px]"
            />
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : reports.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No historic reports imported for this site yet.
        </p>
      ) : (
        <div className="rounded border divide-y">
          {filtered.map((r) => (
            <div key={r.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate" title={r.original_filename}>
                    {r.original_filename}
                  </span>
                  {r.report_type_label && (
                    <Badge variant="secondary" className="text-[9px]">
                      {r.report_type_label}
                    </Badge>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {formatDate(r.report_date, "date unknown")}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs"
                onClick={() => openFile(r)}
              >
                Open <ExternalLink className="h-3 w-3" />
              </Button>
              {canDelete && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteReport(r)}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
          {filtered.length === 0 && query && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No matches.</div>
          )}
        </div>
      )}
    </div>
  );
}
