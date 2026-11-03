import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
export default function ServicingControl({table,id}:{table:'assets'|'sites';id:string}) {
 const [value,setValue]=useState(false); const [busy,setBusy]=useState(true);
 useEffect(()=>{let off=false;supabase.from(table).select('no_longer_serviced').eq('id',id).single().then(({data,error})=>{if(off)return;if(error)toast.error('Could not load servicing status');else setValue(Boolean(data?.no_longer_serviced));setBusy(false);});return()=>{off=true;};},[id,table]);
 const save=async(v:boolean)=>{setBusy(true);const {error}=await supabase.from(table).update({no_longer_serviced:v}).eq('id',id);setBusy(false);if(error){toast.error('Servicing status not saved',{description:error.message});return;}setValue(v);toast.success(v?'No longer serviced':'Servicing restored');window.dispatchEvent(new Event('riser-visits:changed'));};
 return <label className="flex items-center gap-2 text-sm"><Checkbox checked={value} disabled={busy} onCheckedChange={v=>save(v===true)}/>No longer serviced</label>;
}
