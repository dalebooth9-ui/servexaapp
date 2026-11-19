import {addMonths,format,parseISO} from 'date-fns';
import {paperReportFilename} from '@/lib/paperReportDownload';

/** Residential sprinkler (BS 9251) register, flat list and reminder rules. */
export type SprinklerSystemType='block'|'house'|'mist';
export const SYSTEM_TYPE_LABEL:Record<SprinklerSystemType,string>={block:'Apartment block (shared plant)',house:'Single house / bungalow',mist:'Mist / deluge (care home)'};
export type SprinklerRegister={
 supply_room_location?:string;supply_type?:string;
 tank_location?:string;tank_manufacturer?:string;tank_type?:string;
 pump_location?:string;pump_manufacturer?:string;pump_type?:string;pump_rated_flow?:string;pump_rated_pressure?:string;
 panel_location?:string;panel_make?:string;panel_monitored_by?:string;
 head_manufacturer?:string;head_size?:string;access_notes?:string;
};
export type SprinklerZone={id:string;name:string};
export type UnitResult='ok'|'no_access'|'remedial';
export const UNIT_RESULT_LABEL:Record<UnitResult,string>={ok:'OK',no_access:'No access / no answer',remedial:'Remedial needed'};
export type VisitType='annual'|'six_month'|'quarterly';
export const VISIT_TYPE_LABEL:Record<VisitType,string>={annual:'Annual',six_month:'Bi-annual (6 month)',quarterly:'Quarterly'};

/** Turn "1-83", "1-3, 5, Flat 7A" or a pasted list (one per line) into unit labels, in order, without repeats. */
export function parseUnitLabels(input:string,prefix=''):string[]{
 const out:string[]=[];const seen=new Set<string>();
 const add=(l:string)=>{const v=l.trim();if(!v)return;const key=v.toLowerCase();if(seen.has(key))return;seen.add(key);out.push(v);};
 input.split(/[\n,;]+/).forEach(part=>{const p=part.trim();const m=p.match(/^(\d{1,4})\s*[-–]\s*(\d{1,4})$/);
  if(m){const a=Number(m[1]),b=Number(m[2]);if(b>=a&&b-a<=999)for(let i=a;i<=b;i++)add(`${prefix}${i}`);return;}
  add(/^\d+$/.test(p)?`${prefix}${p}`:p);});
 return out;
}

/** Natural sort so Flat 2 comes before Flat 10. */
export const compareUnitLabels=(a:string,b:string)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'});

/** Next reminder. Single houses: annual only. Blocks / mist: every 6 months, alternating annual and 6 month. */
export function sprinklerDue(sys:{system_type:SprinklerSystemType|string;last_annual?:string|null;last_six_month?:string|null}):{due:string|null;type:VisitType|null;last:string|null}{
 const la=sys.last_annual||null;const ls=sys.last_six_month||null;
 if(sys.system_type==='house'){return {due:la?format(addMonths(parseISO(la),12),'yyyy-MM-dd'):null,type:'annual',last:la};}
 const last=[la,ls].filter(Boolean).sort().pop()||null;
 if(!last)return {due:null,type:null,last:null};
 const due=format(addMonths(parseISO(last),6),'yyyy-MM-dd');
 const annualDue=la?format(addMonths(parseISO(la),12),'yyyy-MM-dd'):due;
 return {due,type:annualDue<=due?'annual':'six_month',last};
}

/** Flats whose head count this visit differs from last year (so changes stand out). */
export function headCountChanged(previous:number|null|undefined,current:string|number|null|undefined){
 if(current===''||current===null||current===undefined||previous===null||previous===undefined)return false;
 return Number(current)!==Number(previous);
}

export type DefectProposal={key:string;title:string;description:string;raise:boolean;location?:string;clause?:string;severity?:string};
/** Build 'Raise as defect' proposals from failed checks, non-compliances and per-flat remedials. Ticked by default. */
export function proposeSprinklerDefects(input:{answers:Record<string,any>;checks:{id:string;label:string}[];units:{id:string;label:string}[];unitResults:Record<string,{result?:string;note?:string}>}):DefectProposal[]{
 const out:DefectProposal[]=[];const a=input.answers||{};
 [1,2,3].forEach(n=>{const t=String(a[`nc_${n}`]||'').trim();if(t)out.push({key:`nc:${n}`,title:t,description:t,raise:true,clause:String(a[`nc_${n}_ref`]||'').trim()||undefined,severity:'high'});});
 input.checks.forEach(c=>{if(String(a[c.id]||'').toUpperCase()==='N')out.push({key:`check:${c.id}`,title:`Failed check: ${c.label}`,description:String(a[`${c.id}_note`]||'').trim()||c.label,raise:true});});
 (Array.isArray(a.zones)?a.zones:[]).forEach((z:any)=>{const bad=ZONE_CHECKS.filter(k=>String(z?.[k.id]||'').toUpperCase()==='N');if(bad.length)out.push({key:`zone:${z.id||z.name}`,title:`Zone valve ${z.name||''}: ${bad.map(b=>b.short).join(', ')}`.trim(),description:bad.map(b=>b.label).join('; '),raise:true,location:z.name});});
 input.units.forEach(u=>{const r=input.unitResults[u.id];if(r?.result==='remedial'){const note=String(r.note||'').trim();out.push({key:`unit:${u.id}`,title:`${u.label}: ${note||'Remedial needed'}`.slice(0,200),description:note||'Remedial needed',raise:!/by others/i.test(note),location:u.label});}});
 return out;
}

export const ZONE_CHECKS=[
 {id:'no_damage',label:'Free of damage / leaks',short:'damage/leaks'},
 {id:'iso_secured',label:'Isolation valve exercised & secured open',short:'isolation valve'},
 {id:'fault_signal',label:'Fault signal when valve closed',short:'fault signal'},
 {id:'flow_switch',label:'Flow switch tested, fire signal received',short:'flow switch'},
 {id:'drain_plug',label:'Drain plug fitted',short:'drain plug'},
 {id:'test_drain',label:'Test drain exercised & closed',short:'test drain'},
] as const;

/** Customer - Site - dd-mm-yyyy - Residential Sprinkler Service.pdf */
export const sprinklerReportFilename=(customer?:string|null,site?:string|null,date?:string|null)=>paperReportFilename(customer,site,date,'Residential Sprinkler Service');

/** Register values for the BS 9251 job-sheet templates (only fills blanks; engineers change what differs). */
export function sprinklerTemplatePrefill(sys:{system_type:string;register:SprinklerRegister;zones:SprinklerZone[]}|null,fieldIds:Set<string>):Record<string,any>{
 if(!sys)return {};const r=sys.register||{};const out:Record<string,any>={};
 const map:Record<string,string|undefined>={wsr_location:r.supply_room_location,wsr_supply_type:r.supply_type,tank_location:r.tank_location,tank_manufacturer:r.tank_manufacturer,tank_type:r.tank_type,pump_location:r.pump_location,pump_manufacturer:r.pump_manufacturer,pump_type:r.pump_type,pump_plated_flow_req:r.pump_rated_flow,pump_plated_pressure_req:r.pump_rated_pressure,panel_location:r.panel_location,panel_manufacturer:r.panel_make,site_access_notes:r.access_notes,head_manufacturer:r.head_manufacturer,head_size:r.head_size};
 Object.entries(map).forEach(([k,v])=>{if(v&&fieldIds.has(k))out[k]=v;});
 if(fieldIds.has('property_type'))out.property_type=sys.system_type==='house'?'Single Dwelling (House/Flat)':sys.system_type==='mist'?'Care Home / Sheltered':'Block of Flats';
 if(fieldIds.has('zone_valve_checks')&&sys.zones?.length)out.zone_valve_checks=sys.zones.map(z=>({id:z.id,zone_name:z.name}));
 return out;
}
export const isResidentialSprinklerTemplate=(t:{name?:string|null;category?:string|null;job_category?:string|null})=>/sprinkler/i.test(`${t.name||''} ${t.category||''} ${t.job_category||''}`)&&!/commercial|12845/i.test(`${t.name||''} ${t.category||''}`);
