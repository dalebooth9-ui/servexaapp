import {describe,it,expect,vi} from 'vitest';
const fixtures=vi.hoisted(()=>({membership:[{asset_id:'a',selected:true},{asset_id:'b',selected:true},{asset_id:'c',selected:true},{asset_id:'d',selected:true}]}));
vi.mock('@/lib/jobRisers',()=>({loadJobRisers:async()=>fixtures.membership,useJobRisers:()=>[]}));
vi.mock('@/components/assets/siteRisers',()=>({fetchSiteRisers:async()=>['a','b','c','d'].map(id=>({id,asset_tag:id,riser_location:id,outlets_count:8}))}));
vi.mock('@/lib/printTemplate',()=>({resolveJobPrintTemplate:async()=>({id:'template',job_category:'dry_riser_pressure_test'})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>{const q:any={};for(const m of ['select','eq','is','order','in','limit'])q[m]=()=>q;q.range=async()=>({data:[],error:null});q.maybeSingle=async()=>({data:{id:'job',site_id:'site',category:'dry_riser_pressure_test'},error:null});q.then=(resolve:any)=>Promise.resolve({data:[],error:null}).then(resolve);return q;}}}));
import {loadPrintReportRows} from '@/components/riser-visits/VisitPaperwork';
describe('saved job riser print selection',()=>{
 it('four ticked risers produce four distinct riser sheets',async()=>{const r=await loadPrintReportRows('job');expect(r.rows.map(r=>r.responses._riser_visit.asset_id)).toEqual(['a','b','c','d']);});
 it('unticking excludes only that riser',async()=>{fixtures.membership[1].selected=false;const r=await loadPrintReportRows('job');expect(r.rows.map(r=>r.responses._riser_visit.asset_id)).toEqual(['a','c','d']);fixtures.membership[1].selected=true;});
 it('one ticked riser produces one riser sheet',async()=>{fixtures.membership.forEach((r,i)=>r.selected=i===0);const r=await loadPrintReportRows('job');expect(r.rows).toHaveLength(1);fixtures.membership.forEach(r=>r.selected=true);});
});