import {supabase} from '@/integrations/supabase/client';
import {sprinklerReportFilename} from '@/lib/sprinklers';
import {sprinklerReportSheet} from '@/lib/sprinklerReportSheet';
import {generateBlankSheetPdfBlob} from '@/lib/generateBlankSheetPdf';
import {dataUrlToFill} from '@/lib/archivePdfBuilder';

const ukDate=(d?:string|null)=>{if(!d)return '';const [y,m,dd]=d.slice(0,10).split('-');return `${dd}/${m}/${y}`;};

/** Loads one sprinkler report and prints it on the multi-page Viva printed sheet. Returns the PDF blob plus its file name. */
export async function buildSprinklerReportPdf(reportId:string):Promise<{blob:Blob;filename:string}>{
 const {data:r,error}=await supabase.from('sprinkler_reports').select('*').eq('id',reportId).single();if(error)throw error;
 const [{data:sys,error:e1},{data:units,error:e2},{data:job,error:e3}]=await Promise.all([
  supabase.from('sprinkler_systems').select('*').eq('id',r.system_id).single(),
  supabase.from('sprinkler_units').select('id,label,head_count,revisit_pending').eq('system_id',r.system_id),
  supabase.from('jobs').select('id,site_id,reference_number,customer_po,customers(name,logo_url),sites(name,address,postcode)').eq('id',r.job_id).single(),
 ]);
 if(e1||e2||e3)throw (e1||e2||e3);
 const a:any=r.answers||{};const reg:any=(sys as any)?.register||{};const site:any=(job as any)?.sites||{};const customer=(job as any)?.customers?.name||'';
 const sheet=sprinklerReportSheet({report:r as any,system:sys as any,units:(units||[]) as any});
 const raised=((Array.isArray((r as any).defects)?(r as any).defects:[]) as any[]).filter(d=>d&&d.raise!==false);
 const date=ukDate(r.report_date);
 const techSig=await dataUrlToFill(a.engineer_sig);const custSig=await dataUrlToFill(a.customer_sig);
 // A saved signature that can't load stops the PDF rather than sending it unsigned.
 if((a.engineer_sig&&!techSig)||(a.customer_sig&&!custSig))throw new Error(`The ${a.engineer_sig&&!techSig?'engineer':'customer'} signature couldn't be loaded, so the PDF wasn't made. Please try again.`);
 const blob=await generateBlankSheetPdfBlob(
  {id:`sprinkler-${r.id}`,name:sheet.name,description:null,fields:sheet.fields},
  {id:(job as any)?.id,site_id:(job as any)?.site_id,address:site.address||null,customer,customers:(job as any)?.customers||null,reference_number:(job as any)?.reference_number||'',customer_po:(job as any)?.customer_po||null,poOnly:true,due_date:r.report_date,
   locationLabel:'SYSTEM / PLANT LOCATION:',
   site:{name:site.name||'',address:site.address||null,postcode:site.postcode||null,contact_name:null,contact_phone:null,contact_email:null,riser_location:[reg.supply_room_location,reg.supply_type].filter(Boolean).join(' - ')||null},
   riserVisit:(sys as any)?.qr_tag?{asset_id:(sys as any)?.asset_id||null,asset_tag:(sys as any).qr_tag}:null,
   sheetDefects:raised.map(d=>({title:d.title,location:d.location||null,priority:d.severity||null})),
   filled:{answers:sheet.answers,techName:a.engineer||null,techDate:date,techSig,custName:a.customer_name||null,custDate:a.customer_sig||a.customer_name?date:null,custSig}},
  {copiesOverride:1,watermarkOverride:{mode:'untinted',opacity:0.12} as any},
 );
 return {blob,filename:sprinklerReportFilename(customer,site.name,r.report_date)};
}
