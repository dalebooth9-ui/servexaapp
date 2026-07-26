// Orchestrator for the Planner "Print all job sheets" action.
//
// Given a set of scheduled visits (job × engineer × date), resolve the
// correct template(s) for each job (via job_category_template_map), pre-fill
// with the same admin-known context the live sheets use, generate a blank
// PDF per (job × template), and merge everything into one printable PDF
// with a front summary page that lists every job in schedule order and
// flags any jobs whose type has no mapped template.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { generateBlankSheetPdfBlob, type BlankSheetTemplate, type BlankSheetJobInfo } from "./generateBlankSheetPdf";
import { fetchJobPrefillContext } from "./jobSheetPrefill";

export interface BulkPrintVisit {
  job_id: string;
  engineer_id: string;
  engineer_name: string;
  schedule_date: string; // yyyy-mm-dd
}

export interface BulkPrintSelection {
  weekStart: Date;
  weekEnd: Date;
  scopeLabel: string; // e.g. "Wayne — w/c 27 Jul" or "All engineers — w/c 27 Jul"
  visits: BulkPrintVisit[];
}

export interface BulkPrintProgress {
  done: number;
  total: number;
  currentLabel?: string;
}

export interface BulkPrintResult {
  blob: Blob;
  fileName: string;
  generatedCount: number;
  missing: Array<{ jobRef: string; site: string; reason: string }>;
  perEngineer: Array<{ engineer: string; visits: number; sheets: number }>;
}

// ---------------------------------------------------------------------------
// Front summary index page
// ---------------------------------------------------------------------------

async function buildSummaryPdf(
  scopeLabel: string,
  rows: Array<{
    day: string;
    engineer: string;
    ref: string;
    site: string;
    templates: string[];
    missingReason?: string | null;
  }>,
  missing: BulkPrintResult["missing"],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595; // A4 portrait pt
  const pageHeight = 842;
  const margin = 40;
  const lineH = 12;
  const rowH = 14;
  const contentW = pageWidth - margin * 2;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawText = (
    text: string,
    x: number,
    yy: number,
    size: number,
    fnt = font,
    color = rgb(0, 0, 0),
  ) => page.drawText(text, { x, y: yy, size, font: fnt, color });

  const newPage = () => {
    page = doc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  };

  // Title
  drawText("Job Sheets — Bulk Print", margin, y, 18, bold);
  y -= 22;
  drawText(scopeLabel, margin, y, 11, font, rgb(0.3, 0.3, 0.3));
  y -= 10;
  drawText(`Generated ${format(new Date(), "d MMM yyyy 'at' HH:mm")}`, margin, y, 9, font, rgb(0.45, 0.45, 0.45));
  y -= 18;

  // Missing block first — needs immediate attention
  if (missing.length > 0) {
    if (y < margin + 100) newPage();
    drawText(`Attention — ${missing.length} job${missing.length === 1 ? "" : "s"} without a matching sheet template`, margin, y, 11, bold, rgb(0.72, 0.1, 0.1));
    y -= 14;
    for (const m of missing) {
      if (y < margin + rowH) newPage();
      const line = `•  ${m.jobRef}${m.site ? ` — ${m.site}` : ""}: ${m.reason}`;
      drawText(line.slice(0, 110), margin, y, 9, font, rgb(0.4, 0.05, 0.05));
      y -= rowH;
    }
    y -= 8;
  }

  // Column headers for the index
  if (y < margin + 60) newPage();
  drawText("Schedule Index", margin, y, 12, bold);
  y -= 16;
  const colX = { day: margin, eng: margin + 90, ref: margin + 200, site: margin + 280, tpl: margin + 420 };
  drawText("Day", colX.day, y, 9, bold, rgb(0.35, 0.35, 0.35));
  drawText("Engineer", colX.eng, y, 9, bold, rgb(0.35, 0.35, 0.35));
  drawText("Job Ref", colX.ref, y, 9, bold, rgb(0.35, 0.35, 0.35));
  drawText("Site", colX.site, y, 9, bold, rgb(0.35, 0.35, 0.35));
  drawText("Sheet(s)", colX.tpl, y, 9, bold, rgb(0.35, 0.35, 0.35));
  y -= 4;
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= rowH;

  const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  for (const r of rows) {
    if (y < margin + rowH * 2) newPage();
    const missingBadge = !!r.missingReason;
    const colour = missingBadge ? rgb(0.72, 0.1, 0.1) : rgb(0.1, 0.1, 0.1);
    drawText(clip(r.day, 14), colX.day, y, 9, font, colour);
    drawText(clip(r.engineer, 16), colX.eng, y, 9, font, colour);
    drawText(clip(r.ref, 14), colX.ref, y, 9, font, colour);
    drawText(clip(r.site, 22), colX.site, y, 9, font, colour);
    if (missingBadge) {
      drawText("NO TEMPLATE — check job type", colX.tpl, y, 9, bold, rgb(0.72, 0.1, 0.1));
    } else {
      drawText(clip(r.templates.join(" + "), 26), colX.tpl, y, 9, font, colour);
    }
    y -= rowH;
  }

  return await doc.save();
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function bulkPrintJobSheets(
  selection: BulkPrintSelection,
  onProgress: (p: BulkPrintProgress) => void = () => {},
): Promise<BulkPrintResult> {
  const { visits, scopeLabel, weekStart } = selection;

  if (visits.length === 0) {
    throw new Error("No scheduled jobs in this selection.");
  }

  // Order: day, then engineer name, then job ref for stable output.
  const sorted = [...visits].sort((a, b) => {
    if (a.schedule_date !== b.schedule_date) return a.schedule_date.localeCompare(b.schedule_date);
    if (a.engineer_name !== b.engineer_name) return a.engineer_name.localeCompare(b.engineer_name);
    return a.job_id.localeCompare(b.job_id);
  });

  // Deduplicate — a two-engineer visit only needs ONE printed sheet.
  const seen = new Set<string>();
  const jobsToProcess: Array<BulkPrintVisit & { key: string }> = [];
  for (const v of sorted) {
    const key = `${v.job_id}::${v.schedule_date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jobsToProcess.push({ ...v, key });
  }

  onProgress({ done: 0, total: jobsToProcess.length });

  // Pre-fetch job rows + template mapping in bulk.
  const jobIds = Array.from(new Set(jobsToProcess.map((j) => j.job_id)));
  const [jobRowsRes, mapRowsRes, tplRowsRes] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, reference_number, customer_po, category, org_id")
      .in("id", jobIds),
    supabase
      .from("job_category_template_map" as any)
      .select("job_category_slug, template_id, sort_order, org_id"),
    supabase
      .from("job_sheet_templates")
      .select("id, name, description, standard, fields, footer_text, branding")
      .eq("status", "published"),
  ]);

  const jobRows = (jobRowsRes.data || []) as Array<{
    id: string;
    reference_number: string;
    customer_po: string | null;
    category: string | null;
    org_id: string | null;
  }>;
  const jobById = new Map(jobRows.map((j) => [j.id, j]));

  const mapRows = ((mapRowsRes as any).data || []) as Array<{
    job_category_slug: string;
    template_id: string;
    sort_order: number;
    org_id: string | null;
  }>;
  const allTemplates = (tplRowsRes.data || []) as any[];
  const tplById = new Map(allTemplates.map((t) => [t.id, t as BlankSheetTemplate]));

  const templatesForCategory = (slug: string | null | undefined, orgId: string | null): BlankSheetTemplate[] => {
    if (!slug) return [];
    const rows = mapRows.filter((r) => r.job_category_slug === slug);
    if (rows.length === 0) return [];
    const hasOrgRows = rows.some((r) => r.org_id === orgId);
    const chosen = hasOrgRows ? rows.filter((r) => r.org_id === orgId) : rows.filter((r) => r.org_id === null);
    const out: BlankSheetTemplate[] = [];
    const seenIds = new Set<string>();
    for (const r of chosen.sort((a, b) => a.sort_order - b.sort_order)) {
      if (seenIds.has(r.template_id)) continue;
      const t = tplById.get(r.template_id);
      if (t) {
        seenIds.add(r.template_id);
        out.push(t);
      }
    }
    return out;
  };

  const merged = await PDFDocument.create();
  const indexRows: Array<{
    day: string;
    engineer: string;
    ref: string;
    site: string;
    templates: string[];
    missingReason?: string | null;
  }> = [];
  const missing: BulkPrintResult["missing"] = [];
  const perEngineerCounts = new Map<string, { visits: number; sheets: number }>();

  const bump = (name: string, sheets: number) => {
    const cur = perEngineerCounts.get(name) || { visits: 0, sheets: 0 };
    cur.visits += 1;
    cur.sheets += sheets;
    perEngineerCounts.set(name, cur);
  };

  let done = 0;
  for (const v of jobsToProcess) {
    const jobRow = jobById.get(v.job_id);
    if (!jobRow) {
      missing.push({ jobRef: v.job_id.slice(0, 8), site: "", reason: "Job no longer exists" });
      done += 1;
      onProgress({ done, total: jobsToProcess.length });
      continue;
    }

    const jobRef = jobRow.customer_po?.trim() || jobRow.reference_number || v.job_id.slice(0, 8);
    const dayLabel = format(parseISO(v.schedule_date), "EEE d MMM");

    onProgress({ done, total: jobsToProcess.length, currentLabel: `${jobRef} · ${v.engineer_name}` });

    // Pull the same context the live sheet pre-fill uses.
    const ctx = await fetchJobPrefillContext(supabase, v.job_id);
    const siteLabel = ctx?.site?.name || ctx?.address || "";

    const templates = templatesForCategory(jobRow.category, jobRow.org_id);

    if (templates.length === 0) {
      const reason = jobRow.category
        ? `Job type “${jobRow.category}” has no mapped sheet template`
        : "Job has no type set";
      missing.push({ jobRef, site: siteLabel, reason });
      indexRows.push({
        day: dayLabel,
        engineer: v.engineer_name,
        ref: jobRef,
        site: siteLabel,
        templates: [],
        missingReason: reason,
      });
      bump(v.engineer_name, 0);
      done += 1;
      onProgress({ done, total: jobsToProcess.length });
      continue;
    }

    // Build the JobInfo used by the worker (mirrors what
    // JobSheetTemplates prefill does — customer, site, PO, riser, engineer).
    const jobInfo: BlankSheetJobInfo = {
      address: ctx?.address ?? null,
      customer: ctx?.customer ?? null,
      customers: (ctx as any)?.customers ?? null,
      reference_number: ctx?.reference_number || jobRow.reference_number,
      customer_po: jobRow.customer_po || undefined,
      category: jobRow.category ?? undefined,
      name: ctx?.name ?? undefined,
      priority: (ctx as any)?.priority ?? undefined,
      visual_qty: (ctx as any)?.visual_qty ?? undefined,
      pressure_test_qty: (ctx as any)?.pressure_test_qty ?? undefined,
      other_qty: (ctx as any)?.other_qty ?? undefined,
      other_service_type: (ctx as any)?.other_service_type ?? undefined,
      engineers: (ctx as any)?.engineers ?? [v.engineer_name],
      due_date: v.schedule_date, // print the scheduled visit date in the header
      site: (ctx as any)?.site ?? null,
    };

    let sheetsForThisJob = 0;
    for (const tpl of templates) {
      try {
        const blob = await generateBlankSheetPdfBlob(tpl, jobInfo);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
        sheetsForThisJob += 1;
      } catch (e: any) {
        missing.push({
          jobRef,
          site: siteLabel,
          reason: `Failed to render “${tpl.name}”: ${e?.message || "unknown error"}`,
        });
      }
    }

    indexRows.push({
      day: dayLabel,
      engineer: v.engineer_name,
      ref: jobRef,
      site: siteLabel,
      templates: templates.map((t) => t.name),
    });
    bump(v.engineer_name, sheetsForThisJob);

    done += 1;
    onProgress({ done, total: jobsToProcess.length, currentLabel: `${jobRef} · ${v.engineer_name}` });
  }

  // Prepend the summary index.
  const summaryBytes = await buildSummaryPdf(scopeLabel, indexRows, missing);
  const summaryDoc = await PDFDocument.load(summaryBytes);
  const combined = await PDFDocument.create();
  const summaryPages = await combined.copyPages(summaryDoc, summaryDoc.getPageIndices());
  summaryPages.forEach((p) => combined.addPage(p));
  const bodyPages = await combined.copyPages(merged, merged.getPageIndices());
  bodyPages.forEach((p) => combined.addPage(p));

  const finalBytes = await combined.save();
  const fileName = `job-sheets-${format(weekStart, "yyyy-MM-dd")}-${scopeLabel
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")}.pdf`;

  return {
    blob: new Blob([finalBytes as any], { type: "application/pdf" }),
    fileName,
    generatedCount: indexRows.filter((r) => !r.missingReason).length,
    missing,
    perEngineer: Array.from(perEngineerCounts.entries()).map(([engineer, c]) => ({
      engineer,
      visits: c.visits,
      sheets: c.sheets,
    })),
  };
}
