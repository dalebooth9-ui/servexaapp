import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PdfCanvasViewer from "@/components/PdfCanvasViewer";
import { compareReports, findMostRecentPrevious, loadPreviousDefects, type CompareField, type PreviousReport } from "@/lib/reportComparison";
import { resolveSubmissionsSignedUrls } from "@/lib/resolveSubmissionsPath";
import { Eye, Loader2, X } from "lucide-react";

export default function ScanPreviousReport({ siteId, assetId, location, templateId, templateName, before, fields, answers, sheetUrls }: {
  siteId: string; assetId: string | null; location: string; templateId: string; templateName: string | null; before: string;
  fields: CompareField[]; answers: Record<string, any>; sheetUrls: string[];
}) {
  const [previous, setPrevious] = useState<PreviousReport | null>(null);
  const [defects, setDefects] = useState<{ id: string; title: string; status?: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setPrevious(null); setDefects([]); setView(false); setUrl(null); setError("");
    if (!siteId || !templateId || (!assetId && !location)) return;
    setLoading(true);
    (async () => {
      try {
        const result = await findMostRecentPrevious(supabase, { jobId: "00000000-0000-0000-0000-000000000000", siteId, riserAssetId: assetId, riserLocation: location, templateId, templateName, before: `${before.slice(0,10)}T00:00:00Z`, strictIdentity: true });
        if (!live) return;
        setPrevious(result.previous);
        if (result.previous?.source === "app") {
          const rows = await loadPreviousDefects(supabase, result.previous, assetId);
          if (live) setDefects(rows);
        }
      } catch { if (live) setError("Could not check the previous report. Please reopen review to try again."); }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [siteId, assetId, location, templateId, templateName, before]);
  const flags = useMemo(() => previous ? compareReports(fields, previous.answers, answers, defects, previous.unclear || []) : [], [previous, fields, answers, defects]);
  const open = async () => {
    if (!previous) return;
    setView(true); setLoading(true); setError("");
    try {
      if (previous.source === "archive") {
        const { data, error: e } = await supabase.from("archived_documents").select("report_pdf_path,file_paths").eq("id", previous.responseId).single();
        if (e) throw e;
        const paths = data.report_pdf_path ? [data.report_pdf_path] : data.file_paths || [];
        const resolved = await resolveSubmissionsSignedUrls(paths);
        if (!resolved.urls.length) throw new Error("PDF unavailable");
        setUrl(resolved.urls[0].signedUrl);
      } else {
        const [{ data: template, error: te }, { data: job, error: je }] = await Promise.all([
          supabase.from("job_sheet_templates").select("*").eq("id", templateId).single(),
          supabase.from("jobs").select("*,sites(name,address),customers(name)").eq("id", previous.jobId).single(),
        ]);
        if (te || je) throw te || je;
        const { generateJobSheetPdf } = await import("@/components/JobSheetPdfExport");
        const result = await generateJobSheetPdf(template as any, previous.answers, { ...job, customer: job.customers?.name, site: job.sites } as any, previous.jobId, "", previous.date);
        const bytes = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
        setUrl(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
      }
    } catch { setError("The previous PDF could not be opened. Its comparison checks are still shown below."); }
    finally { setLoading(false); }
  };
  useEffect(() => () => { if (url?.startsWith("blob:")) URL.revokeObjectURL(url); }, [url]);
  return <section className="border-y py-3 space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={!previous || loading} onClick={() => void open()}><Eye className="mr-1 h-4 w-4" />View last report</Button>
      <span className="text-sm">{loading ? "Checking last report…" : previous ? `Last report: ${previous.date ? format(new Date(previous.date), "d MMM yyyy") : "date unknown"}, ${flags.filter(f => f.level !== "unclear").length} differences` : !siteId ? "Choose the site to find the last report." : !assetId && !location ? "Choose the riser to find the last report." : "No previous report found for this site, riser and report type."}</span>
    </div>
    {error && <p className="text-sm text-destructive">{error}</p>}
    {flags.length > 0 && <div className="max-h-52 overflow-auto space-y-1">{flags.map(f => <div key={f.key} className="text-xs border-t pt-1"><Badge variant={f.level === "check" ? "destructive" : "outline"} className="mr-1">{f.level === "check" ? "Something looks wrong" : f.level === "unclear" ? "Unclear" : "Difference"}</Badge>{f.label}: {f.previous || "—"} → {f.current || "blank"} · {f.reason}</div>)}</div>}
    {view && <><Button size="sm" variant="ghost" onClick={() => setView(false)}><X className="mr-1 h-4 w-4" />Close last report</Button><div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="min-w-0"><p className="text-sm font-medium mb-1">Sheet being reviewed</p><div className="max-h-[65vh] overflow-auto space-y-2">{sheetUrls.map((src,i) => <img key={src} src={src} alt={`Current sheet page ${i+1}`} className="w-full object-contain" />)}</div></div>
      <div className="min-w-0"><p className="text-sm font-medium mb-1">Last report</p>{url ? <PdfCanvasViewer src={url} title="Last report" className="h-[65vh] w-full" /> : loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}</div>
    </div></>}
  </section>;
}