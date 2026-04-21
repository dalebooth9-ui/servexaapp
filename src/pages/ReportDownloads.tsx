import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2, Search, FileArchive } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type CompletedJob = {
  id: string;
  reference_number: string;
  name: string | null;
  updated_at: string;
  created_at: string;
  customers: { name: string | null } | null;
  sites: { name: string | null } | null;
};

const safe = (s: string) =>
  (s || "unknown").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();

function extractStoragePath(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl);
    const m = url.pathname.match(/\/object\/(?:public|sign)\/submissions\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

export default function ReportDownloads() {
  const [jobs, setJobs] = useState<CompletedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, reference_number, name, updated_at, created_at, customers(name), sites(name)")
        .eq("status", "completed")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) {
        toast({ title: "Failed to load jobs", description: error.message, variant: "destructive" });
      }
      setJobs((data as any[]) || []);
      setLoading(false);
    })();
  }, [toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) =>
      [j.reference_number, j.name, j.customers?.name, j.sites?.name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [jobs, search]);

  const downloadZip = async (job: CompletedJob) => {
    setBusyId(job.id);
    try {
      // 1. Fetch the full job (with relations) for the PDF generator
      const { data: fullJob, error: jobErr } = await supabase
        .from("jobs")
        .select("*, customers(*), sites(*)")
        .eq("id", job.id)
        .maybeSingle();
      if (jobErr || !fullJob) throw new Error(jobErr?.message || "Job not found");

      // 2. Build the report PDF using the same generator as CustomerReportPdf
      const pdfBase64 = await new Promise<string>(async (resolve, reject) => {
        try {
          const mod = await import("@/components/CustomerReportPdf");
          // Render the component headlessly via its onPdfGenerated callback.
          // We'll directly call the generator logic by simulating a click is messy —
          // instead reuse the public API by mounting via a tiny renderer.
          // Simpler: replicate by invoking the existing component through ReactDOM is overkill.
          // So we emit base64 by importing a helper: fall back to dynamic build.
          // (CustomerReportPdf encapsulates the generation; we trigger it via prop.)
          const React = await import("react");
          const ReactDOM = await import("react-dom/client");
          const container = document.createElement("div");
          container.style.display = "none";
          document.body.appendChild(container);
          const root = ReactDOM.createRoot(container);
          let resolved = false;
          const Component = mod.default;
          const handle = (b64: string) => {
            if (resolved) return;
            resolved = true;
            resolve(b64);
            setTimeout(() => {
              root.unmount();
              container.remove();
            }, 100);
          };
          root.render(
            React.createElement(Component, {
              jobId: job.id,
              job: fullJob,
              onPdfGenerated: (b64: string) => handle(b64),
              trigger: React.createElement("span", { id: `auto-trigger-${job.id}` }),
            })
          );
          // Auto-click the trigger after mount
          setTimeout(() => {
            const el = container.querySelector(`#auto-trigger-${job.id}`) as HTMLElement | null;
            if (el?.parentElement) (el.parentElement as HTMLElement).click();
          }, 50);
          // Safety timeout
          setTimeout(() => {
            if (!resolved) reject(new Error("PDF generation timed out"));
          }, 60000);
        } catch (e) {
          reject(e);
        }
      });

      // 3. Fetch all submissions (photos, notes, files) for the job
      const { data: submissions } = await supabase
        .from("submissions")
        .select("*")
        .eq("job_id", job.id)
        .order("created_at", { ascending: true });

      const zip = new JSZip();
      const customer = safe(fullJob.customers?.name || "customer");
      const ref = safe(fullJob.reference_number || "job");
      const rootDir = `${customer}/${ref}`;

      // Report PDF
      zip.file(
        `${rootDir}/Report/${ref}-report.pdf`,
        Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0))
      );

      // Manifest
      const lines: string[] = [
        `Job Reference: ${fullJob.reference_number || ""}`,
        `Customer: ${fullJob.customers?.name || ""}`,
        `Site: ${fullJob.sites?.name || ""}`,
        `Completed: ${fullJob.updated_at || fullJob.created_at}`,
        `Generated: ${new Date().toISOString()}`,
        "",
        `Files:`,
      ];

      // Categorise & download each submission file
      const subs = (submissions as any[]) || [];
      let imgCount = 0;
      let docCount = 0;
      for (const s of subs) {
        if (!s.file_url) continue;
        const path = extractStoragePath(s.file_url);
        if (!path) continue;
        try {
          const { data: blob, error: dlErr } = await supabase.storage.from("submissions").download(path);
          if (dlErr || !blob) continue;
          const buf = new Uint8Array(await blob.arrayBuffer());
          const ext = (s.file_name || path).split(".").pop()?.toLowerCase() || "bin";
          const isImage = ["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(ext);
          const folder = isImage ? "Images" : "Documents";
          const name = s.file_name || `${s.type || "file"}-${s.id.slice(0, 8)}.${ext}`;
          zip.file(`${root}/${folder}/${name}`, buf);
          if (isImage) imgCount++;
          else docCount++;
          lines.push(`  - ${folder}/${name}`);
        } catch {
          /* skip failed */
        }
      }

      lines.unshift(`Images: ${imgCount}`, `Documents: ${docCount}`, "");
      zip.file(`${root}/MANIFEST.txt`, lines.join("\n"));

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ref}-${customer}-bundle.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30000);

      toast({
        title: "ZIP downloaded",
        description: `${ref} — ${imgCount} image(s), ${docCount} document(s) + report PDF.`,
      });
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Report Downloads</h1>
          <p className="text-sm text-muted-foreground">
            Download a ZIP bundle containing the report PDF and all photos/documents for any completed job.
          </p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ref, customer, site…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileArchive className="h-4 w-4" />
            Completed jobs ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading completed jobs…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No completed jobs match your search.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((j) => (
                <li key={j.id} className="flex items-center justify-between py-3 gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{j.reference_number}</span>
                      <Badge variant="secondary" className="text-[10px]">Completed</Badge>
                      {j.updated_at && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(j.updated_at).toLocaleDateString("en-GB")}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {[j.customers?.name, j.sites?.name, j.name].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => downloadZip(j)}
                    disabled={busyId === j.id}
                    className="gap-1.5 shrink-0"
                  >
                    {busyId === j.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {busyId === j.id ? "Building ZIP…" : "Download ZIP"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Folder structure inside each ZIP: <code>&lt;customer&gt;/&lt;ref&gt;/Report/</code>,{" "}
        <code>/Images/</code>, <code>/Documents/</code>, and a <code>MANIFEST.txt</code>.
      </p>
    </div>
  );
}
