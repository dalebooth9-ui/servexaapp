import {useEffect,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {format} from 'date-fns';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from '@/hooks/useAuth';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {toast} from 'sonner';
import {Droplets,Download} from 'lucide-react';
import {plainError} from '@/lib/plainError';
import {sprinklerDue,VISIT_TYPE_LABEL} from '@/lib/sprinklers';
import {buildSprinklerReportPdf} from '@/lib/sprinklerReportPdf';
import {savePaperBlob} from '@/lib/paperReportDownload';

/** Job page: start / continue the Residential Sprinkler Service report when the job's site has a sprinkler register. */
export default function SprinklerReportButton({jobId}:{jobId:string}){
 const {user,userRole}=useAuth();const nav=useNavigate();const [sys,setSys]=useState<any>(null);const [reports,setReports]=useState<any[]>([]);const [busy,setBusy]=useState(false);
 useEffect(()=>{(async()=>{const {data:j}=await supabase.from('jobs').select('site_id').eq('id',jobId).maybeSingle();if(!j?.site_id)return;const {data:s}=await supabase.from('sprinkler_systems').select('*').eq('site_id',j.site_id).maybeSingle();if(!s)return;setSys(s);const {data:r}=await supabase.from('sprinkler_reports').select('id,status,report_date,visit_type').eq('job_id',jobId);setReports(r||[]);})();},[jobId]);
 if(!sys||!['admin','engineer'].includes(userRole||''))return null;
 const start=async()=>{setBusy(true);try{const {data:p}=await supabase.from('profiles').select('full_name').eq('user_id',user!.id).maybeSingle();const due=sprinklerDue(sys);const zones=((sys.zones||[]) as any[]).map(z=>({id:z.id,name:z.name}));
  const {data,error}=await supabase.from('sprinkler_reports').insert({job_id:jobId,system_id:sys.id,org_id:sys.org_id,visit_type:sys.system_type==='house'?'annual':(due.type||'annual'),answers:{engineer:p?.full_name||'',zones}}).select('id').single();if(error)throw error;nav(`/jobs/${jobId}/sprinkler-report/${data.id}`);}catch(e:any){toast.error('Report not started',{description:plainError(e)});}finally{setBusy(false);}};
 return <section className="border rounded-md p-3 space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold flex items-center gap-2"><Droplets className="h-4 w-4 text-primary"/>Residential Sprinkler Service</span>{!reports.length&&<Button size="sm" onClick={start} disabled={busy}>Start sprinkler report</Button>}</div>
  {reports.map(r=><div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{VISIT_TYPE_LABEL[r.visit_type as keyof typeof VISIT_TYPE_LABEL]} · {format(new Date(r.report_date),'dd/MM/yyyy')} <Badge variant={r.status==='submitted'?'default':'secondary'}>{r.status==='submitted'?'Submitted':'Draft'}</Badge></span><div className="flex gap-2"><Button size="sm" variant="outline" asChild><Link to={`/jobs/${jobId}/sprinkler-report/${r.id}`}>{r.status==='submitted'?'View':'Continue'}</Link></Button><Button size="sm" variant="ghost" onClick={async()=>{try{const {blob,filename}=await buildSprinklerReportPdf(r.id);await savePaperBlob(blob,filename);}catch(e:any){toast.error('PDF not created',{description:plainError(e)});}}}><Download className="h-4 w-4 mr-1"/>Download PDF</Button></div></div>)}</section>;
}
