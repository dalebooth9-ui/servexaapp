import {useCallback,useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {format} from 'date-fns';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from '@/hooks/useAuth';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Badge} from '@/components/ui/badge';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {toast} from 'sonner';
import {Droplets,Plus,Trash2,QrCode,History} from 'lucide-react';
import {plainError} from '@/lib/plainError';
import {SYSTEM_TYPE_LABEL,UNIT_RESULT_LABEL,parseUnitLabels,compareUnitLabels,sprinklerDue,VISIT_TYPE_LABEL,type SprinklerRegister,type SprinklerZone,type SprinklerSystemType} from '@/lib/sprinklers';
import {buildStickerPackPdf,loadOffsets} from '@/lib/riserStickers';
import {resolveStickerBranding} from '@/lib/stickerBranding';
import {savePaperBlob} from '@/lib/paperReportDownload';

const REG_FIELDS:{group:string;fields:[keyof SprinklerRegister,string][];plant?:boolean}[]=[
 {group:'Water supplies room',plant:true,fields:[['supply_room_location','Location'],['supply_type','Supply type']]},
 {group:'Tank',plant:true,fields:[['tank_location','Location'],['tank_manufacturer','Manufacturer'],['tank_type','Type']]},
 {group:'Pump',plant:true,fields:[['pump_location','Location'],['pump_manufacturer','Manufacturer'],['pump_type','Type'],['pump_rated_flow','Rated flow (L/min)'],['pump_rated_pressure','Rated pressure (bar)']]},
 {group:'Monitoring panel',plant:true,fields:[['panel_location','Location'],['panel_make','Make'],['panel_monitored_by','Monitored by']]},
 {group:'Heads',fields:[['head_manufacturer','Head manufacturer'],['head_size','Head size (e.g. 15mm)']]},
];
export const uid=()=>Math.random().toString(36).slice(2,10);
const fmt=(d?:string|null)=>d?format(new Date(d),'dd/MM/yyyy'):'—';

export type SprinklerUnit={id:string;label:string;sort_order:number;head_count:number|null;access_notes:string|null;last_result:string|null;last_visited:string|null;revisit_pending:boolean;revisit_visited_at:string|null};

/** Revisit list with one-tap Mark visited — used on the site, Due visits and the QR history page. */
export function RevisitList({units,onChanged,compact=false}:{units:SprinklerUnit[];onChanged:()=>void;compact?:boolean}){
 const {userRole}=useAuth();const [date,setDate]=useState(format(new Date(),'yyyy-MM-dd'));const pending=units.filter(u=>u.revisit_pending).sort((a,b)=>compareUnitLabels(a.label,b.label));
 if(!pending.length)return compact?null:<p className="text-sm text-muted-foreground">No flats waiting for a revisit.</p>;
 const mark=async(u:SprinklerUnit)=>{const {error}=await supabase.rpc('mark_sprinkler_unit_visited',{_unit_id:u.id,_date:date});if(error){toast.error('Not saved',{description:plainError(error)});return;}toast.success(`${u.label} marked visited`);onChanged();};
 return <div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">Revisit list — {pending.length} flat{pending.length===1?'':'s'} with no access</p>{['admin','engineer'].includes(userRole||'')&&<label className="text-xs flex items-center gap-1">Visited on<Input type="date" className="h-8 w-40" value={date} onChange={e=>setDate(e.target.value)} aria-label="Visited on"/></label>}</div>
 <ul className="divide-y border rounded-md">{pending.map(u=><li key={u.id} className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm"><span><span className="font-medium">{u.label}</span>{u.access_notes&&<span className="text-muted-foreground"> · {u.access_notes}</span>}</span>{['admin','engineer'].includes(userRole||'')&&<Button size="sm" variant="outline" onClick={()=>mark(u)}>Mark visited</Button>}</li>)}</ul></div>;
}

export default function SprinklerSystemCard({siteId}:{siteId:string}){
 const {userRole,orgId}=useAuth();const isAdmin=userRole==='admin';
 const [sys,setSys]=useState<any|null|undefined>(undefined);const [units,setUnits]=useState<SprinklerUnit[]>([]);const [reg,setReg]=useState<SprinklerRegister>({});const [zones,setZones]=useState<SprinklerZone[]>([]);const [type,setType]=useState<SprinklerSystemType>('block');
 const [bulk,setBulk]=useState('');const [prefix,setPrefix]=useState('Flat ');const [busy,setBusy]=useState(false);const [noLogo,setNoLogo]=useState(false);const [open,setOpen]=useState(false);
 const load=useCallback(async()=>{const {data,error}=await supabase.from('sprinkler_systems').select('*').eq('site_id',siteId).maybeSingle();if(error){toast.error('Sprinkler system not loaded',{description:plainError(error)});setSys(null);return;}setSys(data);if(data){setReg((data.register||{}) as SprinklerRegister);setZones(((data.zones||[]) as any[]) as SprinklerZone[]);setType(data.system_type as SprinklerSystemType);const {data:u}=await supabase.from('sprinkler_units').select('*').eq('system_id',data.id);setUnits(((u||[]) as SprinklerUnit[]).sort((a,b)=>a.sort_order-b.sort_order||compareUnitLabels(a.label,b.label)));}},[siteId]);
 useEffect(()=>{load();},[load]);
 if(sys===undefined||!['admin','engineer'].includes(userRole||''))return null;
 if(!sys)return isAdmin?<section className="border rounded-md p-4 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Droplets className="h-5 w-5 text-primary"/><span className="font-semibold">Residential sprinkler system (BS 9251)</span></div><Button variant="outline" onClick={async()=>{const {error}=await supabase.from('sprinkler_systems').insert({site_id:siteId,org_id:orgId!,system_type:'block'});if(error){toast.error('Not added',{description:plainError(error)});return;}setOpen(true);load();}}><Plus className="h-4 w-4 mr-1"/>Add sprinkler system</Button></section>:null;
 const due=sprinklerDue(sys);
 const saveReg=async()=>{setBusy(true);const {error}=await supabase.from('sprinkler_systems').update({register:reg as any,zones:zones as any,system_type:type,updated_at:new Date().toISOString()}).eq('id',sys.id);setBusy(false);if(error){toast.error('Register not saved',{description:plainError(error)});return;}toast.success('Sprinkler register saved');load();};
 const addUnits=async()=>{const labels=parseUnitLabels(bulk,prefix).filter(l=>!units.some(u=>u.label.toLowerCase()===l.toLowerCase()));if(!labels.length){toast.info('No new flats to add');return;}const start=units.reduce((m,u)=>Math.max(m,u.sort_order),0);const {error}=await supabase.from('sprinkler_units').insert(labels.map((label,i)=>({system_id:sys.id,org_id:sys.org_id,label,sort_order:start+i+1})));if(error){toast.error('Flats not added',{description:plainError(error)});return;}toast.success(`${labels.length} added`);setBulk('');load();};
 const updUnit=async(u:SprinklerUnit,patch:Partial<SprinklerUnit>)=>{setUnits(us=>us.map(x=>x.id===u.id?{...x,...patch}:x));const {error}=await supabase.from('sprinkler_units').update(patch).eq('id',u.id);if(error)toast.error('Not saved',{description:plainError(error)});};
 const delUnit=async(u:SprinklerUnit)=>{if(!confirm(`Remove ${u.label} from the list?`))return;const {error}=await supabase.from('sprinkler_units').delete().eq('id',u.id);if(error){toast.error('Not removed',{description:plainError(error)});return;}load();};
 const printQr=async()=>{try{const {data:tag,error}=await supabase.rpc('ensure_sprinkler_qr',{_system_id:sys.id});if(error)throw error;const brand=noLogo?{logoUrl:null}:await resolveStickerBranding({siteId});const doc=await buildStickerPackPdf({items:[{asset_tag:String(tag)}],logoUrl:brand.logoUrl,offsets:loadOffsets()});await savePaperBlob(doc.output('blob'),`Sprinkler QR label ${tag}.pdf`);load();}catch(e:any){toast.error('Label not printed',{description:plainError(e)});}};
 const plantHidden=type==='house';
 return <section className="border rounded-md p-4 space-y-4 text-left bg-card" aria-label="Sprinkler system">
  <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Droplets className="h-5 w-5 text-primary"/><h3 className="font-semibold">Sprinkler system (BS 9251)</h3><Badge variant="secondary">{SYSTEM_TYPE_LABEL[type]}</Badge></div>
   <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" asChild><Link to={`/sprinklers/${sys.id}`}><History className="h-4 w-4 mr-1"/>History</Link></Button><Button size="sm" variant="outline" onClick={()=>setOpen(o=>!o)}>{open?'Hide register':'Show register'}</Button></div></div>
  <p className="text-sm text-muted-foreground">Next visit: {due.due?`${fmt(due.due)} (${VISIT_TYPE_LABEL[due.type!]})`:'history not recorded yet'} · Last annual {fmt(sys.last_annual)} · Last 6 month {fmt(sys.last_six_month)} · {units.length} flat{units.length===1?'':'s'}</p>
  <RevisitList units={units} onChanged={load} compact/>
  {open&&<div className="space-y-4">
   <label className="text-sm block">System type<Select value={type} onValueChange={v=>setType(v as SprinklerSystemType)} disabled={!isAdmin}><SelectTrigger className="mt-1 max-w-sm" aria-label="System type"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(SYSTEM_TYPE_LABEL).map(([k,v])=><SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></label>
   {REG_FIELDS.filter(g=>!(plantHidden&&g.plant&&g.group!=='Water supplies room')).map(g=><fieldset key={g.group} className="space-y-2"><legend className="text-sm font-medium">{g.group}</legend><div className="grid gap-2 sm:grid-cols-3">{g.fields.map(([k,l])=><label key={k} className="text-xs text-muted-foreground">{l}<Input className="mt-1" value={reg[k]||''} disabled={!isAdmin} onChange={e=>setReg(r=>({...r,[k]:e.target.value}))}/></label>)}</div></fieldset>)}
   {!plantHidden&&<fieldset className="space-y-2"><legend className="text-sm font-medium">Zone valves (one per floor / zone)</legend>{zones.map((z,i)=><div key={z.id} className="flex gap-2"><Input aria-label={`Zone ${i+1}`} value={z.name} disabled={!isAdmin} onChange={e=>setZones(zs=>zs.map(x=>x.id===z.id?{...x,name:e.target.value}:x))}/>{isAdmin&&<Button size="icon" variant="ghost" aria-label="Remove zone" onClick={()=>setZones(zs=>zs.filter(x=>x.id!==z.id))}><Trash2 className="h-4 w-4"/></Button>}</div>)}{isAdmin&&<Button size="sm" variant="outline" onClick={()=>setZones(zs=>[...zs,{id:uid(),name:zs.length?`Level ${zs.length}`:'Ground'}])}><Plus className="h-4 w-4 mr-1"/>Add zone</Button>}</fieldset>}
   <label className="text-sm block">Access notes (keys, ladders, padlocks)<Textarea className="mt-1" value={reg.access_notes||''} disabled={!isAdmin} onChange={e=>setReg(r=>({...r,access_notes:e.target.value}))}/></label>
   {isAdmin&&<Button onClick={saveReg} disabled={busy}>Save register</Button>}
   <div className="space-y-2 border-t pt-3"><h4 className="text-sm font-medium">{type==='mist'?'Rooms':'Flats / units'}</h4>
    {isAdmin&&<div className="flex flex-wrap items-end gap-2"><label className="text-xs text-muted-foreground">Prefix<Input className="mt-1 w-24" value={prefix} onChange={e=>setPrefix(e.target.value)}/></label><label className="text-xs text-muted-foreground flex-1 min-w-[220px]">Add a range (1-83) or paste a list, one per line<Textarea rows={2} className="mt-1" value={bulk} onChange={e=>setBulk(e.target.value)} placeholder="1-83"/></label><Button onClick={addUnits} disabled={!bulk.trim()}>Add</Button></div>}
    {units.length>0&&<div className="overflow-x-auto max-h-96 overflow-y-auto"><table className="w-full text-sm"><thead className="text-left text-muted-foreground"><tr><th className="py-1">Flat</th><th>Heads</th><th>Access notes</th><th>Last result</th><th>Last visited</th><th/></tr></thead><tbody>{units.map(u=><tr key={u.id} className="border-t"><td className="py-1 pr-2 font-medium whitespace-nowrap">{u.label}</td><td className="pr-2"><Input className="h-8 w-16" inputMode="numeric" aria-label={`Heads ${u.label}`} defaultValue={u.head_count??''} disabled={!isAdmin} onBlur={e=>{const v=e.target.value.trim();const n=v===''?null:Number(v);if(n!==u.head_count&&(n===null||Number.isFinite(n)))updUnit(u,{head_count:n});}}/></td><td className="pr-2"><Input className="h-8 min-w-[140px]" aria-label={`Access ${u.label}`} defaultValue={u.access_notes||''} disabled={!isAdmin} onBlur={e=>{if(e.target.value!==(u.access_notes||''))updUnit(u,{access_notes:e.target.value||null});}}/></td><td className="pr-2 whitespace-nowrap">{u.last_result?UNIT_RESULT_LABEL[u.last_result as keyof typeof UNIT_RESULT_LABEL]:'—'}</td><td className="pr-2 whitespace-nowrap">{fmt(u.last_visited)}</td><td>{isAdmin&&<Button size="icon" variant="ghost" aria-label={`Remove ${u.label}`} onClick={()=>delUnit(u)}><Trash2 className="h-4 w-4"/></Button>}</td></tr>)}</tbody></table></div>}
   </div>
   {isAdmin&&<div className="flex flex-wrap items-center gap-3 border-t pt-3"><Button variant="outline" onClick={printQr}><QrCode className="h-4 w-4 mr-1"/>Print plant QR label</Button><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={noLogo} onChange={e=>setNoLogo(e.target.checked)}/>Leave logo off</label>{sys.qr_tag&&<span className="text-sm text-muted-foreground">Code {sys.qr_tag}</span>}</div>}
  </div>}
 </section>;
}
