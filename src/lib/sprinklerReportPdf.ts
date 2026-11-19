import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {supabase} from '@/integrations/supabase/client';
import {renderPdfHeader} from '@/lib/pdfHeader';
import {getGeneratingOrgFallbackLogoUrl} from '@/lib/generatingOrgBranding';
import {parseHexColor} from '@/lib/documentBrandingProfile';
import {visibleSections} from '@/lib/sprinklerReport';
import {ZONE_CHECKS,VISIT_TYPE_LABEL,UNIT_RESULT_LABEL,compareUnitLabels,sprinklerReportFilename,type VisitType} from '@/lib/sprinklers';

const BLUE:[number,number,number]=[30,64,175];
const isRed=([r,g,b]:number[])=>r>150&&r>g*1.6&&r>b*1.6;
const ukDate=(d?:string|null)=>{if(!d)return '';const [y,m,dd]=d.slice(0,10).split('-');return `${dd}/${m}/${y}`;};
const yn=(v:any)=>({Y:'Yes',N:'No',NA:'N/A'} as any)[String(v||'').toUpperCase()]||'—';

/** Loads everything for one sprinkler report and returns the PDF blob plus its file name. */
export async function buildSprinklerReportPdf(reportId:string):Promise<{blob:Blob;filename:string}>{
 const {data:r,error}=await supabase.from('sprinkler_reports').select('*').eq('id',reportId).single();if(error)throw error;
 const [{data:sys},{data:units},{data:job}]=await Promise.all([
  supabase.from('sprinkler_systems').select('*').eq('id',r.system_id).single(),
  supabase.from('sprinkler_units').select('*').eq('system_id',r.system_id),
  supabase.from('jobs').select('reference_number,customer_po,customers(name),sites(name,address,postcode)').eq('id',r.job_id).single(),
 ]);
 const [{data:org},{data:eb}]=await Promise.all([supabase.from('organisations').select('name,logo_url,primary_color').eq('id',r.org_id).maybeSingle(),supabase.from('email_branding').select('brand_color,company_name,logo_url').eq('org_id',r.org_id).maybeSingle()]);
 let accent=(parseHexColor((org as any)?.primary_color)||parseHexColor((eb as any)?.brand_color)||BLUE) as [number,number,number];if(isRed(accent))accent=BLUE;
 const logo=(org as any)?.logo_url||(eb as any)?.logo_url||(await getGeneratingOrgFallbackLogoUrl().catch(()=>''))||'';
 const a:any=r.answers||{};const reg:any=sys?.register||{};const site:any=(job as any)?.sites||{};const customer=(job as any)?.customers?.name||'';
 const doc=new jsPDF({unit:'mm',format:'a4'});const M=12;const W=doc.internal.pageSize.getWidth();
 let y=await renderPdfHeader(doc,'Residential Sprinkler Service',{company_name:(eb as any)?.company_name||(org as any)?.name||'',logo_url:logo},{customerName:customer,siteName:'',siteAddress:'',refNumber:'',dateVal:'',riserLocation:''},null,accent,{marginX:M,style:{title:{uppercase:false,fontSize:16},subtitleLine:{text:'BS 9251:2021',fontSize:10,fontStyle:'bold',color:[40,40,40]},detailGrid:false}});
 const table=(head:string[]|null,body:any[][],opts:any={})=>{autoTable(doc,{startY:y,margin:{left:M,right:M},head:head?[head]:undefined,body,theme:'grid',styles:{fontSize:8.5,cellPadding:1.4,textColor:[20,20,20]},headStyles:{fillColor:accent,textColor:255,fontStyle:'bold'},...opts});y=(doc as any).lastAutoTable.finalY+3;};
 const heading=(t:string)=>{if(y>270){doc.addPage();y=14;}doc.setFont('helvetica','bold');doc.setFontSize(10.5);doc.setTextColor(...accent);doc.text(t,M,y+3);y+=5;doc.setTextColor(20,20,20);};
 table(null,[['Customer',customer,'PO',(job as any)?.customer_po||'—'],['Site',[site.name,site.address,site.postcode].filter(Boolean).join(', '),'Date',ukDate(r.report_date)],['Visit',VISIT_TYPE_LABEL[r.visit_type as VisitType]||r.visit_type,'Engineer',a.engineer||'—'],['Job ref',(job as any)?.reference_number||'—','Heads',[reg.head_manufacturer,reg.head_size].filter(Boolean).join(' ')||'—']],{columnStyles:{0:{fontStyle:'bold',cellWidth:24},2:{fontStyle:'bold',cellWidth:22}}});
 const nc=[1,2,3].map(n=>[a[`nc_${n}`],a[`nc_${n}_ref`]]).filter(([t])=>String(t||'').trim());
 heading('Major non-compliances (BS 9251:2021)');table(['Non-compliance','Clause'],nc.length?nc:[['None recorded','']],{columnStyles:{1:{cellWidth:30}}});
 if(String(a.additional_defects||'').trim()){heading('Additional defects');table(null,[[a.additional_defects]]);}
 if(String(a.engineer_comments||'').trim()){heading('Engineer comments');table(null,[[a.engineer_comments]]);}
 visibleSections(sys?.system_type||'block').forEach(s=>{heading(s.title);
  if(s.register?.length)table(null,[s.register.map(([k,l])=>`${l}: ${reg[k]||'—'}`)],{styles:{fontSize:8}});
  if(s.id==='zones'){const zs:any[]=Array.isArray(a.zones)?a.zones:[];table(['Zone',...ZONE_CHECKS.map(c=>c.short),'Gauge (bar)','Sign'],zs.length?zs.map(z=>[z.name,...ZONE_CHECKS.map(c=>yn(z[c.id])),z.pressure||'—',yn(z.sign)]):[['No zones recorded','','','','','','','','']],{styles:{fontSize:7.5,halign:'center'},columnStyles:{0:{halign:'left'}}});return;}
  const rows=s.checks.map(c=>[c.label,yn(a[c.id]),a[`${c.id}_note`]||'']);(s.values||[]).forEach(v=>rows.push([v.label,a[v.id]||'—','']));
  if(rows.length)table(null,rows,{columnStyles:{1:{cellWidth:16,halign:'center'},2:{cellWidth:60}}});
 });
 heading('7. Summary');table(null,[['Overall result',a.overall_result||'—'],['Summary',a.summary||'—']],{columnStyles:{0:{fontStyle:'bold',cellWidth:30}}});
 const us=((units||[]) as any[]).sort((x,z)=>compareUnitLabels(x.label,z.label));const res:any=r.unit_results||{};
 if(us.length){doc.addPage();y=14;heading('Flat comments');table(['Flat','Heads','Result','Comment'],us.map(u=>{const x=res[u.id]||{};return [u.label,x.heads??u.head_count??'',x.result?UNIT_RESULT_LABEL[x.result as keyof typeof UNIT_RESULT_LABEL]:'Not recorded',x.note||''];}),{columnStyles:{0:{cellWidth:28},1:{cellWidth:14},2:{cellWidth:36}}});}
 if(y>235){doc.addPage();y=14;}heading('Signatures');const sy=y;
 [['Engineer',a.engineer_sig,a.engineer],['Customer',a.customer_sig,a.customer_name]].forEach(([l,sig,name],i)=>{const x=M+i*((W-2*M)/2);doc.setFontSize(8.5);doc.setFont('helvetica','bold');doc.text(String(l),x,sy+3);doc.setDrawColor(180);doc.rect(x,sy+5,(W-2*M)/2-6,22);if(sig)try{doc.addImage(String(sig),'PNG',x+2,sy+6,50,20);}catch{/* unreadable signature */}doc.setFont('helvetica','normal');doc.text(String(name||''),x,sy+31);});
 return {blob:doc.output('blob'),filename:sprinklerReportFilename(customer,site.name,r.report_date)};
}
