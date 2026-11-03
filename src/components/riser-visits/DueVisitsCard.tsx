import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {supabase} from '@/integrations/supabase/client';
import {loadRiserVisitData} from '@/lib/riserVisitData';
import {reminderVisible,withinLeadTime} from '@/lib/riserVisits';
import {useAuth} from '@/hooks/useAuth';
import {Button} from '@/components/ui/button';
import {CalendarClock,ArrowRight} from 'lucide-react';
export default function DueVisitsCard(){const {orgId,userRole}=useAuth();const [counts,setCounts]=useState({due:0,unknown:0});const [error,setError]=useState(false);
 useEffect(()=>{if(userRole!=='admin'||!orgId)return;let off=false;const load=async()=>{try{const [rows,settings]=await Promise.all([loadRiserVisitData(),supabase.from('app_settings').select('value').eq('key','riser_due_visits').eq('org_id',orgId).maybeSingle()]);if(settings.error)throw settings.error;const weeks=Number((settings.data?.value as any)?.lead_weeks??6);const visible=rows.filter(r=>!r.booked&&reminderVisible(r.asset,r.site,r.cycle));if(!off){setError(false);setCounts({due:visible.filter(r=>withinLeadTime(r.cycle.due,weeks)).length,unknown:visible.filter(r=>!r.cycle.due).length});}}catch{if(!off)setError(true);}};load();window.addEventListener('riser-visits:changed',load);return()=>{off=true;window.removeEventListener('riser-visits:changed',load);};},[orgId,userRole]);
 if(userRole!=='admin')return null;return <section className="flex flex-wrap items-center justify-between gap-3 border rounded-md p-4"><div className="flex items-center gap-3"><CalendarClock className="h-5 w-5 text-primary"/><div><h2 className="font-semibold">Due visits</h2><p className="text-sm text-muted-foreground">{error?'Unable to load due visits':`${counts.due} risers due soon or overdue · ${counts.unknown} with history not recorded`}</p></div></div><Button variant="outline" asChild><Link to="/due-visits">View due visits<ArrowRight className="ml-2 h-4 w-4"/></Link></Button></section>;
}
