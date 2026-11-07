import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, RefreshCw, Merge, AlertTriangle } from 'lucide-react';
import { assetCreationSource, groupDuplicateAssets, type DuplicateAsset } from '@/lib/assetDuplicates';
type Preview = { token:string; keep_tag:string; remove_count:number; printed_warning:boolean; snapshot:Record<string, unknown[]> };
export default function AssetDuplicates() {
 const { toast } = useToast();
 const [rows,setRows]=useState<DuplicateAsset[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [search,setSearch]=useState('');
 const [keepers,setKeepers]=useState<Record<string,string>>({});
 const [pending,setPending]=useState<{keep:string; sources:string[]; preview:Preview}|null>(null);
 const [busy,setBusy]=useState(false);
 const load=async()=>{
  setLoading(true); setError('');
  const {data,error:e}=await supabase.rpc('asset_duplicate_review');
  if(e) setError(e.message); else setRows((data || []) as unknown as DuplicateAsset[]);
  setLoading(false);
 };
 useEffect(()=>{void load();},[]);
 const groups=groupDuplicateAssets(rows);
 const extra=groups.reduce((n,g)=>n+g.assets.length-1,0);
 const sources=[...new Set(rows.map(assetCreationSource))];
 const preview=async(keep:string,ids:string[])=>{
  setBusy(true);
  const {data,error:e}=await supabase.rpc('merge_asset_duplicates',{_keep_id:keep,_source_ids:ids});
  if(e)toast({title:'Preview unavailable',description:e.message,variant:'destructive'});
  else setPending({keep,sources:ids,preview:data as unknown as Preview});
  setBusy(false);
 };
 const confirm=async()=>{
  if(!pending)return;
  setBusy(true);
  const {error:e}=await supabase.rpc('merge_asset_duplicates',{_keep_id:pending.keep,_source_ids:pending.sources,_preview_token:pending.preview.token});
  if(e)toast({title:'Nothing merged',description:e.message,variant:'destructive'});
  else { toast({title:'Duplicates merged',description:'History preserved and all old QR tags still work.'});setPending(null);await load(); }
  setBusy(false);
 };
 return <div className="space-y-6" data-assistant-target="Possible duplicates">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><Button asChild variant="ghost" size="sm"><Link to="/assets"><ArrowLeft className="mr-2 h-4 w-4"/>Assets</Link></Button><h1 className="text-2xl font-bold">Possible duplicates</h1></div><Button variant="outline" onClick={load} disabled={loading}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button></div>
  <div className="flex flex-wrap gap-4"><div><strong className="text-2xl">{groups.length}</strong> duplicate groups</div><div><strong className="text-2xl">{extra}</strong> extra assets if all groups confirmed</div><Badge variant="outline">No automatic cleanup</Badge></div>
  <div className="border-y py-3 text-sm space-y-1"><h2 className="font-semibold">Creation sources in these groups</h2>{sources.map(s=><p key={s}>{s} — {rows.filter(a=>assetCreationSource(a)===s).length} assets</p>)}</div>
  <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search site, asset or tag" aria-label="Search duplicates" className="max-w-md"/>
  {error&&<p role="alert" className="text-destructive">{error}</p>}
  {loading?<p>Checking assets…</p>:groups.length===0&&!error?<p>No possible duplicates found.</p>:groups.filter(g=>g.assets.some(a=>`${a.name} ${a.site_name} ${a.asset_tag}`.toLowerCase().includes(search.toLowerCase()))).map(g=>{
   const first=g.assets[0]; const keep=keepers[g.key]||first.id;
   return <section key={g.key} className="border-t pt-5 space-y-3"><div><h2 className="font-semibold">{first.name}</h2><p className="text-sm text-muted-foreground">{first.site_name} · {first.category}</p></div>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Keep</th><th className="p-2">Tag / created</th><th className="p-2">Source</th><th className="p-2">Attached</th><th className="p-2">Stickers</th></tr></thead><tbody>{g.assets.map(a=><tr key={a.id} className="border-b align-top"><td className="p-2"><label className="flex items-center gap-2"><input type="radio" name={g.key} checked={keep===a.id} onChange={()=>setKeepers(p=>({...p,[g.key]:a.id}))} aria-label={`Keep ${a.asset_tag || a.id}`}/>{a.id===first.id?'Suggested':'Keep'}</label></td><td className="p-2 min-w-36"><Link className="text-primary underline" to={`/assets/${a.id}`}>{a.asset_tag||'No tag'}</Link><p className="text-muted-foreground">{new Date(a.created_at).toLocaleString('en-GB')}</p></td><td className="p-2">{assetCreationSource(a)}</td><td className="p-2 min-w-48">{a.jobs_count} jobs · {a.reports_count} reports<br/>{a.history_count} history · {a.documents_count} documents/photos<br/>{a.outlets_count??0} outlets · {a.outlet_tags_count} outlet codes{a.last_inspection_at&&<p>Last service: {new Date(a.last_inspection_at).toLocaleDateString('en-GB')}</p>}{a.notes&&<details><summary>Notes</summary><p className="whitespace-pre-wrap">{a.notes}</p></details>}</td><td className="p-2">{a.label_printed_at||['printed','placed'].includes(a.label_status)?<Badge variant="secondary">Inlet printed</Badge>:<span>Inlet not printed</span>}<p>{a.outlet_printed_count} outlets printed</p></td></tr>)}</tbody></table></div>
    <Button variant="outline" disabled={busy} onClick={()=>preview(keep,g.assets.filter(a=>a.id!==keep).map(a=>a.id))}><Merge className="mr-2 h-4 w-4"/>Merge duplicates into the kept one</Button>
   </section>;
  })}
  <Dialog open={!!pending} onOpenChange={v=>{if(!v&&!busy)setPending(null);}}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Confirm duplicate merge</DialogTitle></DialogHeader>{pending&&<div className="space-y-4"><p>Keep <strong>{pending.preview.keep_tag}</strong> and remove {pending.preview.remove_count} extra assets from the register.</p>{pending.preview.printed_warning&&<p className="flex gap-2 text-destructive"><AlertTriangle className="h-5 w-5 shrink-0"/>A duplicate has printed stickers. Those codes will still open the kept asset.</p>}<p className="text-sm">Jobs, reports, dates, notes and photos are preserved. Original records and any conflicting history remain in the merge archive. Duplicate outlet codes remain valid for the same outlet.</p><dl className="text-sm">{Object.entries(pending.preview.snapshot).filter(([k])=>k!=='assets').map(([k,v])=><div key={k} className="flex justify-between gap-3 border-b py-1"><dt>{k.replace(/_/g,' ')}</dt><dd>{v.length}</dd></div>)}</dl><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={()=>setPending(null)}>Cancel</Button><Button disabled={busy} onClick={confirm}>{busy?'Merging…':'Confirm merge'}</Button></div></div>}</DialogContent></Dialog>
 </div>;
}