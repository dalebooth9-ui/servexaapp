export type ExistingRiser = { id: string; asset_tag: string | null; outlets_count: number | null; riser_location: string | null; site_id: string | null };
export type ExistingOutlet = { asset_id: string; outlet_number: number; outlet_tag: string; is_fitted?: boolean };
export type ReprintLabel = { asset_id: string; outlet_number: number; tag: string; name: string; site_id: string | null };
/** Render saved identities only; the server creates missing outlet codes once. */
export function existingRiserLabels(risers: ExistingRiser[], outlets: ExistingOutlet[]): ReprintLabel[] {
  return risers.flatMap(r => {
    const labels: ReprintLabel[] = r.asset_tag ? [{ asset_id: r.id, outlet_number: 0, tag: r.asset_tag, name: 'Inlet', site_id: r.site_id }] : [];
    for (const t of outlets.filter(o => o.asset_id === r.id && o.is_fitted !== false).sort((a,b) => a.outlet_number-b.outlet_number)) {
      if (t.outlet_tag) labels.push({ asset_id: r.id, outlet_number: t.outlet_number, tag: t.outlet_tag, name: `Outlet ${t.outlet_number}`, site_id: r.site_id });
    }
    return labels;
  });
}
export function labelSelection(labels: ReprintLabel[], mode: 'all' | 'inlet' | 'outlets') {
  return new Set(labels.filter(l => mode === 'all' || (mode === 'inlet' ? l.outlet_number === 0 : l.outlet_number > 0)).map(l => l.tag));
}