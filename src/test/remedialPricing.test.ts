import { describe,it,expect } from 'vitest';
import { customerCatalogue,priceSuggestions,attendanceFee,type PriceItem } from '../../supabase/functions/_shared/remedialPricing';
const item=(id:string,description:string,unit_price:number,extra:Partial<PriceItem>={}):PriceItem=>({id,description,unit_price,pricing_kind:'remedial',...extra});
describe('uploaded remedial price rules',()=>{
 it('charges £40 locally below £95',()=>expect(attendanceFee(94.99,'local','Other')).toBe(40));
 it('charges £60 further away below £95',()=>expect(attendanceFee(25,'distant','Other')).toBe(60));
 it('does not charge at the £95 threshold',()=>expect(attendanceFee(95,'local','Other')).toBe(0));
 it('does not invent locality when the address is missing',()=>expect(attendanceFee(25,'unknown','Other')).toBeNull());
 it('uses office-editable amounts',()=>expect(attendanceFee(99,'local','Other',{threshold:100,local_fee:45,distant_fee:65})).toBe(45));
 it('Safely Comply pays one £40 certification/attendance fee',()=>expect(attendanceFee(200,'distant','Safely Comply')).toBe(40));
 it('Integrity pays one £40 certification/attendance fee',()=>expect(attendanceFee(200,'distant','Integrity Security Group Ltd')).toBe(40));
 it('Newquay inlet lock £60 replaces general £55',()=>{const p=customerCatalogue([item('general','Inlet lock',55),item('newquay','Inlet lock',60,{customer_id:'newquay',rate_list:'Newquay Fire'})],'newquay');expect(p.map(x=>x.unit_price)).toEqual([60]);});
 it('other customers retain the £55 inlet lock',()=>expect(customerCatalogue([item('general','Inlet lock',55),item('newquay','Inlet lock',60,{customer_id:'newquay'})],'other').map(x=>x.unit_price)).toEqual([55]));
 it('new inlet sign matches the £25 inlet sign, not the outlet sign',()=>expect(priceSuggestions('Supply and fit new inlet sign',[item('in','Inlet sign',25),item('out','Outlet sign',25)]).map(x=>x.id)).toEqual(['in']));
 it('inlet box needs securing offers Bracket or Padlocks & straps',()=>expect(priceSuggestions('inlet box needs securing',[item('bracket','Bracket',150),item('padlock','Padlocks & straps',25)]).map(x=>x.id)).toEqual(['bracket','padlock']));
 it('blank powder price stays price-needed, not a priced catalogue item',()=>expect(customerCatalogue([item('powder','Powder extinguisher',0,{customer_id:'safe',price_needed:true})],'safe')[0].price_needed).toBe(true));
 it('servicing and unassigned Wayne rates never enter remedial matching',()=>expect(customerCatalogue([item('wayne','Extinguisher service',4.5,{rate_list:"Wayne's rates",pricing_kind:'servicing'}),item('service','Extinguisher service',5.5,{customer_id:'integrity',pricing_kind:'servicing'})],'integrity')).toEqual([]));
});