import {describe,it,expect} from 'vitest';
import {printBrandingChoice,isPrintableFinancialField} from '@/lib/printBrandingRules';
describe('customer print branding',()=>{
 it('defaults OFF even when a customer has a logo and colour',()=>expect(printBrandingChoice({logo_url:'customer.png',brand_colour:'#c8102e'},'viva.png')).toEqual({enabled:false,logoUrl:'viva.png',colour:null}));
 it('ON selects print logo and saved colour',()=>expect(printBrandingChoice({use_print_branding:true,print_logo_url:'besseges.png',brand_colour:'#c8102e'},'viva.png')).toEqual({enabled:true,logoUrl:'besseges.png',colour:'#c8102e'}));
 it('ON without a logo falls back to Viva',()=>expect(printBrandingChoice({use_print_branding:true},'viva.png').logoUrl).toBe('viva.png'));
 it('filters prices and costs but not pressure readings or outlets',()=>{expect(isPrintableFinancialField({id:'total_cost',label:'Total cost'})).toBe(true);expect(isPrintableFinancialField({label:'Price'})).toBe(true);expect(isPrintableFinancialField({label:'Test pressure (bar)'})).toBe(false);expect(isPrintableFinancialField({label:'Number of outlets'})).toBe(false);});
});