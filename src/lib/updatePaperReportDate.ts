import { supabase } from "@/integrations/supabase/client";
import { paperCompletionIsoStrict as paperCompletionIso } from "@/lib/paperReportDate";
import { buildElectronicReportPdf } from "@/lib/electronicReportPdf";
import { buildDurableRef } from "@/lib/durableStorageRef";

export async function updatePaperReportDate(responseId: string, rawDate: string) {
  const day = paperCompletionIso(rawDate).slice(0, 10);
  const { error } = await supabase.rpc("set_paper_report_completion_date", { _response_id: responseId, _date: day });
  if (error) throw error;
  const { data: report, error: readError } = await supabase.from("job_sheet_responses").select("job_id").eq("id", responseId).single();
  if (readError) throw readError;
  await refreshPaperReportPdfs(report.job_id, responseId);
}

export async function refreshPaperReportPdfs(jobId: string, responseId?: string) {
  const { data: job, error: jobError } = await supabase.from("jobs").select("id,customer_id,site_id,completed_at,historic_backfill").eq("id", jobId).single();
  if (jobError) throw jobError;
  const { data: reports, error: reportsError } = await supabase.from("job_sheet_responses").select("id,template_id,responses,submitted_at,created_at").eq("job_id", job.id).order("created_at", { ascending: true });
  if (reportsError) throw reportsError;
  const { data: docs, error: docsError } = await supabase.from("job_documents").select("id,label,file_url,created_at").eq("job_id", job.id).eq("document_type", "report").order("created_at", { ascending: true });
  if (docsError) throw docsError;
  for (const row of reports || []) {
    const answers = row.responses as Record<string, any>;
    if (!job.historic_backfill && row.id !== responseId) continue;
    const { data: template, error: templateError } = await supabase.from("job_sheet_templates").select("id,name,fields,branding,footer_text").eq("id", row.template_id).single();
    if (templateError) throw templateError;
    const input = answers._paper_pdf_input;
    // Live report downloads read the updated answers directly. Only saved
    // electronic copies need regenerating; original scanned sheets stay intact.
    // Several sheets of the same template on one job share a label, so a plain
    // label match would overwrite the first sheet's PDF. Pair them by filing
    // order (nth sheet of this template ↔ nth electronic copy) and remember
    // the pairing so later rebuilds use the exact document.
    let document = input?.documentId ? docs?.find(d => d.id === input.documentId) : undefined;
    if (!document) {
      const label = `Electronic report — ${template.name}`;
      const sameLabel = (docs || []).filter(d => d.label === label);
      const sameTemplate = (reports || []).filter(r => r.template_id === row.template_id && (r.responses as any)?._paper_pdf_input?.documentId == null);
      const claimed = new Set((reports || []).map(r => (r.responses as any)?._paper_pdf_input?.documentId).filter(Boolean));
      const free = sameLabel.filter(d => !claimed.has(d.id));
      if (free.length === 1 && sameTemplate.length === 1) document = free[0];
      else if (free.length === sameTemplate.length) document = free[sameTemplate.findIndex(r => r.id === row.id)];
      else throw new Error(`Couldn't tell which saved PDF belongs to this ${template.name} sheet, so nothing was overwritten.`);
    }
    if (!document) continue;
    const { path } = await buildElectronicReportPdf({
      ...(input || {}), archivedId: job.id, template: template as any,
      responses: answers, header: { ...(input?.header || answers._scan_header || {}), date: answers.date },
      customerId: job.customer_id, siteId: job.site_id,
      documentDate: (answers._paper_completion_at || row.submitted_at || job.completed_at)?.slice(0, 10),
    });
    const { error: pdfError } = await supabase.from("job_documents").update({ file_url: buildDurableRef("submissions", path) }).eq("id", document.id);
    if (pdfError) throw pdfError;
    if (input?.documentId !== document.id) {
      await supabase.from("job_sheet_responses").update({ responses: { ...answers, _paper_pdf_input: { ...(input || {}), documentId: document.id } } as any }).eq("id", row.id);
    }
  }
}