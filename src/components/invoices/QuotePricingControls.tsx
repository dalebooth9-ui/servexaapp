import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function QuotePricingControls({ invoice, lines, onChanged }: { invoice: any; lines: any[]; onChanged: () => void }) {
  const [prices,setPrices]=useState<Record<string,{description:string;unit_price:number;price_needed:boolean}>>({});
  const [amount,setAmount]=useState('40'); const [busy,setBusy]=useState(false);
  useEffect(()=>{ const ids=Array.from(new Set(lines.flatMap(l=>l.price_candidates || []))) as string[]; if(!ids.length)return; supabase.from('price_book_items').select('id,description,unit_price,price_needed').in('id',ids).then(({data})=>setPrices(Object.fromEntries((data || []).map(p=>[p.id,p])))); },[lines]);
  const run=async(mode:string,locality=invoice.attendance_locality)=>{setBusy(true);const {error}=await supabase.rpc('set_quote_attendance',{p_quote:invoice.id,p_mode:mode,p_locality:locality || 'unknown',p_amount:mode==='override'?Number(amount):null});setBusy(false);if(error)toast.error(error.message);else onChanged();};
  return <div className="space-y-3 border-y py-4">
    {lines.filter(l=>l.price_candidates?.length).map(l=><div key={l.id} className="space-y-1"><p className="text-sm font-medium">{l.description}</p><Select onValueChange={async item=>{const {error}=await supabase.rpc('apply_quote_price',{p_line:l.id,p_item:item});if(error)toast.error(error.message);else onChanged();}}><SelectTrigger className="w-full max-w-lg"><SelectValue placeholder="Choose the matching works" /></SelectTrigger><SelectContent>{l.price_candidates.map((id:string)=><SelectItem key={id} value={id} disabled={prices[id]?.price_needed}>{prices[id]?.description || 'Loading price'} · {prices[id]?.price_needed?'price needed':`£${prices[id]?.unit_price ?? '—'}`}</SelectItem>)}</SelectContent></Select></div>)}
    <div className="flex flex-wrap gap-2 items-center"><span className="text-sm font-medium">Attendance charge</span><Select value={invoice.attendance_locality || 'unknown'} onValueChange={v=>run('auto',v)}><SelectTrigger className="w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">Use site address</SelectItem><SelectItem value="local">Manchester / Oldham</SelectItem><SelectItem value="distant">Further away</SelectItem></SelectContent></Select><Input aria-label="Override attendance amount" className="w-28" type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} /><Button size="sm" variant="outline" disabled={busy} onClick={()=>run('override')}>Override</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>run('removed')}>Remove charge</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>run('auto')}>Automatic</Button></div>
    {invoice.attendance_mode==='removed' && <p className="text-sm text-muted-foreground">Attendance charge removed for this quote.</p>}
  </div>;
}