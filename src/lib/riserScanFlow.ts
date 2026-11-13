import { buildJobSheetPrefill, type PrefillField } from './jobSheetPrefill';
export type ScanJobChoice={id:string;reference:string;name:string;date:string|null};
export const RISER_LOAD_ERROR = "Couldn't load the site details. Check your signal and try again";
export type RiserReportContext = {job_id:string;job_reference:string;asset_id:string;asset_tag:string;riser_location:string;riser_name:string;outlets_count:number;inlets_count:number;site_name:string;address:string;postcode?:string;customer:string;outlet_codes:{total:number;tags:Record<string,number>}};
/** Standing identity only: never supply inspection answers or signing names. */
export function riserIdentityPrefill(fields:PrefillField[], ctx:RiserReportContext):Record<string,any> {
 const data=buildJobSheetPrefill(fields.filter(f=>!f.options?.length && ['text','textarea','number'].includes(f.type) && !/^(customer_name|technician_name)$/.test(f.id)),{customer:ctx.customer,reference_number:ctx.job_reference,site:{name:ctx.site_name,address:ctx.address,postcode:ctx.postcode}});
 for(const f of fields){
  if(f.options?.length || !['text','textarea','number'].includes(f.type))continue;
  const label=`${f.id.replace(/_/g,' ')} ${f.label}`;
  if(/outlet/i.test(label)&&f.type==='number')data[f.id]=String(ctx.outlets_count);
  else if(/inlet/i.test(label)&&f.type==='number')data[f.id]=String(ctx.inlets_count);
  else if(/riser.*(location|loc)/i.test(label))data[f.id]=ctx.riser_location;
  else if(/riser.*(code|tag|id)\b/i.test(label))data[f.id]=ctx.asset_tag;
 }
 return {...data,riser_asset_id:ctx.asset_id,riser_location:ctx.riser_location,riser_id:ctx.asset_tag,riser_name:ctx.riser_name,site_name:ctx.site_name,site_address:ctx.address,job_reference:ctx.job_reference,inlets_count:ctx.inlets_count,outlets_count:ctx.outlets_count};
}
export function riserReportUrl(jobId:string,responseId:string,templateId:string){
 return `/jobs/${encodeURIComponent(jobId)}?riserScan=1&response=${encodeURIComponent(responseId)}&template=${encodeURIComponent(templateId)}`;
}
export function isScanPrivateField(field:{id?:string;label?:string}){
 return /\b(po|purchase order|price|cost|quote|rate|amount|subtotal|vat)\b/i.test(`${field.id||''} ${field.label||''}`.replace(/_/g,' '));
}