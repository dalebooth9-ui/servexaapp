import {describe,it,expect,vi,beforeEach} from 'vitest';
const state=vi.hoisted(()=>({orgId:'company-a',name:'Company A',logo:'a.png'}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{
 auth:{getUser:async()=>({data:{user:{id:'staff'}}})},
 rpc:async()=>({data:state.orgId,error:null}),
 from:()=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{id:state.orgId,name:state.name,logo_url:state.logo},error:null})};return q;},
}}));
import {getGeneratingOrgFallbackLogoUrl,getGeneratingOrgFallbackAccreditations,getGeneratingOrgWatermarkUrl,servicedByText,VIVA_ORG_ID} from '@/lib/generatingOrgBranding';
describe('print company isolation',()=>{
 beforeEach(()=>Object.assign(state,{orgId:'company-a',name:'Company A',logo:'a.png'}));
 it('does not reuse the prior company logo after a company switch',async()=>{
  expect(await getGeneratingOrgFallbackLogoUrl()).toBe('a.png');state.orgId='company-b';state.logo='b.png';
  expect(await getGeneratingOrgFallbackLogoUrl()).toBe('b.png');
 });
 it('never gives another company Viva accreditation badges',async()=>expect(await getGeneratingOrgFallbackAccreditations()).toEqual([]));
 it('uses the other company logo as its watermark, not the Viva flame',async()=>expect(await getGeneratingOrgWatermarkUrl()).toBe('a.png'));
 it('retains bundled Viva assets for Viva only',async()=>{state.orgId=VIVA_ORG_ID;expect(await getGeneratingOrgFallbackLogoUrl()).toBe('/images/vivafire-logo-new.png');expect(await getGeneratingOrgFallbackAccreditations()).toHaveLength(4);});
 it('names the generating company in the service footer',()=>{expect(servicedByText({isViva:false,name:'Company B'})).toBe('Serviced by Company B');expect(servicedByText({isViva:true,name:'Viva Fire'})).toBe('Serviced by Viva Fire Protection Ltd');});
});