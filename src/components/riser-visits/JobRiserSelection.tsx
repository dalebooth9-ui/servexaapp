import {useEffect,useState} from 'react';
import {fetchSiteRisers,type SiteRiser} from '@/components/assets/siteRisers';
import {useJobRisers,notifyJobRisers} from '@/lib/jobRisers';
import {supabase} from '@/integrations/supabase/client';
import {Checkbox} from '@/components/ui/checkbox';
import {Button} from '@/components/ui/button';
import {useAuth} from '@/hooks/useAuth';
import {toast} from 'sonner';
export default function JobRiserSelection({jobId,siteId}:{jobId:string;siteId:string|null}){
 const {userRole}=useAuth();const rows=useJobRisers(jobId);const [risers,setRisers]=useState<SiteRiser[]>([]);const [busy,setBusy]=useState(false);
 useEffect(()=>{if(siteId)void fetchSiteRisers(siteId).then(setRisers);},[siteId]);
 if(!risers.length||userRole!=='admin')return null;
 const change=async(id:string,selected:boolean)=>{setBusy(true);const {error}=await supabase.rpc('set_job_riser',{_job_id:jobId,_asset_id:id,_selected:selected});setBusy(false);if(error)toast.error(error.message);else notifyJobRisers(jobId);};
 const onJob=new Map(rows.map(r=>[r.asset_id,r.selected]));
 return <section className="mb-6 space-y-4" id="job-risers"><h2 className="font-semibold">Risers on this job</h2><div className="space-y-2">{risers.filter(r=>onJob.has(r.id)).map(r=><label key={r.id} className="flex items-center gap-3 text-sm"><Checkbox disabled={busy} checked={onJob.get(r.id)} onCheckedChange={v=>void change(r.id,Boolean(v))}/><span>{r.riser_location||r.asset_tag} <span className="text-muted-foreground">({r.asset_tag})</span></span></label>)}</div><h3 className="text-sm font-semibold text-muted-foreground">Other risers on this site</h3><div className="space-y-2">{risers.filter(r=>!onJob.has(r.id)).map(r=><div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>{r.riser_location||r.asset_tag} ({r.asset_tag})</span><Button size="sm" variant="outline" disabled={busy} onClick={()=>void change(r.id,true)}>Add to this job</Button></div>)}</div></section>;
}