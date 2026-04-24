import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2, Search, FileArchive, Printer, FileText } from "lucide-react";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, PageBreak } from "docx";
import { useToast } from "@/hooks/use-toast";
import { getCachedLogo } from "@/lib/logoCache";
import { getWordExportConfig } from "@/lib/wordExportConfig";
import { AlignmentType } from "docx";

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
  const [busyAction, setBusyAction] = useState<"zip" | "print" | "word" | null>(null);
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

  // Fetch full job + submissions
  const fetchJobBundle = async (jobId: string) => {
    const { data: fullJob, error: jobErr } = await supabase
      .from("jobs")
      .select("*, customers(*), sites(*)")
      .eq("id", jobId)
      .maybeSingle();
    if (jobErr || !fullJob) throw new Error(jobErr?.message || "Job not found");

    const { data: submissions } = await supabase
      .from("submissions")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });

    return { fullJob, submissions: (submissions as any[]) || [] };
  };

  // Generate the report PDF as base64 by mounting CustomerReportPdf headlessly
  const generateReportPdfBase64 = async (jobId: string, fullJob: any): Promise<string> => {
    return new Promise<string>(async (resolve, reject) => {
      try {
        const mod = await import("@/components/CustomerReportPdf");
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
            jobId,
            job: fullJob,
            onPdfGenerated: (b64: string) => handle(b64),
            trigger: React.createElement("span", { id: `auto-trigger-${jobId}` }),
          })
        );
        setTimeout(() => {
          const el = container.querySelector(`#auto-trigger-${jobId}`) as HTMLElement | null;
          if (el?.parentElement) (el.parentElement as HTMLElement).click();
        }, 50);
        setTimeout(() => {
          if (!resolved) reject(new Error("PDF generation timed out"));
        }, 60000);
      } catch (e) {
        reject(e);
      }
    });
  };

  // Download all submission files (returns categorised buffers)
  const fetchSubmissionFiles = async (subs: any[]) => {
    const images: { name: string; buf: Uint8Array; ext: string }[] = [];
    const documents: { name: string; buf: Uint8Array; ext: string }[] = [];
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
        const name = s.file_name || `${s.type || "file"}-${s.id.slice(0, 8)}.${ext}`;
        if (isImage) images.push({ name, buf, ext });
        else documents.push({ name, buf, ext });
      } catch {
        /* skip failed */
      }
    }
    return { images, documents };
  };

  const downloadZip = async (job: CompletedJob) => {
    setBusyId(job.id);
    setBusyAction("zip");
    try {
      const { fullJob, submissions } = await fetchJobBundle(job.id);
      const pdfBase64 = await generateReportPdfBase64(job.id, fullJob);
      const { images, documents } = await fetchSubmissionFiles(submissions);

      const zip = new JSZip();
      const customer = safe(fullJob.customers?.name || "customer");
      const ref = safe(fullJob.reference_number || "job");
      const rootDir = `${customer}/${ref}`;

      zip.file(
        `${rootDir}/Report/${ref}-report.pdf`,
        Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0))
      );

      const lines: string[] = [
        `Images: ${images.length}`,
        `Documents: ${documents.length}`,
        "",
        `Job Reference: ${fullJob.reference_number || ""}`,
        `Customer: ${fullJob.customers?.name || ""}`,
        `Site: ${fullJob.sites?.name || ""}`,
        `Completed: ${fullJob.updated_at || fullJob.created_at}`,
        `Generated: ${new Date().toISOString()}`,
        "",
        `Files:`,
      ];
      for (const f of images) {
        zip.file(`${rootDir}/Images/${f.name}`, f.buf);
        lines.push(`  - Images/${f.name}`);
      }
      for (const f of documents) {
        zip.file(`${rootDir}/Documents/${f.name}`, f.buf);
        lines.push(`  - Documents/${f.name}`);
      }
      zip.file(`${rootDir}/MANIFEST.txt`, lines.join("\n"));

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
        description: `${ref} — ${images.length} image(s), ${documents.length} document(s) + report PDF.`,
      });
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  // Print: open report PDF + each PDF document in a new tab and trigger print.
  // Images are combined into a single printable HTML page.
  const printAll = async (job: CompletedJob) => {
    setBusyId(job.id);
    setBusyAction("print");
    try {
      const { fullJob, submissions } = await fetchJobBundle(job.id);
      const pdfBase64 = await generateReportPdfBase64(job.id, fullJob);
      const { images, documents } = await fetchSubmissionFiles(submissions);

      const ref = fullJob.reference_number || "job";
      const customerName = fullJob.customers?.name || "";
      const siteName = fullJob.sites?.name || "";

      // Build a single printable HTML page that embeds:
      //  - the report PDF (as <embed>)
      //  - each document PDF (as <embed>)
      //  - all images
      const reportBytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
      const reportPdfUrl = URL.createObjectURL(
        new Blob([reportBytes.buffer as ArrayBuffer], { type: "application/pdf" })
      );

      const docEmbeds: string[] = [];
      for (const d of documents) {
        if (d.ext === "pdf") {
          const u = URL.createObjectURL(new Blob([d.buf.buffer as ArrayBuffer], { type: "application/pdf" }));
          docEmbeds.push(
            `<div class="page"><h2>${d.name}</h2><embed src="${u}" type="application/pdf" class="pdf"/></div>`
          );
        } else {
          docEmbeds.push(
            `<div class="page"><h2>${d.name}</h2><p class="muted">Non-PDF document — please print from the source file.</p></div>`
          );
        }
      }

      const imageEmbeds = images
        .map((img) => {
          const u = URL.createObjectURL(new Blob([img.buf.buffer as ArrayBuffer], { type: `image/${img.ext === "jpg" ? "jpeg" : img.ext}` }));
          return `<div class="img-page"><img src="${u}" alt="${img.name}"/><div class="caption">${img.name}</div></div>`;
        })
        .join("");

      const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>Print — ${ref}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; color: #111; }
  h1 { font-size: 18pt; margin: 0 0 4px; }
  h2 { font-size: 13pt; margin: 0 0 8px; padding-bottom: 4px; border-bottom: 1px solid #ccc; }
  .meta { font-size: 10pt; color: #555; margin-bottom: 16px; }
  .page { page-break-after: always; height: 100vh; display: flex; flex-direction: column; }
  .pdf { flex: 1; width: 100%; border: 0; }
  .img-page { page-break-after: always; text-align: center; }
  .img-page img { max-width: 100%; max-height: 95vh; object-fit: contain; }
  .caption { font-size: 9pt; color: #666; margin-top: 6px; }
  .muted { color: #888; font-size: 10pt; }
  .cover { padding: 20mm 0; }
</style></head><body>
<div class="cover">
  <h1>${ref}</h1>
  <div class="meta">${[customerName, siteName].filter(Boolean).join(" · ")}</div>
  <div class="meta">Generated: ${new Date().toLocaleString("en-GB")}</div>
</div>
<div class="page"><h2>Job Report</h2><embed src="${reportPdfUrl}" type="application/pdf" class="pdf"/></div>
${docEmbeds.join("")}
${imageEmbeds}
<script>
  window.addEventListener('load', () => {
    setTimeout(() => { window.focus(); window.print(); }, 800);
  });
</script>
</body></html>`;

      const printWin = window.open("", "_blank");
      if (!printWin) {
        throw new Error("Pop-up blocked. Please allow pop-ups to use Print.");
      }
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();

      toast({
        title: "Print ready",
        description: `${ref} — opened in a new tab. Use the browser print dialog.`,
      });
    } catch (err: any) {
      toast({ title: "Print failed", description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  // Save as Word (.docx) — embeds report summary, image gallery, and a list of documents.
  // PDFs cannot be embedded inside Word; they are listed and bundled separately if needed.
  const downloadWord = async (job: CompletedJob) => {
    setBusyId(job.id);
    setBusyAction("word");
    try {
      const { fullJob, submissions } = await fetchJobBundle(job.id);
      const { images, documents } = await fetchSubmissionFiles(submissions);

      const ref = fullJob.reference_number || "job";
      const customerName = fullJob.customers?.name || "";
      const siteName = fullJob.sites?.name || "";

      // Load the Viva Fire logo (or customer override) so the Word doc matches the PDF header.
      // Cached in-memory so repeated exports in the same session don't re-download it.
      const logoUrl = fullJob.customers?.logo_url && String(fullJob.customers.logo_url).trim() !== ""
        ? String(fullJob.customers.logo_url)
        : "/images/vivafire-logo-new.jpg";
      const cached = await getCachedLogo(logoUrl);
      const logoBuf: Uint8Array | null = cached?.buf ?? null;
      const logoType: "png" | "jpeg" = cached?.type ?? "jpeg";
      const logoDims = cached?.dims ?? { w: 400, h: 120 };

      // Get pixel dimensions for an image so we can size it sensibly in Word.
      const getDims = (buf: Uint8Array, ext: string): Promise<{ w: number; h: number }> =>
        new Promise((resolve) => {
          const url = URL.createObjectURL(new Blob([buf.buffer as ArrayBuffer], { type: `image/${ext === "jpg" ? "jpeg" : ext}` }));
          const im = new Image();
          im.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ w: im.naturalWidth || 600, h: im.naturalHeight || 400 });
          };
          im.onerror = () => {
            URL.revokeObjectURL(url);
            resolve({ w: 600, h: 400 });
          };
          im.src = url;
        });

      const imageBlocks: Paragraph[] = [];
      for (const img of images) {
        const ext = ["png", "jpg", "jpeg", "gif", "bmp"].includes(img.ext) ? img.ext : "png";
        const type = (ext === "jpg" ? "jpeg" : ext) as "png" | "jpeg" | "gif" | "bmp";
        const { w, h } = await getDims(img.buf, ext);
        const maxW = 500;
        const scale = Math.min(1, maxW / w);
        imageBlocks.push(
          new Paragraph({
            children: [
              new ImageRun({
                type,
                data: img.buf,
                transformation: { width: Math.round(w * scale), height: Math.round(h * scale) },
              } as any),
            ],
          }),
          new Paragraph({
            children: [new TextRun({ text: img.name, italics: true, size: 18, color: "666666" })],
            spacing: { after: 200 },
          })
        );
      }

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: [
              ...(logoBuf
                ? [
                    new Paragraph({
                      alignment: "center" as any,
                      children: [
                        new ImageRun({
                          type: logoType,
                          data: logoBuf,
                          transformation: (() => {
                            const maxW = 200;
                            const aspect = logoDims.w / logoDims.h;
                            const w = Math.min(maxW, logoDims.w);
                            return { width: Math.round(w), height: Math.round(w / aspect) };
                          })(),
                        } as any),
                      ],
                      spacing: { after: 200 },
                    }),
                  ]
                : []),
              new Paragraph({
                heading: HeadingLevel.HEADING_1,
                children: [new TextRun({ text: `Job Report — ${ref}`, bold: true })],
              }),
              new Paragraph({
                children: [new TextRun({ text: [customerName, siteName].filter(Boolean).join(" · ") || "—" })],
                spacing: { after: 100 },
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: `Completed: `, bold: true }),
                  new TextRun({
                    text: new Date(fullJob.updated_at || fullJob.created_at).toLocaleString("en-GB"),
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: `Generated: `, bold: true }),
                  new TextRun({ text: new Date().toLocaleString("en-GB") }),
                ],
                spacing: { after: 300 },
              }),

              new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [new TextRun({ text: "Summary" })],
              }),
              new Paragraph({
                children: [new TextRun({ text: fullJob.brief || fullJob.name || "No description." })],
                spacing: { after: 200 },
              }),

              new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [new TextRun({ text: `Images (${images.length})` })],
              }),
              ...(imageBlocks.length
                ? imageBlocks
                : [new Paragraph({ children: [new TextRun({ text: "No images attached.", italics: true })] })]),

              new Paragraph({ children: [new PageBreak()] }),
              new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [new TextRun({ text: `Documents (${documents.length})` })],
              }),
              ...(documents.length
                ? documents.map(
                    (d) =>
                      new Paragraph({
                        children: [new TextRun({ text: `• ${d.name}` })],
                      })
                  )
                : [
                    new Paragraph({
                      children: [new TextRun({ text: "No documents attached.", italics: true })],
                    }),
                  ]),
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Note: PDFs and other documents cannot be embedded inside Word. Use the ZIP download to access the original files.",
                    italics: true,
                    size: 18,
                    color: "888888",
                  }),
                ],
                spacing: { before: 200 },
              }),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safe(ref)}-${safe(customerName || "customer")}-report.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30000);

      toast({
        title: "Word document ready",
        description: `${ref} — ${images.length} image(s) embedded.`,
      });
    } catch (err: any) {
      toast({ title: "Word export failed", description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
      setBusyAction(null);
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
                  <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => printAll(j)}
                      disabled={busyId === j.id}
                      className="gap-1.5"
                      title="Open report and all attachments in a print-ready window"
                    >
                      {busyId === j.id && busyAction === "print" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Printer className="h-3.5 w-3.5" />
                      )}
                      Print
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadWord(j)}
                      disabled={busyId === j.id}
                      className="gap-1.5"
                      title="Download as Word (.docx) with embedded images"
                    >
                      {busyId === j.id && busyAction === "word" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileText className="h-3.5 w-3.5" />
                      )}
                      Word
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => downloadZip(j)}
                      disabled={busyId === j.id}
                      className="gap-1.5"
                    >
                      {busyId === j.id && busyAction === "zip" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      ZIP
                    </Button>
                  </div>
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
