import {useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {Printer,Download,FileText,Loader2} from 'lucide-react';
import {toast} from 'sonner';
import {fetchSiteRisers} from '@/components/assets/siteRisers';
import {resolveJobPrintTemplate} from '@/lib/printTemplate';
export async function loadVisitSheets(jobId:string){
 const rows:any[]=[];for(let from=0;;from+=1000){const {data,error}=await supabase.from('job_sheet_responses').select('id,responses,job_sheet_templates(id,name,description,fields,footer_text,branding)').eq('job_id',jobId).is('archived_at',null).order('created_at').order('id').range(from,from+999);if(error)throw error;rows.push(...data);if(data.length<1000)break;}
 return rows.filter(r=>r.responses?._riser_visit).map(r=>({...r,responses:{...r.responses,_riser_visit:{...r.responses._riser_visit,job_id:jobId}}})).sort((a,b)=>a.responses._riser_visit.order-b.responses._riser_visit.order);
}
/** Engineer paper sheets for "Print reports": visit sheets (one per riser) plus the job type's default print template. Never stickers. */
export async function loadPrintReportRows(jobId:string){
 const visit=await loadVisitSheets(jobId);
 const {data:job}=await supabase.from('jobs').select('id,org_id,site_id,category,detected_work_types,reference_number,due_date,customers(name),sites(name,address,postcode)').eq('id',jobId).maybeSingle();
 const site:any=(job as any)?.sites;const base={job_id:jobId,customer:(job as any)?.customers?.name||null,site_name:site?.name||null,address:[site?.address,site?.postcode].filter(Boolean).join(', ')||null,job_reference:(job as any)?.reference_number||null,planned_date:(job as any)?.due_date||null};
 const printTemplate:any=job?await resolveJobPrintTemplate(job as any):null;
 const rows=[...visit];
 if(!rows.length&&job?.site_id&&printTemplate){
  const cat=String(printTemplate.job_category||'').toLowerCase();
  const risers=(await fetchSiteRisers(job.site_id).catch(()=>[])).filter(r=>/wet/.test(cat)?/wet/i.test(r.asset_type||''):/dry/.test(cat)?!/wet/i.test(r.asset_type||''):true);
  risers.forEach((r,i)=>rows.push({id:`riser-${r.id}`,job_sheet_templates:printTemplate,responses:{_riser_visit:{...base,order:i,asset_id:r.id,asset_tag:r.asset_tag,riser_location:r.riser_location,outlets_count:r.outlets_count}}}));
 }
 if(printTemplate&&!rows.some(r=>r.job_sheet_templates?.id===printTemplate.id))rows.push({id:'print-template',job_sheet_templates:printTemplate,responses:{_riser_visit:{...base,order:rows.length,riser_location:null}}});
 return rows;
}
export async function buildVisitPdf(rows:any[]){
 const [{PDFDocument},{generateBlankSheetPdfBlob}]=await Promise.all([import('pdf-lib'),import('@/lib/generateBlankSheetPdf')]);const merged=await PDFDocument.create();
 for(const row of rows){const ctx=row.responses._riser_visit;const template=row.job_sheet_templates;if(!template)throw new Error('Job sheet template unavailable');const blob=await generateBlankSheetPdfBlob(template,{address:ctx.address,customer:ctx.customer,reference_number:ctx.job_reference,due_date:ctx.planned_date,site:{name:ctx.site_name,address:ctx.address,postcode:null,contact_name:null,contact_phone:null,contact_email:null,riser_location:ctx.riser_location},riserVisit:ctx},{copiesOverride:1,watermarkOverride:{mode:'untinted',opacity:0.11}});const source=await PDFDocument.load(await blob.arrayBuffer());if(source.getPageCount()!==1)throw new Error(`${ctx.riser_location||template.name}: paperwork does not fit on one page. Shorten the visit context before printing.`);const pages=await merged.copyPages(source,[0]);pages.forEach(p=>merged.addPage(p));}
 return new Blob([await merged.save() as BlobPart],{type:'application/pdf'});
}
export default function VisitPaperwork({jobId,children}:{jobId:string;children?:React.ReactNode}){const [busy,setBusy]=useState(false);
 const run=async(mode:'print'|'pdf'|'word')=>{const tab=mode==='print'?window.open('about:blank','_blank'):null;setBusy(true);try{const rows=await loadPrintReportRows(jobId);if(!rows.length)throw new Error('No engineer service sheets for this job yet. Add a visual inspection report or risers to the site.');let blob:Blob;let ext:string;if(mode==='word'){const [{buildVisitTemplateDoc},{Packer}]=await Promise.all([import('@/lib/wordTemplateBuilder'),import('docx')]);const doc=await buildVisitTemplateDoc(rows.map(row=>({...row.job_sheet_templates,riserVisit:row.responses._riser_visit})));blob=await Packer.toBlob(doc);ext='docx';}else{blob=await buildVisitPdf(rows);ext='pdf';}const url=URL.createObjectURL(blob);if(mode==='print'){if(!tab)throw new Error('Allow pop-ups to print paperwork');tab.location.href=url;tab.onload=()=>tab.print();}else{const link=document.createElement('a');link.href=url;link.download=`${rows[0].responses._riser_visit.job_reference||'job'}-riser-paperwork.${ext}`;link.click();}setTimeout(()=>URL.revokeObjectURL(url),120000);}catch(e:any){tab?.close();toast.error('Paperwork could not be generated',{description:e.message});}finally{setBusy(false);}};
 return <div className="flex flex-wrap items-center gap-2 mb-4"><Button variant="outline" disabled={busy} onClick={()=>run('print')}><Printer className="mr-2 h-4 w-4"/>Print reports</Button>{children}<Button variant="outline" disabled={busy} onClick={()=>run('pdf')}><Download className="mr-2 h-4 w-4"/>Download PDF</Button><Button variant="outline" disabled={busy} onClick={()=>run('word')}><FileText className="mr-2 h-4 w-4"/>Download Word</Button>{busy&&<Loader2 className="h-5 w-5 animate-spin self-center"/>}</div>;
}
