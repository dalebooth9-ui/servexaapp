import {describe,it,expect,vi} from 'vitest';
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
import {fetchOrgRows,requireCurrentOrgId} from '@/lib/tenantQueries';
describe('company lookup boundaries',()=>{
 it('paginates sites with the signed-in company filter on every page',async()=>{
  const seen:any[]=[];let page=0;
  const q:any={select:()=>q,eq:(k:string,v:string)=>{seen.push([k,v]);return q;},order:()=>q,range:async()=>({data:page++===0?Array.from({length:1000},(_,id)=>({id})):[],error:null})};
  const client={rpc:vi.fn().mockResolvedValue({data:'company-a',error:null}),from:()=>q};
  expect(await fetchOrgRows('sites','id','id',client)).toHaveLength(1000);
  expect(seen).toEqual([['org_id','company-a'],['org_id','company-a']]);
 });
 it('refuses lookups without a signed-in company',async()=>{
  const from=vi.fn();const client={rpc:async()=>({data:null,error:null}),from};
  await expect(fetchOrgRows('assets','id','id',client)).rejects.toThrow('Sign in to a company');
  expect(from).not.toHaveBeenCalled();
 });
 it('propagates an authorisation failure instead of using another company',async()=>{
  const error=new Error('not authorised');
  await expect(requireCurrentOrgId({rpc:async()=>({data:null,error})})).rejects.toBe(error);
 });
});