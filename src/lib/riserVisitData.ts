import { supabase } from '@/integrations/supabase/client';
import {fetchOrgRows,requireCurrentOrgId} from './tenantQueries';
import { isDryRiserAsset } from '@/lib/dryRisers';
import { visitCycle } from './riserVisits';
export async function loadRiserVisitData() {
  const orgId=await requireCurrentOrgId();
  const fetchAllRows=<T=any>(table:string,columns:string)=>fetchOrgRows<T>(table,columns,'id',supabase,orgId);
  const [assets,sites,customers,links,history,defects,sheets,jobs,jobRisers] = await Promise.all([
    fetchAllRows<any>('assets','id,name,asset_type,category,asset_tag,site_id,riser_location,outlets_count,status,last_inspection_at,last_inspection_type,last_inspection_result,last_job_id,no_longer_serviced,due_visit_state'),
    fetchAllRows<any>('sites','id,name,parent_id,address,postcode,no_longer_serviced'), fetchAllRows<any>('customers','id,name'),
    fetchAllRows<any>('customer_sites','id,customer_id,site_id'), fetchAllRows<any>('asset_service_history','id,asset_id,job_id,inspection_date,inspection_type,template_name,result_summary'),
    fetchAllRows<any>('defects','id,asset_id,site_id,job_id,title,status,created_at'),
    fetchAllRows<any>('job_sheet_responses','id,job_id,responses,status'), fetchAllRows<any>('jobs','id,reference_number,status,due_date,source'),
    fetchAllRows<any>('job_risers','id,job_id,asset_id,selected')
  ]);
  const siteMap = new Map(sites.map(s=>[s.id,s])); const customerMap = new Map(customers.map(c=>[c.id,c]));
  return assets.filter(a=>isDryRiserAsset(a) && a.status !== 'decommissioned').map(asset=>{
    const site = siteMap.get(asset.site_id);
    let parent = site; let customerId: string | undefined; let excluded = false; const seen = new Set<string>();
    while (parent && !seen.has(parent.id)) { seen.add(parent.id); excluded ||= Boolean(parent.no_longer_serviced); customerId ||= links.find(l=>l.site_id===parent.id)?.customer_id; parent = siteMap.get(parent.parent_id); }
    const customer = customerMap.get(customerId);
    const h = history.filter(h=>h.asset_id===asset.id); const cycle = visitCycle(asset,h);
    const isOpen = (job:any) => job && !['completed','archived','cancelled','submitted_for_review','pending_review'].includes(job.status);
    const bookedLink = jobRisers.map(link=>({link,job:jobs.find(j=>j.id===link.job_id)})).find(({link,job})=>link.selected && link.asset_id===asset.id && isOpen(job) && job?.due_date && (!cycle.last || job.due_date>=cycle.last));
    const bookedSheet = sheets.map(s=>({ sheet:s,job:jobs.find(j=>j.id===s.job_id) })).find(({sheet,job})=>sheet.responses?._riser_visit?.asset_id===asset.id && isOpen(job) && job?.due_date && (!cycle.last || job.due_date>=cycle.last) && (!cycle.type || sheet.responses._riser_visit.visit_type===cycle.type));
    const booked = bookedLink || bookedSheet;
    return { asset,site:site ? {...site,no_longer_serviced:excluded} : site,customer,history:h,cycle,booked:booked?.job || null, defects:defects.filter(d=>d.asset_id===asset.id && ['open','in_progress'].includes(d.status)) };
  });
}
export type RiserVisitRow = Awaited<ReturnType<typeof loadRiserVisitData>>[number];
