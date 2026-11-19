import {describe,it,expect} from 'vitest';
import {parseUnitLabels,sprinklerDue,proposeSprinklerDefects,sprinklerReportFilename,headCountChanged,sprinklerTemplatePrefill} from '@/lib/sprinklers';

describe('residential sprinklers',()=>{
 it('bulk-adds flats 1-83',()=>{const l=parseUnitLabels('1-83','Flat ');expect(l).toHaveLength(83);expect(l[0]).toBe('Flat 1');expect(l[82]).toBe('Flat 83');});
 it('accepts a pasted list without repeats',()=>{expect(parseUnitLabels('Room 1\nRoom 2\nroom 1\nLounge')).toEqual(['Room 1','Room 2','Lounge']);});
 it('single houses are annual only',()=>{expect(sprinklerDue({system_type:'house',last_annual:'2025-07-12',last_six_month:'2026-01-10'})).toEqual({due:'2026-07-12',type:'annual',last:'2025-07-12'});});
 it('blocks are due 6 months after the last visit, alternating',()=>{expect(sprinklerDue({system_type:'block',last_annual:'2025-07-12'})).toMatchObject({due:'2026-01-12',type:'six_month'});expect(sprinklerDue({system_type:'block',last_annual:'2025-07-12',last_six_month:'2026-01-12'})).toMatchObject({due:'2026-07-12',type:'annual'});});
 it('no history means no due date yet',()=>{expect(sprinklerDue({system_type:'mist'}).due).toBeNull();});
 it('per-flat remedials become ticked defects, by-others unticked',()=>{const p=proposeSprinklerDefects({answers:{},checks:[],units:[{id:'a',label:'Flat 4'},{id:'b',label:'Flat 5'}],unitResults:{a:{result:'remedial',note:'Head painted'},b:{result:'remedial',note:'Extractor fan to close, by others'}}});expect(p.map(x=>x.raise)).toEqual([true,false]);expect(p[0].title).toBe('Flat 4: Head painted');});
 it('failed checks and non-compliances are proposed',()=>{const p=proposeSprinklerDefects({answers:{tank_leaks:'N',nc_1:'No pump test',nc_1_ref:'19.3'},checks:[{id:'tank_leaks',label:'Tank free of leaks'}],units:[],unitResults:{}});expect(p.map(x=>x.key)).toEqual(['nc:1','check:tank_leaks']);expect(p[0].clause).toBe('19.3');});
 it('names the PDF Customer - Site - dd-mm-yyyy - Residential Sprinkler Service',()=>{expect(sprinklerReportFilename('ABCA','Oak Court','2026-07-12')).toBe('ABCA - Oak Court - 12-07-2026 - Residential Sprinkler Service.pdf');});
 it('flags changed head counts only when both are known',()=>{expect(headCountChanged(4,'5')).toBe(true);expect(headCountChanged(4,'4')).toBe(false);expect(headCountChanged(null,'4')).toBe(false);});
 it('pre-fills template register fields',()=>{const p=sprinklerTemplatePrefill({system_type:'block',register:{tank_manufacturer:'Tyco'},zones:[{id:'z1',name:'Ground'}]},new Set(['tank_manufacturer','property_type','zone_valve_checks']));expect(p).toEqual({tank_manufacturer:'Tyco',property_type:'Block of Flats',zone_valve_checks:[{id:'z1',zone_name:'Ground'}]});});
});
