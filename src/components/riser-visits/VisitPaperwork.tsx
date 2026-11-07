import {useState,useRef,useEffect} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {Printer,Download,FileText,Loader2} from 'lucide-react';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {Checkbox} from '@/components/ui/checkbox';
import {fetchSiteRisers} from '@/components/assets/siteRisers';
import {resolveJobPrintTemplate} from '@/lib/printTemplate';
import {logReportsPrinted} from '@/lib/jobCategoryChange';
import {loadJobRisers,useJobRisers,reportCountLabel} from '@/lib/jobRisers';
export async function loadVisitSheets(jobId:string){
 const rows:any[]=[];for(let from=0;;from+=1000){const {data,error}=await supabase.from('job_sheet_responses').select('id,responses,job_sheet_templates(id,name,description,fields,footer_text,branding)').eq('job_id',jobId).is('archived_at',null).order('created_at').order('id').range(from,from+999);if(error)throw error;rows.push(...data);if(data.length<1000)break;}
 return rows.filter(r=>r.responses?._riser_visit).map(r=>({...r,responses:{...r.responses,_riser_visit:{...r.responses._riser_visit,job_id:jobId}}})).sort((a,b)=>a.responses._riser_visit.order-b.responses._riser_visit.order);
}
const nk=(t:string)=>t.toLowerCase().replace(/[^a-z0-9]+/g,'');
/** Site address once: the postcode is only added when the address doesn't already contain it. */
export function siteAddressOnce(address?:string|null,postcode?:string|null){const a=(address||'').trim();const pc=(postcode||'').trim();if(!a)return pc||null;return pc&&!nk(a).includes(nk(pc))?`${a}, ${pc}`:a;}
/** Risers linked to this job: its own riser visit sheets, the job's asset and riser_asset_id on its report answers. */
export function linkedRiserIds(job:{asset_id?:string|null}|null,responses:any[]):string[]{const ids=new Set<string>();if(job?.asset_id)ids.add(job.asset_id);for(const r of responses){const a=r?.responses;if(a?._riser_visit?.asset_id)ids.add(a._riser_visit.asset_id);if(a?.riser_asset_id)ids.add(a.riser_asset_id);}return [...ids];}
export type PrintLoad={rows:any[];pick?:import('@/components/assets/siteRisers').SiteRiser[]};
/** Engineer paper sheets for "Print reports": only this job's risers (visit sheets, else risers linked to the job, else the office's ticked risers) plus the job type's default print template. Never stickers. */
export async function loadPrintReportRows(jobId:string,pickedIds?:string[]):Promise<PrintLoad>{
 const visit=await loadVisitSheets(jobId);
 const {data:job}=await supabase.from('jobs').select('id,org_id,site_id,asset_id,category,detected_work_types,reference_number,customer_po,due_date,customers(name),sites(name,address,postcode)').eq('id',jobId).maybeSingle();
 const site:any=(job as any)?.sites;const base={job_id:jobId,customer:(job as any)?.customers?.name||null,site_name:site?.name||null,address:siteAddressOnce(site?.address,site?.postcode),job_reference:(job as any)?.reference_number||null,customer_po:(job as any)?.customer_po||null,site_id:(job as any)?.site_id||null,planned_date:(job as any)?.due_date||null};
 const printTemplate:any=job?await resolveJobPrintTemplate(job as any):null;
 const rows:any[]=visit.map(r=>({...r,responses:{...r.responses,_riser_visit:{...base,...Object.fromEntries(Object.entries(r.responses._riser_visit).filter(([,v])=>v!==null&&v!==undefined&&v!=='')),address:base.address,customer_po:base.customer_po}}}));
 const membership=await loadJobRisers(jobId);
 if(membership.length){
  const wanted=new Set(pickedIds??membership.filter(r=>r.selected).map(r=>r.asset_id));
  const existing=new Map(rows.map(r=>[r.responses._riser_visit.asset_id,r]));rows.length=0;
  const risers=job?.site_id?await fetchSiteRisers(job.site_id):[];
  for(const id of wanted){const r=risers.find(r=>r.id===id);if(!r)throw new Error('A selected riser is unavailable. Check Risers on this job.');const saved=existing.get(id);if(saved){rows.push(saved);continue;}if(!printTemplate)throw new Error('No print template for a selected riser. Choose one in Settings.');rows.push({id:`riser-${r.id}`,job_sheet_templates:printTemplate,responses:{_riser_visit:{...base,order:rows.length,asset_id:r.id,asset_tag:r.asset_tag,riser_location:r.riser_location,outlets_count:r.outlets_count}}});}
  if(!wanted.size)throw new Error('Tick at least one riser on this job before printing.');
 }
 if(!membership.length&&!rows.length&&job?.site_id&&printTemplate){
  const cat=String(printTemplate.job_category||'').toLowerCase();
  const risers=(await fetchSiteRisers(job.site_id).catch(()=>[])).filter(r=>/wet/.test(cat)?/wet/i.test(r.asset_type||''):/dry/.test(cat)?!/wet/i.test(r.asset_type||''):true);
  const {data:resp,error}=await supabase.from('job_sheet_responses').select('responses').eq('job_id',jobId).is('archived_at',null).limit(1000);if(error)throw error;
  const linked=new Set(pickedIds??linkedRiserIds(job as any,resp||[]));
  if(!linked.size&&risers.length&&!pickedIds)return {rows:[],pick:risers};
  risers.filter(r=>linked.has(r.id)).forEach((r,i)=>rows.push({id:`riser-${r.id}`,job_sheet_templates:printTemplate,responses:{_riser_visit:{...base,order:i,asset_id:r.id,asset_tag:r.asset_tag,riser_location:r.riser_location,outlets_count:r.outlets_count}}}));
 }
 // Each riser's own cabinet key type (from its record) for the CABINET KEYS box.
 const ids=[...new Set(rows.map(r=>r.responses._riser_visit.asset_id).filter(Boolean))];
 if(ids.length){const {data:keys}=await supabase.from('assets').select('id,cabinet_key_type').in('id',ids);const km=new Map((keys||[]).map((k:any)=>[k.id,k.cabinet_key_type]));rows.forEach(r=>{const c=r.responses._riser_visit;const k=km.get(c.asset_id);if(k)c.cabinet_key=k;});}
 if(printTemplate&&!rows.some(r=>r.job_sheet_templates?.id===printTemplate.id))rows.push({id:'print-template',job_sheet_templates:printTemplate,responses:{_riser_visit:{...base,order:rows.length,riser_location:null}}});
 return {rows};
}
export async function buildVisitPdf(rows:any[]){
 const [{PDFDocument},{generateBlankSheetPdfBlob}]=await Promise.all([import('pdf-lib'),import('@/lib/generateBlankSheetPdf')]);const merged=await PDFDocument.create();
 for(const row of rows){const ctx=row.responses._riser_visit;const template=row.job_sheet_templates;if(!template)throw new Error('Job sheet template unavailable');const blob=await generateBlankSheetPdfBlob(template,{id:ctx.job_id,site_id:ctx.site_id,address:ctx.address,customer:ctx.customer,customer_po:ctx.customer_po,reference_number:ctx.job_reference,due_date:ctx.planned_date,site:{name:ctx.site_name||ctx.site||null,address:ctx.address,postcode:null,contact_name:null,contact_phone:null,contact_email:null,riser_location:ctx.riser_location},riserVisit:ctx},{copiesOverride:1,watermarkOverride:{mode:'untinted',opacity:0.12}});const source=await PDFDocument.load(await blob.arrayBuffer());const pages=await merged.copyPages(source,source.getPageIndices());pages.forEach(p=>merged.addPage(p));}
 return new Blob([await merged.save() as BlobPart],{type:'application/pdf'});
}
export default function VisitPaperwork({jobId,children}:{jobId:string;children?:React.ReactNode}){const [busy,setBusy]=useState(false);const [pick,setPick]=useState<{mode:'print'|'pdf'|'word';risers:any[];ticked:string[]}|null>(null);const runRef=useRef<(m:'print')=>void>(()=>{});useEffect(()=>{const h=(e:Event)=>{const d=(e as CustomEvent).detail;if(d?.jobId===jobId){d.handled=true;runRef.current('print');}};window.addEventListener('job:reprint-reports',h);return()=>window.removeEventListener('job:reprint-reports',h);},[jobId]);
 const run=async(mode:'print'|'pdf'|'word',picked?:string[])=>{const tab=mode==='print'?window.open('about:blank','_blank'):null;setBusy(true);try{const load=await loadPrintReportRows(jobId,picked);if(load.pick){tab?.close();setPick({mode,risers:load.pick,ticked:[]});return;}const rows=load.rows;if(!rows.length)throw new Error('No engineer service sheets for this job yet. Choose a print template for this job type in Settings → Job Categories.');let blob:Blob;let ext:string;if(mode==='word'){const [{buildVisitTemplateDoc},{Packer}]=await Promise.all([import('@/lib/wordTemplateBuilder'),import('docx')]);const doc=await buildVisitTemplateDoc(rows.map(row=>({...row.job_sheet_templates,riserVisit:row.responses._riser_visit})));blob=await Packer.toBlob(doc);ext='docx';}else{blob=await buildVisitPdf(rows);ext='pdf';}const url=URL.createObjectURL(blob);if(mode==='print'){if(!tab)throw new Error('Allow pop-ups to print paperwork');tab.location.href=url;tab.onload=()=>tab.print();void logReportsPrinted(jobId);}else{const link=document.createElement('a');link.href=url;link.download=`${rows[0].responses._riser_visit.job_reference||'job'}-riser-paperwork.${ext}`;link.click();}setTimeout(()=>URL.revokeObjectURL(url),120000);}catch(e:any){tab?.close();toast.error('Paperwork could not be generated',{description:e.message});}finally{setBusy(false);}};
 const memberships=useJobRisers(jobId);runRef.current=run;return <div className="flex flex-wrap items-center gap-2 mb-4"><Button variant="outline" disabled={busy} onClick={()=>run('print')}><Printer className="mr-2 h-4 w-4"/>{reportCountLabel(memberships.filter(r=>r.selected).length)}</Button>{children}<Button variant="outline" disabled={busy} onClick={()=>run('pdf')}><Download className="mr-2 h-4 w-4"/>Download PDF</Button><Button variant="outline" disabled={busy} onClick={()=>run('word')}><FileText className="mr-2 h-4 w-4"/>Download Word</Button>{busy&&<Loader2 className="h-5 w-5 animate-spin self-center"/>}
 <Dialog open={!!pick} onOpenChange={o=>!o&&setPick(null)}><DialogContent><DialogHeader><DialogTitle>Which risers are on this job?</DialogTitle><DialogDescription>No risers are linked to this job yet. Tick the ones to print a sheet for.</DialogDescription></DialogHeader>
 <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={()=>pick&&setPick({...pick,ticked:pick.risers.map(r=>r.id)})}>Select all</Button><Button size="sm" variant="ghost" onClick={()=>pick&&setPick({...pick,ticked:[]})}>Select none</Button></div>
 <div className="max-h-72 overflow-y-auto space-y-2">{pick?.risers.map(r=><label key={r.id} className="flex items-center gap-3 text-sm"><Checkbox checked={pick.ticked.includes(r.id)} onCheckedChange={c=>setPick({...pick,ticked:c?[...pick.ticked,r.id]:pick.ticked.filter(x=>x!==r.id)})}/>{r.riser_location||'No location'}{r.asset_tag?` (${r.asset_tag})`:''}</label>)}</div>
 <DialogFooter><Button variant="outline" onClick={()=>setPick(null)}>Cancel</Button><Button disabled={!pick?.ticked.length} onClick={()=>{const p=pick;if(!p)return;setPick(null);void run(p.mode,p.ticked);}}>Print selected</Button></DialogFooter></DialogContent></Dialog></div>;
}
