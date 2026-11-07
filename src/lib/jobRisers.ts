import {supabase} from '@/integrations/supabase/client';
import {useEffect,useState} from 'react';
export async function loadJobRisers(jobId:string){
 const rows: {asset_id:string;selected:boolean}[]=[];
 for(let from=0;;from+=1000){const {data,error}=await supabase.from('job_risers').select('asset_id,selected').eq('job_id',jobId).order('id').range(from,from+999);if(error)throw error;rows.push(...data);if(data.length<1000)break;}
 return rows;
}
export function notifyJobRisers(jobId:string){window.dispatchEvent(new CustomEvent('job:risers-changed',{detail:{jobId}}));}
export function useJobRisers(jobId:string){const [rows,setRows]=useState<{asset_id:string;selected:boolean}[]>([]);useEffect(()=>{let live=true;const load=()=>loadJobRisers(jobId).then(r=>{if(live)setRows(r);}).catch(()=>{});void load();const h=(e:Event)=>{if((e as CustomEvent).detail?.jobId===jobId)void load();};window.addEventListener('job:risers-changed',h);return()=>{live=false;window.removeEventListener('job:risers-changed',h);};},[jobId]);return rows;}
export const reportCountLabel=(count:number)=>`Print reports (${count} ${count===1?'riser':'risers'})`;