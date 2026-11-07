import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
type Entry = { id: string; created_at: string; printed_by_name: string; labels: unknown };
export default function RiserReprintHistory({ assetId, revision }: { assetId: string; revision: number }) {
  const { orgId, userRole } = useAuth();
  const [rows, setRows] = useState<Entry[]>([]);
  useEffect(() => {
    if (!orgId || userRole !== 'admin') return;
    let alive = true;
    supabase.from('riser_label_reprints').select('id,created_at,printed_by_name,labels').eq('org_id', orgId).eq('asset_id', assetId).order('created_at', { ascending: false }).then(({ data }) => { if (alive) setRows(data || []); });
    return () => { alive = false; };
  }, [assetId, revision, orgId, userRole]);
  if (!rows.length || userRole !== 'admin') return null;
  return <ul className="divide-y border-b">{rows.map(r => <li key={r.id} className="px-4 py-3 text-sm">
    <p className="font-medium">Reprinted · {new Date(r.created_at).toLocaleString('en-GB')}</p>
    <p className="text-muted-foreground">{r.printed_by_name} · {Array.isArray(r.labels) ? r.labels.map(l => typeof l === 'object' && l !== null && 'tag' in l ? String(l.tag) : '').join(', ') : ''}</p>
  </li>)}</ul>;
}