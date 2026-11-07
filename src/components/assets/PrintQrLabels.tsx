import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { buildStickerPackPdf, loadOffsets, stickerUrl } from '@/lib/riserStickers';
import { existingRiserLabels, labelSelection, type ExistingRiser, type ReprintLabel } from '@/lib/riserLabelReprints';
import { riserOrFilter } from '@/lib/dryRisers';
import { resolvePrintCustomer } from '@/lib/documentBrandingProfile';
import { getGeneratingOrgFallbackLogoUrl } from '@/lib/generatingOrgBranding';

export default function PrintQrLabels({ assetId, siteId, onlyOutlet, iconOnly = false, onPrinted }: {
  assetId?: string; siteId?: string; onlyOutlet?: number; iconOnly?: boolean; onPrinted?: () => void;
}) {
  const { userRole, orgId } = useAuth();
  const [open, setOpen] = useState(false);
  const [risers, setRisers] = useState<ExistingRiser[]>([]);
  const [labels, setLabels] = useState<ReprintLabel[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [logos, setLogos] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !orgId || userRole !== 'admin') return;
    let alive = true;
    setLoading(true);
    setLabels([]);
    (async () => {
      let q = supabase.from('assets').select('id,asset_tag,outlets_count,riser_location,site_id').eq('org_id', orgId).is('merged_into_asset_id', null).or(riserOrFilter()).order('id');
      if (assetId) q = q.eq('id', assetId);
      else if (siteId) q = q.eq('site_id', siteId);
      else throw new Error('Choose a riser or site');
      const rows: ExistingRiser[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await q.range(from, from + 999);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const outlets = [];
      for (const r of rows) for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('riser_outlet_tags').select('asset_id,outlet_number,outlet_tag').eq('org_id', orgId).eq('asset_id', r.id).order('id').range(from, from + 999);
        if (error) throw error;
        outlets.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const list = existingRiserLabels(rows, outlets).filter(l => onlyOutlet === undefined || l.outlet_number === onlyOutlet);
      const logo = await getGeneratingOrgFallbackLogoUrl();
      const bySite: Record<string, string | null> = {};
      for (const id of new Set(rows.map(r => r.site_id))) {
        const customer = id ? await resolvePrintCustomer({ siteId: id }) : null;
        bySite[id || ''] = customer?.print_logo_url || customer?.logo_url ? null : logo;
      }
      if (alive) { setRisers(rows); setLabels(list); setPicked(labelSelection(list, 'all')); setLogos(bySite); }
    })().catch(() => { if (alive) toast.error('Could not load existing QR labels. Please try again.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, orgId, userRole, assetId, siteId, onlyOutlet]);
  if (userRole !== 'admin') return null;
  const selected = labels.filter(l => picked.has(l.tag));
  const toggle = (tags: string[], checked: boolean) => setPicked(p => { const next = new Set(p); tags.forEach(t => checked ? next.add(t) : next.delete(t)); return next; });
  const print = async () => {
    if (!selected.length) return;
    setBusy(true);
    try {
      // Group by branding while retaining existing primary-domain QR identities.
      const groups = new Map<string | null, ReprintLabel[]>();
      for (const l of selected) { const logo = logos[l.site_id || ''] || null; groups.set(logo, [...(groups.get(logo) || []), l]); }
      const docs = [];
      for (const [logoUrl, items] of groups) docs.push(await buildStickerPackPdf({ items: items.map(l => ({ asset_tag: l.tag })), logoUrl, offsets: loadOffsets() }));
      const { error } = await supabase.rpc('log_riser_label_reprints', { _labels: selected.map(l => ({ asset_id: l.asset_id, outlet_number: l.outlet_number, tag: l.tag })) });
      if (error) throw error;
      docs.forEach((doc, i) => doc.save(`qr-label-reprints${docs.length > 1 ? `-${i + 1}` : ''}.pdf`));
      toast.success(`${selected.length} label(s) ready to print; reprint logged`);
      onPrinted?.();
    } catch { toast.error('Could not prepare and record the reprint. Please try again.'); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button type="button" size={iconOnly ? 'icon' : 'sm'} variant="outline" title={iconOnly ? 'Print this QR label' : 'Print QR labels'} aria-label={iconOnly ? 'Print this QR label' : 'Print QR labels'}>
      <Printer className={iconOnly ? 'h-4 w-4' : 'h-4 w-4 mr-1.5'} />{!iconOnly && 'Print QR labels'}
    </Button></DialogTrigger>
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Print QR labels</DialogTitle><DialogDescription>Only reprint labels that are damaged or missing. Fitted labels already work.</DialogDescription></DialogHeader>
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : <>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={labels.length > 0 && picked.size === labels.length} onCheckedChange={v => setPicked(v ? labelSelection(labels, 'all') : new Set())} />Select all</label>
          <Button variant="ghost" size="sm" onClick={() => setPicked(labelSelection(labels, 'inlet'))}>Inlet only</Button>
          <Button variant="ghost" size="sm" onClick={() => setPicked(labelSelection(labels, 'outlets'))}>All outlets</Button>
        </div>
        {risers.map(r => { const list = labels.filter(l => l.asset_id === r.id); return <div key={r.id} className="border-b pb-3 space-y-2">
          {!assetId && <label className="flex items-center gap-2 font-medium text-sm"><Checkbox checked={list.length > 0 && list.every(l => picked.has(l.tag))} onCheckedChange={v => toggle(list.map(l => l.tag), Boolean(v))} />{r.riser_location || r.asset_tag || 'Riser'}</label>}
          {list.map(l => <label key={l.tag} className="flex items-center gap-3 text-sm"><Checkbox checked={picked.has(l.tag)} onCheckedChange={v => toggle([l.tag], Boolean(v))} /><span>{l.name}</span><span className="font-mono ml-auto">{l.tag}</span></label>)}
          {onlyOutlet === undefined && list.length < 1 + (r.outlets_count || 0) && <p className="text-sm text-muted-foreground">Some labels have no saved QR code yet. Existing labels can still be reprinted; no new codes will be made here.</p>}
        </div>; })}
        {!labels.length && <p className="text-sm text-muted-foreground">No existing QR labels available.</p>}
        {selected.length > 0 && <div aria-label="Label preview" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {selected.map(l => <div key={l.tag} className="flex items-center gap-3 border rounded p-3 bg-background">
            <QRCodeSVG value={stickerUrl(l.tag)} size={72} />
            <div className="flex-1 text-center"><p className="font-mono font-bold">{l.tag}</p>{logos[l.site_id || ''] && <img src={logos[l.site_id || ''] || ''} alt="Company logo" className="mx-auto mt-2 h-8 max-w-24 object-contain" />}</div>
          </div>)}
        </div>}
        <Button onClick={print} disabled={busy || !selected.length}><Printer className="h-4 w-4 mr-2" />{busy ? 'Preparing…' : `Print ${selected.length} label(s)`}</Button>
      </>}
    </DialogContent>
  </Dialog>;
}