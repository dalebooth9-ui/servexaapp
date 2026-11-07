import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertTriangle, Combine } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
interface Preview { source: string; keep: string; fingerprint: string; blocked: boolean; details: {table:string;count:number}[] }
export default function BuildingDuplicateWarning({source,keep,onChanged}:{source:{id:string;name:string};keep:{id:string;name:string};onChanged:()=>void}) {
  const [preview,setPreview]=useState<Preview | null>(null);
  const [busy,setBusy]=useState(false);
  const {toast}=useToast();
  async function load() {
    setBusy(true);
    const {data,error}=await supabase.rpc('preview_building_merge',{_source:source.id,_keep:keep.id});
    setBusy(false);
    if(error) {toast({title:'Could not preview building merge',description:error.message,variant:'destructive'});return;}
    setPreview(data as unknown as Preview);
  }
  async function merge() {
    if(!preview) return;
    setBusy(true);
    const {error}=await supabase.rpc('confirm_building_merge',{_source:source.id,_keep:keep.id,_fingerprint:preview.fingerprint});
    setBusy(false);
    if(error) {toast({title:'Nothing changed',description:error.message,variant:'destructive'});setPreview(null);return;}
    toast({title:`Building merged into ${keep.name}`});setPreview(null);onChanged();
  }
  return <div className="flex flex-wrap items-center gap-2 mt-1 text-sm" onClick={e=>e.stopPropagation()}>
    <span className="flex items-center gap-1 text-destructive"><AlertTriangle className="h-4 w-4"/>Possible duplicate building</span>
    <Button variant="outline" size="sm" disabled={busy} onClick={load}><Combine className="h-4 w-4 mr-1"/>Merge into {keep.name}</Button>
    <Dialog open={!!preview} onOpenChange={open=>{if(!open && !busy)setPreview(null);}}><DialogContent>
      <DialogHeader><DialogTitle>Preview building merge</DialogTitle><DialogDescription>{source.name} → {keep.name}</DialogDescription></DialogHeader>
      <p className="text-sm">Attached records on {source.name}:</p>
      {preview?.details.length ? <ul className="space-y-1 text-sm">{preview.details.map(d=><li key={d.table}>{d.table.replace(/_/g,' ')}: <strong>{d.count}</strong></li>)}</ul> : <p className="text-sm">No attached records. No assets, risers or job history will be removed.</p>}
      <p className="text-sm text-muted-foreground">Records move to {keep.name}. The duplicate disappears from the building list but remains recoverable using Undo last merge in Merge duplicate sites.</p>
      {preview?.blocked && <p className="text-sm text-destructive">Some links need a separate review. Merging is blocked to protect those records.</p>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setPreview(null)}>Cancel</Button><Button disabled={busy || preview?.blocked} onClick={merge}>Confirm merge</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}