import { supabase } from "@/integrations/supabase/client";
import { buildElectronicReportPdf } from "@/lib/electronicReportPdf";
import { submissionsPathFromSignedUrl } from "@/lib/resolveSubmissionsPath";

type JobDocRow = {
  id?: string;
  document_type: string;
  label?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  created_at?: string | null;
};

type BatchItemRow = {
  id: string;
  detected_template_id: string | null;
  extracted: Record<string, any> | null;
  header_data: Record<string, any> | null;
  image_paths: string[] | null;
  guess_customer_id: string | null;
  guess_site_id: string | null;
  guess_date: string | null;
  created_at: string | null;
};

export type JobScanReportBundle = {
  reportPaths: string[];
  reportLabels: string[];
  scanPaths: string[];
};

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function sortByCreatedAt<T extends { created_at?: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
}

function safeFileBase(label: string): string {
  return (label || "electronic-report")
    .toLowerCase()
    .replace(/[^\w\-. ]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "") || "electronic-report";
}

function normaliseDate(raw?: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

export function jobDocumentSubmissionsPath(doc: { file_url?: string | null } | null | undefined): string | null {
  return submissionsPathFromSignedUrl(doc?.file_url || null);
}

export async function ensureJobScanReportBundle(
  jobId: string,
  opts: { userId?: string | null } = {},
): Promise<JobScanReportBundle> {
  const [{ data: docs }, { data: items }, { data: job }] = await Promise.all([
    supabase
      .from("job_documents" as any)
      .select("id, document_type, label, file_url, file_name, created_at")
      .eq("job_id", jobId)
      .in("document_type", ["report", "source_scan"]),
    (supabase as any)
      .from("paper_scan_batch_items")
      .select("id, detected_template_id, extracted, header_data, image_paths, guess_customer_id, guess_site_id, guess_date, created_at")
      .eq("created_job_id", jobId)
      .eq("status", "confirmed")
      .order("created_at", { ascending: true }),
    (supabase as any)
      .from("jobs")
      .select("id, customer_id, site_id, completed_at, due_date")
      .eq("id", jobId)
      .maybeSingle(),
  ]);

  const rows = (docs as unknown as JobDocRow[]) || [];
  const reportDocs = sortByCreatedAt(rows.filter((d) => d.document_type === "report"));
  const sourceDocs = sortByCreatedAt(rows.filter((d) => d.document_type === "source_scan"));
  const batchItems = sortByCreatedAt((items as BatchItemRow[]) || []);

  const reportPaths = reportDocs
    .map((d) => jobDocumentSubmissionsPath(d))
    .filter((p): p is string => !!p);
  const reportLabels = reportDocs.map((d) => d.label || d.file_name || "Electronic report");

  const scanPaths = unique([
    ...sourceDocs.map((d) => jobDocumentSubmissionsPath(d)).filter((p): p is string => !!p),
    ...batchItems.flatMap((i) => i.image_paths || []),
  ]);

  // Legacy/backfill path: older filed jobs may have all original scan pages but
  // only one (or zero) electronic PDFs. Regenerate the missing per-sheet PDFs
  // from the confirmed queue items so the comparison, Download and Send paths
  // can operate on a complete bundle.
  if (batchItems.length > reportPaths.length) {
    const missing = batchItems.slice(reportPaths.length);
    for (const item of missing) {
      if (!item.detected_template_id) continue;
      const { data: tpl } = await supabase
        .from("job_sheet_templates")
        .select("id, name, description, fields, footer_text, branding")
        .eq("id", item.detected_template_id)
        .maybeSingle();
      if (!tpl || !Array.isArray((tpl as any).fields)) continue;

      const header = item.header_data || {};
      const generated = await buildElectronicReportPdf({
        archivedId: `${jobId}-${item.id}`,
        template: tpl as any,
        responses: item.extracted || {},
        header,
        sourcePaths: item.image_paths || [],
        customerId: item.guess_customer_id || (job as any)?.customer_id || null,
        siteId: item.guess_site_id || (job as any)?.site_id || null,
        siteName: !item.guess_site_id && header.site ? String(header.site) : null,
        siteAddress: !item.guess_site_id && header.site ? String(header.site) : null,
        documentDate:
          normaliseDate(item.guess_date) ||
          normaliseDate(header.date) ||
          normaliseDate((job as any)?.completed_at) ||
          normaliseDate((job as any)?.due_date),
        technicianName: null,
      });

      const label = `Electronic report — ${(tpl as any).name || "Paper sheet"}`;
      await supabase.from("job_documents" as any).insert({
        job_id: jobId,
        document_type: "report",
        label,
        file_url: `storage://submissions/${generated.path}`,
        file_name: `${safeFileBase((tpl as any).name || "electronic-report")}.pdf`,
        source: "manual",
        created_by: opts.userId || null,
      } as any);
      reportPaths.push(generated.path);
      reportLabels.push(label);
    }
  }

  return { reportPaths, reportLabels, scanPaths };
}