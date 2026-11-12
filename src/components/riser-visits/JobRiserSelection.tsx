import {useCallback,useEffect,useState} from 'react';
import {fetchSiteRisers,type SiteRiser} from '@/components/assets/siteRisers';
import {useJobRisers,notifyJobRisers} from '@/lib/jobRisers';
import {supabase} from '@/integrations/supabase/client';
import {Checkbox} from '@/components/ui/checkbox';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Minus,Plus} from 'lucide-react';
import {useAuth} from '@/hooks/useAuth';
import {toast} from 'sonner';

type RemoveConfirm={asset:SiteRiser;count:number;outlets:{outlet_tag:string;printed:boolean;history:boolean}[]};

export default function JobRiserSelection({jobId,siteId}:{jobId:string;siteId:string|null}){
  const {userRole}=useAuth();const rows=useJobRisers(jobId);const [risers,setRisers]=useState<SiteRiser[]>([]);const [busy,setBusy]=useState(false);
  const [removeConfirm,setRemoveConfirm]=useState<RemoveConfirm|null>(null);
  const reload=useCallback(()=>{if(siteId)void fetchSiteRisers(siteId).then(setRisers);},[siteId]);
  useEffect(reload,[reload]);
  if(!risers.length||userRole!=='admin')return null;
  const change=async(id:string,selected:boolean)=>{setBusy(true);const {error}=await supabase.rpc('set_job_riser',{_job_id:jobId,_asset_id:id,_selected:selected});setBusy(false);if(error)toast.error(error.message);else notifyJobRisers(jobId);};
  const setOutlets=async(asset:SiteRiser,count:number,confirmed:boolean)=>{
    if(isNaN(count)||count<0){toast.error('Outlets must be a whole number');return;}
    if(count===(asset.outlets_count??0))return;
    setBusy(true);
    const {data:res,error}=await supabase.rpc('set_riser_outlet_count',{_asset_id:asset.id,_count:count,_confirmed:confirmed});
    setBusy(false);
    if(error){toast.error(error.message);return;}
    if((res as {needs_confirmation?:boolean})?.needs_confirmation){setRemoveConfirm({asset,count,outlets:(res as {outlets?:RemoveConfirm['outlets']}).outlets||[]});return;}
    toast.success(`${asset.riser_location||asset.asset_tag}: ${count} outlet${count===1?'':'s'}`);
    reload();
  };
  const onJob=new Map(rows.map(r=>[r.asset_id,r.selected]));
  const outletBox=(r:SiteRiser)=>(
    <span className="ml-auto flex items-center gap-1" onClick={e=>e.preventDefault()}>
      <span className="text-xs text-muted-foreground mr-1">Outlets</span>
      <Button type="button" size="icon" variant="outline" className="h-7 w-7" disabled={busy||!(r.outlets_count??0)} aria-label="One fewer outlet" onClick={()=>void setOutlets(r,(r.outlets_count??0)-1,false)}><Minus className="h-3 w-3"/></Button>
      <Input type="number" min={0} className="h-7 w-14 px-1 text-center" disabled={busy} value={r.outlets_count??0} aria-label="Number of outlets"
        onChange={e=>{const v=parseInt(e.target.value,10);setRisers(rs=>rs.map(x=>x.id===r.id?{...x,outlets_count:isNaN(v)?0:v}:x));}}
        onBlur={e=>{const v=parseInt(e.target.value,10);if(!isNaN(v))void setOutlets(r,v,false);}}
        onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}/>
      <Button type="button" size="icon" variant="outline" className="h-7 w-7" disabled={busy} aria-label="One more outlet" onClick={()=>void setOutlets(r,(r.outlets_count??0)+1,false)}><Plus className="h-3 w-3"/></Button>
    </span>
  );
  return <section className="mb-6 space-y-4" id="job-risers"><h2 className="font-semibold">Risers on this job</h2><div className="space-y-2">{risers.filter(r=>onJob.has(r.id)).map(r=><label key={r.id} className="flex flex-wrap items-center gap-3 text-sm"><Checkbox disabled={busy} checked={onJob.get(r.id)} onCheckedChange={v=>void change(r.id,Boolean(v))}/><span>{r.riser_location||r.asset_tag} <span className="text-muted-foreground">({r.asset_tag})</span></span>{outletBox(r)}</label>)}</div><h3 className="text-sm font-semibold text-muted-foreground">Other risers on this site</h3><div className="space-y-2">{risers.filter(r=>!onJob.has(r.id)).map(r=><div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>{r.riser_location||r.asset_tag} ({r.asset_tag})</span><Button size="sm" variant="outline" disabled={busy} onClick={()=>void change(r.id,true)}>Add to this job</Button></div>)}</div>
    <Dialog open={!!removeConfirm} onOpenChange={o=>{if(!o)setRemoveConfirm(null);}}>
      <DialogContent>
        <DialogHeader><DialogTitle>Remove outlets with history?</DialogTitle></DialogHeader>
        <p className="text-sm">Lowering the count marks these outlets as "No longer fitted". Their codes are never reused and their history is kept.</p>
        <ul className="list-disc pl-5 text-sm">{removeConfirm?.outlets.map(o=><li key={o.outlet_tag}><span className="font-mono">{o.outlet_tag}</span> – {[o.printed&&'sticker printed',o.history&&'has service history'].filter(Boolean).join(', ')}</li>)}</ul>
        <DialogFooter><Button variant="outline" onClick={()=>{setRemoveConfirm(null);reload();}}>Keep outlets</Button><Button variant="destructive" disabled={busy} onClick={()=>{const rc=removeConfirm;setRemoveConfirm(null);if(rc)void setOutlets(rc.asset,rc.count,true);}}>Remove outlets</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
