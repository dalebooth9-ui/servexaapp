import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { fetchOrgRows, requireCurrentOrgId } from '@/lib/tenantQueries';
import { DEFAULT_SITE_JOB_TYPE, SITE_JOB_TYPES, duplicateCustomerNames, siteRiserInitialIds, blankNewRiser, newRiserPayload, type SiteJobType, type NewRiserDraft } from '@/lib/siteJobForm';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { UKDateInput } from '@/components/ui/uk-date-input';
import { Briefcase, CalendarPlus, Link2, Loader2, Minus, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Riser = { id: string; name: string; riser_location: string | null; asset_tag: string | null; outlets_count: number | null };
type Props = {
  siteId: string;
  siteName: string;
  initialIds?: string[];
  initialType?: SiteJobType;
  selectionNote?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function SiteJobDialog({ siteId, siteName, initialIds, initialType, selectionNote, open, onOpenChange }: Props) {
  const { userRole } = useAuth();
  const navigate = useNavigate();
  const [risers, setRisers] = useState<Riser[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [customer, setCustomer] = useState('');
  const [siteCustomerMissing, setSiteCustomerMissing] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkChoice, setLinkChoice] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [type, setType] = useState<SiteJobType>(initialType ?? DEFAULT_SITE_JOB_TYPE);
  const [name, setName] = useState(siteName);
  const [po, setPo] = useState('');
  const [reference, setReference] = useState('');
  const [priority, setPriority] = useState('medium');
  const [due, setDue] = useState('');
  const [notes, setNotes] = useState('');
  const [other, setOther] = useState('');
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [request, setRequest] = useState('');
  const [newRisers, setNewRisers] = useState<NewRiserDraft[]>([]);
  const [showNewErrors, setShowNewErrors] = useState(false);

  useEffect(() => {
    if (!open || userRole !== 'admin') return;
    let live = true;
    setLoading(true);
    setError('');
    setRequest(crypto.randomUUID());
    setName(siteName);
    setType(initialType ?? DEFAULT_SITE_JOB_TYPE);
    setPo('');
    setReference('');
    setPriority('medium');
    setDue('');
    setNotes('');
    setOther('');
    setQty(1);
    setNewRisers([]);
    setShowNewErrors(false);
    setLinkOpen(false);
    setLinkChoice('');
    setSiteCustomerMissing(false);
    (async () => {
      const org = await requireCurrentOrgId();
      const [assets, cs, owner] = await Promise.all([
        fetchOrgRows<any>('assets', 'id,name,site_id,asset_type,status,merged_into_asset_id,riser_location,asset_tag,outlets_count', 'id', supabase, org),
        fetchOrgRows<{ id: string; name: string }>('customers', 'id,name', 'id', supabase, org),
        supabase.rpc('riser_visit_customer', { _site_id: siteId }),
      ]);
      if (owner.error) throw owner.error;
      if (!live) return;
      const rows = assets.filter(a => a.site_id === siteId && ['Dry Riser', 'Wet Riser'].includes(a.asset_type) && a.status !== 'decommissioned' && !a.merged_into_asset_id);
      rows.sort((a, b) => String(a.riser_location || a.name).localeCompare(String(b.riser_location || b.name)));
      const allowedIds = new Set(rows.map(row => row.id));
      setRisers(rows);
      setIds(initialIds === undefined ? siteRiserInitialIds(rows) : initialIds.filter(id => allowedIds.has(id)));
      if (!rows.length) setNewRisers([blankNewRiser()]);
      setCustomers(cs.sort((a, b) => a.name.localeCompare(b.name)));
      setCustomer(owner.data || '');
      setSiteCustomerMissing(!owner.data);
    })().catch(e => { if (live) setError(e.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [open, siteId, siteName, userRole, initialType]);

  if (userRole !== 'admin') return null;
  const duplicates = duplicateCustomerNames(customer, customers);
  const newCheck = newRiserPayload(newRisers);
  const riserTotal = ids.length + newRisers.length;
  const valid = Boolean(name.trim() && riserTotal > 0 && (type !== 'other' || (other.trim() && qty > 0)));

  const linkCustomer = async () => {
    if (!linkChoice || linkBusy) return;
    setLinkBusy(true);
    setError('');
    try {
      const { error: linkError } = await supabase.from('customer_sites').insert({ customer_id: linkChoice, site_id: siteId });
      if (linkError) throw linkError;
      setCustomer(linkChoice);
      setSiteCustomerMissing(false);
      setLinkOpen(false);
      setLinkChoice('');
      toast.success('Customer linked to site');
      window.dispatchEvent(new Event('riser-visits:changed'));
    } catch (e: any) {
      setError(e.message);
      toast.error('Customer not linked', { description: e.message });
    } finally {
      setLinkBusy(false);
    }
  };

  const patchNew = (key: string, patch: Partial<NewRiserDraft>) => setNewRisers(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r));
  const stepOutlets = (r: NewRiserDraft, d: number) => { const n = r.outlets.trim() === '' ? 0 : Number(r.outlets) || 0; patchNew(r.key, { outlets: String(Math.max(0, Math.min(200, n + d))) }); };

  const create = async (schedule: boolean) => {
    if (Object.keys(newCheck.errors).length) { setShowNewErrors(true); return; }
    if (!valid || loading || busy) return;
    setBusy(true);
    setError('');
    try {
      const details = { name, po, reference_number: reference, priority, due_date: due, notes, customer_id: customer, type, other_service_type: other, other_qty: qty };
      const { data, error } = newRisers.length
        ? await supabase.rpc('create_site_riser_job_with_new_risers', { _site_id: siteId, _request_id: request, _riser_ids: ids, _details: details, _new_risers: newCheck.payload as any })
        : await supabase.rpc('create_site_riser_job', { _site_id: siteId, _request_id: request, _riser_ids: ids, _details: details });
      if (error) throw error;
      if (!data) throw new Error('Job was not saved');
      toast.success('Job created');
      onOpenChange(false);
      navigate(schedule ? `/planner?job=${data}` : `/jobs/${data}`);
    } catch (e: any) {
      setError(e.message);
      toast.error('Job not created', { description: e.message });
    } finally {
      setBusy(false);
    }
  };

  return <Dialog open={open} onOpenChange={v => { if (!busy) onOpenChange(v); }}>
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Create Job for {siteName}</DialogTitle><DialogDescription>{siteName}</DialogDescription></DialogHeader>
      {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading site risers" /> : <div className="space-y-4">
        {siteCustomerMissing && <div role="alert" className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">This site isn't linked to a customer yet</p>
            <Button size="sm" variant="outline" onClick={() => setLinkOpen(value => !value)}><Link2 className="mr-2 h-4 w-4" />Link a customer</Button>
          </div>
          {linkOpen && <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={linkChoice} onValueChange={setLinkChoice}>
              <SelectTrigger aria-label="Customer to link"><SelectValue placeholder="Choose a customer" /></SelectTrigger>
              <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button disabled={!linkChoice || linkBusy} onClick={linkCustomer}>{linkBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save customer link</Button>
          </div>}
        </div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="site-job-name">Job name</Label><Input id="site-job-name" value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="site-job-po">PO number (optional)</Label><Input id="site-job-po" value={po} onChange={e => setPo(e.target.value)} /></div>
        </div>
        <div className="space-y-1">
          <Label>Customer</Label>
          <Select value={customer || 'none'} onValueChange={v => setCustomer(v === 'none' ? '' : v)}>
            <SelectTrigger aria-label="Customer"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">No customer</SelectItem>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
          {duplicates.length > 0 && <p role="status" className="text-sm text-destructive">Possible duplicate customer name: {duplicates.map(c => c.name).join(', ')}. Check the selected customer before creating.</p>}
        </div>
        <div className="space-y-2"><Label>Job type</Label><RadioGroup value={type} onValueChange={v => setType(v as SiteJobType)} aria-label="Job type">{SITE_JOB_TYPES.map(t => <div key={t.value} className="flex items-center gap-2"><RadioGroupItem value={t.value} id={`site-job-${t.value}`} /><Label htmlFor={`site-job-${t.value}`} className="font-normal">{t.label}</Label></div>)}</RadioGroup></div>
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><Label>Risers on this job</Label><span className="text-sm text-muted-foreground">{ids.length} of {risers.length} risers{newRisers.length ? ` + ${newRisers.length} new` : ''}</span></div>
          <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setIds(risers.map(r => r.id))}>Select all</Button><Button size="sm" variant="outline" onClick={() => setIds([])}>Clear</Button></div>
          {risers.length > 0 && <p role="note" className="text-xs text-muted-foreground">{selectionNote ?? `All ${risers.length} risers at this site ticked.`}</p>}
          <div className="max-h-56 overflow-y-auto divide-y border rounded-md">
            {risers.map(r => <label key={r.id} className="flex items-start gap-3 p-3"><Checkbox aria-label={`Select ${r.riser_location || r.name}`} checked={ids.includes(r.id)} onCheckedChange={v => setIds(prev => v ? [...prev, r.id] : prev.filter(id => id !== r.id))} /><span className="min-w-0 text-sm break-words"><strong>{r.riser_location || r.name}</strong><span className="block text-muted-foreground">{r.asset_tag} · {r.outlets_count ?? 'Unknown'} outlets</span></span></label>)}
            {!risers.length && <p className="p-3 text-sm text-muted-foreground">No active risers registered at this site.</p>}
          </div>
          {newRisers.map((r, i) => <div key={r.key} className="space-y-2 rounded-md border p-3" data-testid="new-riser">
            <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">New riser {i + 1}</p><Button size="sm" variant="ghost" aria-label={`Remove new riser ${i + 1}`} onClick={() => setNewRisers(prev => prev.filter(x => x.key !== r.key))}><Trash2 className="h-4 w-4" /></Button></div>
            <div className="space-y-1"><Label htmlFor={`nr-loc-${r.key}`}>Riser name or location</Label><Input id={`nr-loc-${r.key}`} placeholder="e.g. Riser 1 – Stair 4" value={r.location} aria-invalid={showNewErrors && !!newCheck.errors[r.key]} className={showNewErrors && newCheck.errors[r.key] ? 'border-destructive' : ''} onChange={e => patchNew(r.key, { location: e.target.value })} /></div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor={`nr-out-${r.key}`}>Number of outlets</Label><div className="flex items-center gap-1"><Button type="button" size="icon" variant="outline" aria-label="Fewer outlets" onClick={() => stepOutlets(r, -1)}><Minus className="h-4 w-4" /></Button><Input id={`nr-out-${r.key}`} type="number" inputMode="numeric" min={0} max={200} placeholder="Not known" className="text-center" value={r.outlets} onChange={e => patchNew(r.key, { outlets: e.target.value })} /><Button type="button" size="icon" variant="outline" aria-label="More outlets" onClick={() => stepOutlets(r, 1)}><Plus className="h-4 w-4" /></Button></div><p className="text-xs text-muted-foreground">Leave blank if not known; the engineer can set it on site.</p></div>
              <div className="space-y-1"><Label htmlFor={`nr-in-${r.key}`}>Number of inlets</Label><Input id={`nr-in-${r.key}`} type="number" inputMode="numeric" min={1} max={20} value={r.inlets} onChange={e => patchNew(r.key, { inlets: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor={`nr-fl-${r.key}`}>Floors served (optional)</Label><Input id={`nr-fl-${r.key}`} placeholder="e.g. Ground to 8th" value={r.floors} onChange={e => patchNew(r.key, { floors: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor={`nr-key-${r.key}`}>Cabinet keys (optional)</Label><Input id={`nr-key-${r.key}`} placeholder="e.g. JD key" value={r.cabinetKeys} onChange={e => patchNew(r.key, { cabinetKeys: e.target.value })} /></div>
            </div>
            {showNewErrors && newCheck.errors[r.key] && <p role="alert" className="text-sm text-destructive">{newCheck.errors[r.key]}</p>}
          </div>)}
          <Button size="sm" variant="outline" onClick={() => setNewRisers(prev => [...prev, blankNewRiser()])}><Plus className="mr-2 h-4 w-4" />Add riser</Button>
          {newRisers.length > 0 && <p className="text-xs text-muted-foreground">New risers are saved when the job is created, each with its own riser code and one QR code per outlet (riser code-1, -2 and so on).</p>}
        </section>
        {type === 'other' && <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="site-job-other-service">Other Service Type</Label><Input id="site-job-other-service" value={other} onChange={e => setOther(e.target.value)} /></div><div><Label htmlFor="site-job-qty">Other Qty</Label><Input id="site-job-qty" type="number" min={1} value={qty} onChange={e => setQty(Number(e.target.value))} /></div></div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="site-job-ref">Reference number (optional)</Label><Input id="site-job-ref" placeholder="Auto-generated if blank" value={reference} onChange={e => setReference(e.target.value)} /></div>
          <div className="space-y-1"><Label>Priority</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger aria-label="Priority"><SelectValue /></SelectTrigger><SelectContent>{['high', 'medium', 'low'].map(p => <SelectItem key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div><Label>Due date (optional)</Label><UKDateInput value={due} onChange={e => setDue(e.target.value)} /></div>
        <div><Label htmlFor="site-job-notes">Notes (optional)</Label><Textarea id="site-job-notes" value={notes} onChange={e => setNotes(e.target.value)} /></div>
      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!loading && riserTotal === 0 && <p role="status" className="text-sm text-muted-foreground">Tick a riser or use Add riser to enable Create job.</p>}
      <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
        <div><Button className="w-full" disabled={loading || busy || !valid} onClick={() => create(false)}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Briefcase className="mr-2 h-4 w-4" />}Create job</Button><p className="mt-1 text-xs text-muted-foreground">Saves the job and opens its job page.</p></div>
        <div><Button className="w-full" variant="secondary" disabled={loading || busy || !valid} onClick={() => create(true)}><CalendarPlus className="mr-2 h-4 w-4" />Create and schedule</Button><p className="mt-1 text-xs text-muted-foreground">Saves the job, then opens the planner.</p></div>
      </div>
    </DialogContent>
  </Dialog>;
}
