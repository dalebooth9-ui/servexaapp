import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flame, Search, Download, Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const ENTRY_TYPES = [
  { value: "inspection", label: "Inspection" },
  { value: "test", label: "Test" },
  { value: "fault", label: "Fault" },
  { value: "repair", label: "Repair" },
  { value: "false_alarm", label: "False alarm" },
  { value: "evacuation_drill", label: "Evacuation drill" },
  { value: "maintenance", label: "Maintenance" },
  { value: "other", label: "Other" },
];

const TYPE_COLORS: Record<string, string> = {
  inspection: "bg-blue-100 text-blue-800 border-blue-200",
  test: "bg-purple-100 text-purple-800 border-purple-200",
  fault: "bg-red-100 text-red-800 border-red-200",
  repair: "bg-orange-100 text-orange-800 border-orange-200",
  false_alarm: "bg-yellow-100 text-yellow-800 border-yellow-200",
  evacuation_drill: "bg-emerald-100 text-emerald-800 border-emerald-200",
  maintenance: "bg-cyan-100 text-cyan-800 border-cyan-200",
  other: "bg-gray-100 text-gray-800 border-gray-200",
};

interface Entry {
  id: string;
  entry_type: string;
  title: string;
  description: string | null;
  date_of_event: string;
  recorded_by: string | null;
  bs_standard: string | null;
  linked_job_id: string | null;
}

interface Site {
  id: string;
  name: string;
  address: string | null;
  postcode: string | null;
}

export default function FireLog() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [linkedJobs, setLinkedJobs] = useState<Record<string, string>>({});
  const [filterType, setFilterType] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      setLoading(true);

      const { data: tokenRow, error: tokenErr } = await supabase
        .from("fire_log_tokens" as any)
        .select("id, site_id, is_active")
        .eq("token", token)
        .maybeSingle();

      if (tokenErr || !tokenRow || !(tokenRow as any).is_active) {
        setError("Unable to access fire log — Invalid or expired token");
        setLoading(false);
        return;
      }

      const siteId = (tokenRow as any).site_id;
      const [{ data: siteData }, { data: entriesData }] = await Promise.all([
        supabase.from("sites").select("id, name, address, postcode").eq("id", siteId).maybeSingle(),
        supabase
          .from("fire_log_entries" as any)
          .select("*")
          .eq("site_id", siteId)
          .order("date_of_event", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

      setSite(siteData as any);
      const ents = (entriesData as any as Entry[]) || [];
      setEntries(ents);

      const jobIds = ents.map((e) => e.linked_job_id).filter(Boolean) as string[];
      if (jobIds.length > 0) {
        const { data: jobs } = await supabase
          .from("jobs")
          .select("id, reference_number")
          .in("id", jobIds);
        const map: Record<string, string> = {};
        (jobs || []).forEach((j: any) => { map[j.id] = j.reference_number; });
        setLinkedJobs(map);
      }
      setLoading(false);
    };
    load();
  }, [token]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (filterType !== "all" && e.entry_type !== filterType) return false;
      if (!s) return true;
      return (
        e.title.toLowerCase().includes(s) ||
        (e.description || "").toLowerCase().includes(s) ||
        (e.recorded_by || "").toLowerCase().includes(s)
      );
    });
  }, [entries, filterType, search]);

  const downloadPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Fire Log Book", 14, 20);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(site?.name || "", 14, 28);
    if (site?.address) doc.text(site.address, 14, 34);
    doc.text(`Generated ${format(new Date(), "d MMM yyyy")}`, 14, 40);

    autoTable(doc, {
      startY: 48,
      head: [["Date", "Type", "Title / Description", "Recorded by", "BS Ref"]],
      body: filtered.map((e) => [
        format(new Date(e.date_of_event), "d MMM yyyy"),
        ENTRY_TYPES.find((t) => t.value === e.entry_type)?.label || e.entry_type,
        e.title + (e.description ? `\n${e.description}` : ""),
        e.recorded_by || "—",
        e.bs_standard || "—",
      ]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [234, 88, 12] },
      columnStyles: { 2: { cellWidth: 80 } },
    });

    doc.save(`fire-log-${(site?.name || "site").replace(/\s+/g, "-")}.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-orange-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Access denied</h1>
          <p className="text-slate-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-orange-600 flex items-center justify-center">
              <Flame className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Fire Log Book</h1>
              <p className="text-xs text-slate-500">Powered by Servexa</p>
            </div>
          </div>
          <Button onClick={downloadPdf} className="bg-orange-600 hover:bg-orange-700 text-white">
            <Download className="mr-2 h-4 w-4" /> Download PDF
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-xl font-semibold">{site?.name}</h2>
          {site?.address && (
            <p className="text-sm text-slate-600 mt-1">
              {site.address}{site.postcode ? `, ${site.postcode}` : ""}
            </p>
          )}
          <p className="text-xs text-slate-500 mt-3">
            {entries.length} {entries.length === 1 ? "entry" : "entries"} on record
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search entries…"
              className="pl-9 bg-white border-slate-200"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-56 bg-white border-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {ENTRY_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-lg border border-dashed border-slate-300 py-16 text-center text-slate-500">
            No entries match your filters.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((e) => (
              <article key={e.id} className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge variant="outline" className={TYPE_COLORS[e.entry_type] || TYPE_COLORS.other}>
                    {ENTRY_TYPES.find((t) => t.value === e.entry_type)?.label || e.entry_type}
                  </Badge>
                  <span className="text-sm text-slate-500">
                    {format(new Date(e.date_of_event), "EEE d MMM yyyy")}
                  </span>
                  {e.bs_standard && (
                    <span className="text-xs font-semibold text-slate-700">{e.bs_standard}</span>
                  )}
                  {e.linked_job_id && linkedJobs[e.linked_job_id] && (
                    <span className="text-xs text-slate-500">Job {linkedJobs[e.linked_job_id]}</span>
                  )}
                </div>
                <h3 className="font-semibold text-slate-900">{e.title}</h3>
                {e.description && (
                  <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{e.description}</p>
                )}
                {e.recorded_by && (
                  <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                    Recorded by <span className="font-medium text-slate-700">{e.recorded_by}</span>
                  </p>
                )}
              </article>
            ))}
          </div>
        )}

        <footer className="text-center text-xs text-slate-400 py-6">
          This fire log is maintained digitally via{" "}
          <Link to="/" className="text-orange-600 hover:underline">Servexa</Link>
        </footer>
      </main>
    </div>
  );
}
