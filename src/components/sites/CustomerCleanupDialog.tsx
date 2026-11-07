import { useState } from 'react';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Loader2, Upload } from 'lucide-react';
import { CleanupCustomer, CleanupRow, describeCounts, mergePreview, normaliseCustomerName, protectedCustomer, removePreview } from '@/lib/customerCleanup';

export default function CustomerCleanupDialog({open,onOpenChange,onChanged}:{open:boolean;onOpenChange:(v:boolean)=>void;onChanged:()=>void}) {
  const {userRole}=useAuth();
  const [mode,setMode]=useState('remove');
  const [customers,setCustomers]=useState<CleanupCustomer[]>([]);
  const [rows,setRows]=useState<CleanupRow[]>([]);
  const [names,setNames]=useState<string[]>([]);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [confirm,setConfirm]=useState(false);
  const [results,setResults]=useState<{name:string;status:string;into?:string;counts?:Record<string,number>}[]|null>(null);
  const eligible=(r:CleanupRow)=>mode==='remove' ? r.status==='Safe to remove' : !!r.customer && !protectedCustomer(r.name) && !!r.targetId && r.targetId!==r.customer.id;
  const picked=rows.filter(r=>selected.has(r.key)&&eligible(r));
  const upload=async(file?:File)=>{
    if(!file)return;
    setBusy(true);setError('');setRows([]);setResults(null);setSelected(new Set());
    try {
      const parsed=Papa.parse<string[]>(await file.text(),{skipEmptyLines:'greedy',delimiter:','});
      if(parsed.errors.length)throw new Error('The CSV could not be read: '+parsed.errors[0].message);
      const values=parsed.data.map(row=>row.map(v=>v.trim()));
      const first=values[0]||[];
      const hasHeader=/^(customer\s*name|customer|name)$/i.test(first[0]||'');
      if(mode==='merge' && (!hasHeader || normaliseCustomerName(first[1]||'')!=='merge into')) throw new Error('Merge CSV must have columns Customer name and Merge into.');
      const entries=(hasHeader?values.slice(1):values).filter(v=>v[0]);
      if(!entries.length)throw new Error('This CSV contains no customer names.');
      const {data,error:rpcError}=await supabase.rpc('customer_cleanup_preview');
      if(rpcError)throw rpcError;
      const list=data as unknown as CleanupCustomer[];
      const preview=mode==='remove'?removePreview(entries.map(e=>e[0]),list):mergePreview(entries.map(e=>({name:e[0],into:e[1]||''})),list);
      setCustomers(list);setNames(entries.map(e=>e[0]));setRows(preview);
      setSelected(new Set(preview.filter(r=>mode==='remove'?r.status==='Safe to remove':!!r.targetId&&r.targetId!==r.customer?.id&&!protectedCustomer(r.name)).map(r=>r.key)));
    }catch(e){setError(e instanceof Error?e.message:typeof e==='object'&&e&&'message' in e?String(e.message):String(e));}finally{setBusy(false);}
  };
  const changeWinner=(row:CleanupRow,id:string)=>{
    setRows(prev=>prev.map(r=>r.key===row.key || (row.groupIds?.includes(r.key)) ? {...r,targetId:id,status:id===r.customer?.id?'Keep':'Ready to merge'}:r));
    setSelected(prev=>{const next=new Set(prev);for(const r of rows)if(r.key===row.key||row.groupIds?.includes(r.key)){if(r.key===id||protectedCustomer(r.name))next.delete(r.key);else next.add(r.key);}return next;});
  };
  const apply=async()=>{
    setBusy(true);setError('');
    try{
      const {data,error:rpcError}=await supabase.rpc('apply_customer_cleanup',{_listed_names:names,_remove_ids:mode==='remove'?picked.map(r=>r.key):[],_merges:mode==='merge'?picked.map(r=>({source_id:r.key,target_id:r.targetId})):[]});
      if(rpcError)throw rpcError;
      const changed=data as unknown as {id:string;name:string;status:string;into?:string;counts?:Record<string,number>}[];
      setResults(rows.map(r=>changed.find(x=>x.id===r.key)||{name:r.name,status:r.status==='Not found'?'Not found':r.status==='Keep'?'Kept':'Skipped',counts:r.customer?.counts}));
      setConfirm(false);onChanged();
    }catch(e){setError(e instanceof Error?e.message:typeof e==='object'&&e&&'message' in e?String(e.message):String(e));setConfirm(false);}finally{setBusy(false);}
  };
  const download=async()=>{
    if(!results)return;
    const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('Summary');
    sheet.addRow(['Customer','Result','Merged into','Data']);
    results.forEach(r=>sheet.addRow([r.name,r.status,r.into||'',describeCounts(r.counts)]));
    const buffer=await workbook.csv.writeBuffer();const url=URL.createObjectURL(new Blob([buffer],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='customer-cleanup-summary.csv';a.click();URL.revokeObjectURL(url);
  };
  if(userRole!=='admin')return null;
  return <Dialog open={open} onOpenChange={v=>{if(!busy){onOpenChange(v);if(!v){setRows([]);setResults(null);setConfirm(false);setError('');}}}}>
    <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Customer clean-up</DialogTitle><DialogDescription>{results?'Clean-up summary':confirm?'Confirm the selected changes':'Customer list review'}</DialogDescription></DialogHeader>
      {!results&&!confirm&&<>
        <Tabs value={mode} onValueChange={v=>{setMode(v);setRows([]);setSelected(new Set());setError('');}}><TabsList><TabsTrigger value="remove" disabled={busy}>Remove list</TabsTrigger><TabsTrigger value="merge" disabled={busy}>Merge list</TabsTrigger></TabsList></Tabs>
        <label className="flex items-center gap-3 text-sm"><Upload className="h-4 w-4 shrink-0"/>{mode==='remove'?'Remove CSV':'Merge CSV'}<Input type="file" accept=".csv,text/csv" aria-label={mode==='remove'?'Upload remove CSV':'Upload merge CSV'} disabled={busy} onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label>
        {busy&&<Loader2 className="h-5 w-5 animate-spin"/>}
        {rows.length>0&&<div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Select</TableHead><TableHead>Customer</TableHead><TableHead>{mode==='remove'?'Group':'Merge into'}</TableHead><TableHead>Attached data</TableHead></TableRow></TableHeader><TableBody>{[...rows].sort((a,b)=>mode==='remove'?a.status.localeCompare(b.status):0).map(r=><TableRow key={r.key}>
          <TableCell><Checkbox aria-label={`Select ${r.name} ${r.key}`} checked={selected.has(r.key)&&eligible(r)} disabled={!eligible(r)||busy} onCheckedChange={checked=>setSelected(prev=>{const n=new Set(prev);checked?n.add(r.key):n.delete(r.key);return n;})}/></TableCell>
          <TableCell className="min-w-40">{r.name}{r.customer&&<div className="text-xs text-muted-foreground">Created {new Date(r.customer.created_at).toLocaleDateString('en-GB')} · {r.key.slice(0,8)}</div>}</TableCell>
          <TableCell>{mode==='merge'&&r.customer&&!protectedCustomer(r.name)?<Select value={r.targetId||''} onValueChange={v=>changeWinner(r,v)}><SelectTrigger className="w-56"><SelectValue placeholder="Choose existing winner"/></SelectTrigger><SelectContent>{customers.filter(c=>!r.groupIds||r.groupIds.includes(c.id)).map(c=><SelectItem key={c.id} value={c.id}>{c.name} · {c.counts.customer_sites||0} sites · {c.id.slice(0,8)}</SelectItem>)}</SelectContent></Select>:r.status}</TableCell>
          <TableCell className="min-w-44 text-sm">{r.customer?describeCounts(r.customer.counts):'—'}</TableCell>
        </TableRow>)}</TableBody></Table></div>}
      </>}
      {confirm&&<p>{mode==='remove'?`Remove ${picked.length} completely empty customer(s)? This cannot be undone.`:`Merge ${picked.length} duplicate customer(s) into the selected winners? All linked records and contact details will be preserved. This cannot be undone.`}</p>}
      {results&&<><div className="flex flex-wrap gap-4 text-sm">{['Removed','Merged','Skipped','Not found'].map(status=><span key={status}>{status}: {results.filter(r=>r.status===status).length}</span>)}</div><Table><TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Result</TableHead><TableHead>Merged into</TableHead></TableRow></TableHeader><TableBody>{results.map((r,i)=><TableRow key={i}><TableCell>{r.name}</TableCell><TableCell>{r.status}</TableCell><TableCell>{r.into||'—'}</TableCell></TableRow>)}</TableBody></Table></>}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>{results?<Button variant="outline" onClick={()=>void download()}><Download className="mr-2 h-4 w-4"/>Download summary CSV</Button>:confirm?<><Button variant="outline" disabled={busy} onClick={()=>setConfirm(false)}>Back</Button><Button variant={mode==='remove'?'destructive':'default'} disabled={busy} onClick={()=>void apply()}>{busy?'Saving…':'Confirm '+(mode==='remove'?'removal':'merge')}</Button></>:<Button variant={mode==='remove'?'destructive':'default'} disabled={busy||!picked.length} onClick={()=>setConfirm(true)}>{mode==='remove'?'Remove selected':'Merge selected'} ({picked.length})</Button>}</DialogFooter>
    </DialogContent>
  </Dialog>;
}