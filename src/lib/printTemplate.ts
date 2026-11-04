import { supabase } from '@/integrations/supabase/client';

export const PRINT_TEMPLATE_COLUMNS = 'id,name,description,fields,footer_text,branding,org_id,job_category,status,created_at';

export interface PrintTemplateCandidate { id: string; name?: string | null; org_id?: string | null; job_category?: string | null; status?: string | null; created_at?: string | null; [k: string]: any }
export interface PrintCategory { slug: string; print_template_id?: string | null }

/**
 * Picks the engineer paper sheet for a job, never by template name:
 * 1. the company's "default print template" set on the job type,
 * 2. otherwise the company's first published template for that job type,
 * 3. otherwise the first shared (no company) published template for that job type.
 * Job types are tried in order (main category first, then detected work types).
 */
export function pickPrintTemplate(orgId: string | null | undefined, slugs: string[], categories: PrintCategory[], templates: PrintTemplateCandidate[]): PrintTemplateCandidate | null {
  if (!orgId) return null;
  const owned = (t: PrintTemplateCandidate) => t.org_id === orgId || !t.org_id;
  const byId = new Map(templates.filter(owned).map(t => [t.id, t]));
  const sorted = [...templates].filter(t => t.status === 'published').sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.name || '').localeCompare(String(b.name || '')));
  for (const slug of slugs) {
    const chosen = categories.find(c => c.slug === slug)?.print_template_id;
    if (chosen && byId.get(chosen)) return byId.get(chosen)!;
    const first = sorted.find(t => t.org_id === orgId && t.job_category === slug) || sorted.find(t => !t.org_id && t.job_category === slug);
    if (first) return first;
  }
  return null;
}

export async function resolveJobPrintTemplate(job: { org_id?: string | null; category?: string | null; detected_work_types?: string[] | null }) {
  const orgId = job.org_id;
  const slugs = Array.from(new Set([job.category, ...(job.detected_work_types || [])].filter(Boolean) as string[]));
  if (!orgId || !slugs.length) return null;
  const [{ data: cats }, { data: tpls }] = await Promise.all([
    supabase.from('job_categories').select('slug,print_template_id').eq('org_id', orgId).in('slug', slugs),
    supabase.from('job_sheet_templates').select(PRINT_TEMPLATE_COLUMNS).in('job_category', slugs).or(`org_id.eq.${orgId},org_id.is.null`),
  ]);
  const categories = (cats || []) as PrintCategory[];
  const all = (tpls || []) as PrintTemplateCandidate[];
  const chosenIds = categories.map(c => c.print_template_id).filter(Boolean) as string[];
  const missing = chosenIds.filter(id => !all.some(t => t.id === id));
  if (missing.length) {
    const { data: extra } = await supabase.from('job_sheet_templates').select(PRINT_TEMPLATE_COLUMNS).in('id', missing).or(`org_id.eq.${orgId},org_id.is.null`);
    all.push(...((extra || []) as PrintTemplateCandidate[]));
  }
  return pickPrintTemplate(orgId, slugs, categories, all);
}
