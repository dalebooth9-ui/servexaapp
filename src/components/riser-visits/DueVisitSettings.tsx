import {useEffect,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from '@/hooks/useAuth';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {toast} from 'sonner';
export default function DueVisitSettings(){const {orgId,userRole}=useAuth();const [weeks,setWeeks]=useState(6);const [busy,setBusy]=useState(false);
 useEffect(()=>{if(!orgId)return;supabase.from('app_settings').select('value').eq('org_id',orgId).eq('key','riser_due_visits').maybeSingle().then(({data,error})=>{if(error)toast.error('Could not load due visit settings');else setWeeks(Number((data?.value as any)?.lead_weeks??6));});},[orgId]);
 if(userRole!=='admin')return null;
 return <section className="space-y-3 border-t pt-4"><h2 className="text-lg font-semibold">Due visits</h2><label className="block text-sm">Reminder lead time (weeks)<Input className="mt-1 max-w-32" type="number" min={0} max={52} value={weeks} onChange={e=>setWeeks(Number(e.target.value))}/></label><Button disabled={busy||!Number.isInteger(weeks)||weeks<0||weeks>52} onClick={async()=>{if(!orgId)return;setBusy(true);const {error}=await supabase.from('app_settings').upsert({org_id:orgId,key:'riser_due_visits',value:{lead_weeks:weeks},updated_at:new Date().toISOString()},{onConflict:'org_id,key'});setBusy(false);if(error)toast.error('Settings not saved',{description:error.message});else{toast.success('Due visit settings saved');window.dispatchEvent(new Event('riser-visits:changed'));}}}>Save</Button></section>;
}
