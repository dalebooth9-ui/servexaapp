import {useCallback,useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {format} from 'date-fns';
import {supabase} from '@/integrations/supabase/client';
import {sprinklerDue,VISIT_TYPE_LABEL} from '@/lib/sprinklers';
import {fetchAllRows} from '@/lib/fetchAllRows';
import {RevisitList,type SprinklerUnit} from '@/components/sprinklers/SprinklerSystemCard';

/** Sprinkler reminders (annual / 6 month; houses annual) and revisit flats, for Due visits and Renewals. Reminders only — never books jobs. */
export default function SprinklerDueSection({showRevisits=true}:{showRevisits?:boolean}){
 const [rows,setRows]=useState<any[]>([]);const [units,setUnits]=useState<SprinklerUnit[]>([]);const [err,setErr]=useState('');
 const load=useCallback(async()=>{try{const sys=await fetchAllRows<any>('sprinkler_systems','id,site_id,system_type,last_annual,last_six_month,sites(name)');setRows(sys);if(showRevisits){const u=await fetchAllRows<any>('sprinkler_units','*');setUnits(u.filter(x=>x.revisit_pending));}}catch(e:any){setErr(e.message);}},[showRevisits]);
 useEffect(()=>{load();},[load]);
 if(err)return <p role="alert" className="text-destructive text-sm">Sprinkler reminders could not load: {err}</p>;
 if(!rows.length)return null;
 const list=rows.map(s=>({s,due:sprinklerDue(s)})).sort((a,b)=>(a.due.due||'9999').localeCompare(b.due.due||'9999'));const today=format(new Date(),'yyyy-MM-dd');
 return <section className="space-y-3 border-t pt-4"><h2 className="text-lg font-semibold">Residential sprinklers</h2>
  <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-muted-foreground"><tr><th className="py-2">Site</th><th>Due date</th><th>Type</th><th>Last done</th><th>Revisits</th></tr></thead><tbody>{list.map(({s,due})=>{const pending=units.filter(u=>(u as any).system_id===s.id).length;return <tr key={s.id} className="border-t"><td className="py-2 pr-3"><Link className="text-primary font-medium" to={`/sprinklers/${s.id}`}>{s.sites?.name||'Site'}</Link></td><td className={`pr-3 whitespace-nowrap ${due.due&&due.due<today?'text-destructive font-medium':''}`}>{due.due?format(new Date(due.due),'dd/MM/yyyy'):'History not recorded'}</td><td className="pr-3">{due.type?VISIT_TYPE_LABEL[due.type]:'Needs review'}</td><td className="pr-3">{due.last?format(new Date(due.last),'dd/MM/yyyy'):'—'}</td><td>{pending||'—'}</td></tr>;})}</tbody></table></div>
  {showRevisits&&units.length>0&&rows.filter(s=>units.some(u=>(u as any).system_id===s.id)).map(s=><div key={s.id} className="space-y-1"><p className="text-sm font-medium">{s.sites?.name}</p><RevisitList units={units.filter(u=>(u as any).system_id===s.id)} onChanged={load}/></div>)}
 </section>;
}
