import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { existingRiserLabels, type ReprintLabel } from '@/lib/riserLabelReprints';
import { stickerUrl } from '@/lib/riserStickers';
import PrintQrLabels from './PrintQrLabels';

export default function RiserQrRows({ assetId, onPrinted }: { assetId: string; onPrinted?: () => void }) {
  const { orgId, userRole } = useAuth();
  const [labels, setLabels] = useState<ReprintLabel[]>([]);
  const [total, setTotal] = useState(0);
  const [retired, setRetired] = useState<{ outlet_number: number; outlet_tag: string }[]>([]);
  useEffect(() => {
    if (!orgId || userRole !== 'admin') return;
    let alive = true;
    Promise.all([
      supabase.from('assets').select('id,asset_tag,outlets_count,riser_location,site_id').eq('org_id', orgId).eq('id', assetId).maybeSingle(),
      supabase.from('riser_outlet_tags').select('asset_id,outlet_number,outlet_tag,is_fitted').eq('org_id', orgId).eq('asset_id', assetId).order('outlet_number'),
    ]).then(([a, o]) => { if (alive && a.data) { setLabels(existingRiserLabels([a.data], o.data || [])); setTotal(a.data.outlets_count || 0); setRetired((o.data || []).filter(t => !t.is_fitted || t.outlet_number > (a.data?.outlets_count || 0))); } });
    return () => { alive = false; };
  }, [assetId, orgId, userRole]);
  if (userRole !== 'admin') return null;
  return <ul className="divide-y mb-4">{labels.map(l => <li key={l.tag} className="flex items-center gap-3 py-3">
    <QRCodeSVG value={stickerUrl(l.tag)} size={56} />
    <span className="flex-1 text-sm">{l.name}<span className="block font-mono">{l.tag}</span></span>
    <PrintQrLabels assetId={assetId} onlyOutlet={l.outlet_number} iconOnly onPrinted={onPrinted} />
  </li>)}{retired.map(t => <li key={t.outlet_tag} className="py-3 text-sm text-muted-foreground">Outlet {t.outlet_number} · No longer fitted <span className="font-mono">{t.outlet_tag}</span></li>)}{Array.from({ length: total }, (_, i) => i + 1).filter(n => !labels.some(l => l.outlet_number === n)).map(n => <li key={`missing-${n}`} className="py-3 text-sm text-muted-foreground">Outlet {n} · No saved QR label yet</li>)}</ul>;
}