import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { isDryRiserAsset } from '@/lib/dryRisers';
import { visitCycle } from './riserVisits';
export async function loadRiserVisitData() {
  const [assets,sites,customers,links,history,defects,sheets,jobs] = await Promise.all([
    fetchAllRows<any>('assets','id,name,asset_type,category,asset_tag,site_id,riser_location,outlets_count,status,last_inspection_at,last_inspection_type,last_inspection_result,last_job_id,no_longer_serviced,due_visit_state'),
    fetchAllRows<any>('sites','id,name,address,postcode,no_longer_serviced'), fetchAllRows<any>('customers','id,name'),
    fetchAllRows<any>('customer_sites','id,customer_id,site_id'), fetchAllRows<any>('asset_service_history','id,asset_id,job_id,inspection_date,inspection_type,template_name,result_summary'),
    fetchAllRows<any>('defects','id,asset_id,site_id,job_id,title,status,created_at'),
    fetchAllRows<any>('job_sheet_responses','id,job_id,responses,status'), fetchAllRows<any>('jobs','id,reference_number,status,due_date,source')
  ]);
  const siteMap = new Map(sites.map(s=>[s.id,s])); const customerMap = new Map(customers.map(c=>[c.id,c]));
  return assets.filter(a=>isDryRiserAsset(a) && a.status !== 'decommissioned').map(asset=>{
    const site = siteMap.get(asset.site_id); const customer = customerMap.get(links.find(l=>l.site_id===asset.site_id)?.customer_id);
    const h = history.filter(h=>h.asset_id===asset.id); const cycle = visitCycle(asset,h);
    const booked = sheets.map(s=>({ sheet:s,job:jobs.find(j=>j.id===s.job_id) })).find(({sheet,job})=>sheet.responses?._riser_visit?.asset_id===asset.id && !['completed','archived','submitted_for_review','pending_review'].includes(job?.status) && job?.due_date && (!cycle.last || job.due_date>=cycle.last) && (!cycle.type || sheet.responses._riser_visit.visit_type===cycle.type));
    return { asset,site,customer,history:h,cycle,booked:booked?.job || null, defects:defects.filter(d=>d.asset_id===asset.id && ['open','in_progress'].includes(d.status)) };
  });
}
export type RiserVisitRow = Awaited<ReturnType<typeof loadRiserVisitData>>[number];
