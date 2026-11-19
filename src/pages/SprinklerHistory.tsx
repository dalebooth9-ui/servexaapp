import {useCallback,useEffect,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {format} from 'date-fns';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {toast} from 'sonner';
import {Download} from 'lucide-react';
import {plainError} from '@/lib/plainError';
import {SYSTEM_TYPE_LABEL,UNIT_RESULT_LABEL,VISIT_TYPE_LABEL,compareUnitLabels,sprinklerDue} from '@/lib/sprinklers';
import {buildSprinklerReportPdf} from '@/lib/sprinklerReportPdf';
import {savePaperBlob} from '@/lib/paperReportDownload';
import {RevisitList,type SprinklerUnit} from '@/components/sprinklers/SprinklerSystemCard';

const d=(v?:string|null)=>v?format(new Date(v),'dd/MM/yyyy'):'—';
/** Sprinkler history: previous reports, remedials, flat list and no-access flats. Opened from the plant QR label. */
export default function SprinklerHistory(){
 const {systemId}=useParams();const [sys,setSys]=useState<any>(null);const [site,setSite]=useState<any>(null);const [units,setUnits]=useState<SprinklerUnit[]>([]);const [reports,setReports]=useState<any[]>([]);const [defects,setDefects]=useState<any[]>([]);const [err,setErr]=useState('');
 const load=useCallback(async()=>{const {data:s,error}=await supabase.from('sprinkler_systems').select('*').eq('id',systemId!).maybeSingle();if(error||!s){setErr(error?plainError(error):'Sprinkler system not found for your company.');return;}setSys(s);
  const [{data:si},{data:u},{data:r},{data:df}]=await Promise.all([supabase.from('sites').select('id,name,address,postcode').eq('id',s.site_id).maybeSingle(),supabase.from('sprinkler_units').select('*').eq('system_id',s.id),supabase.from('sprinkler_reports').select('id,job_id,status,report_date,visit_type,jobs(reference_number)').eq('system_id',s.id).order('report_date',{ascending:false}),supabase.from('defects').select('id,title,status,created_at,location_on_site').eq('site_id',s.site_id).or(`asset_id.eq.${s.asset_id||'00000000-0000-0000-0000-000000000000'},category.eq.sprinkler`).order('created_at',{ascending:false}).limit(100)]);
  setSite(si);setUnits(((u||[]) as SprinklerUnit[]).sort((a,b)=>compareUnitLabels(a.label,b.label)));setReports(r||[]);setDefects(df||[]);},[systemId]);
 useEffect(()=>{load();},[load]);
 if(err)return <p role="alert" className="p-6 text-destructive">{err}</p>;
 if(!sys)return <p className="p-6 text-muted-foreground">Loading…</p>;
 const due=sprinklerDue(sys);const open=defects.filter(x=>!['resolved','closed','cancelled'].includes(x.status));
 return <div className="max-w-4xl mx-auto space-y-6">
  <div><p className="text-sm text-muted-foreground">Sprinkler history · {SYSTEM_TYPE_LABEL[sys.system_type as keyof typeof SYSTEM_TYPE_LABEL]}</p><h1 className="text-2xl font-bold">{site?.name||'Site'}</h1><p className="text-sm text-muted-foreground">{[site?.address,site?.postcode].filter(Boolean).join(', ')}</p><p className="text-sm mt-1">Next visit: {due.due?`${d(due.due)} (${VISIT_TYPE_LABEL[due.type!]})`:'history not recorded yet'}</p></div>
  <section className="space-y-2"><h2 className="font-semibold">No-access flats</h2><RevisitList units={units} onChanged={load}/></section>
  <section className="space-y-2"><h2 className="font-semibold">Open remedials ({open.length})</h2>{open.length?<ul className="text-sm list-disc pl-5">{open.map(x=><li key={x.id}><Link className="text-primary" to={`/defects?id=${x.id}`}>{x.title}</Link> <span className="text-muted-foreground">raised {d(x.created_at)}</span></li>)}</ul>:<p className="text-sm text-muted-foreground">None open.</p>}</section>
  <section className="space-y-2"><h2 className="font-semibold">Previous reports</h2>{reports.length?<ul className="divide-y border rounded-md">{reports.map(r=><li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm"><span>{d(r.report_date)} · {VISIT_TYPE_LABEL[r.visit_type as keyof typeof VISIT_TYPE_LABEL]} · <Link className="text-primary" to={`/jobs/${r.job_id}/sprinkler-report/${r.id}`}>{r.jobs?.reference_number||'Job'}</Link> <Badge variant={r.status==='submitted'?'default':'secondary'}>{r.status==='submitted'?'Submitted':'Draft'}</Badge></span><Button size="sm" variant="ghost" onClick={async()=>{try{const {blob,filename}=await buildSprinklerReportPdf(r.id);await savePaperBlob(blob,filename);}catch(e:any){toast.error('PDF not created',{description:plainError(e)});}}}><Download className="h-4 w-4 mr-1"/>Download PDF</Button></li>)}</ul>:<p className="text-sm text-muted-foreground">No sprinkler reports yet.</p>}</section>
  <section className="space-y-2"><h2 className="font-semibold">Flat list ({units.length})</h2>{units.length?<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-muted-foreground"><tr><th>Flat</th><th>Heads</th><th>Last result</th><th>Last visited</th><th>Access</th></tr></thead><tbody>{units.map(u=><tr key={u.id} className="border-t"><td className="py-1 font-medium">{u.label}</td><td>{u.head_count??'—'}</td><td>{u.last_result?UNIT_RESULT_LABEL[u.last_result as keyof typeof UNIT_RESULT_LABEL]:'—'}</td><td>{d(u.last_visited)}</td><td className="text-muted-foreground">{u.access_notes||''}</td></tr>)}</tbody></table></div>:<p className="text-sm text-muted-foreground">No flats recorded.</p>}</section>
 </div>;
}
