export type ExistingRiser = { id: string; asset_tag: string | null; outlets_count: number | null; riser_location: string | null; site_id: string | null };
export type ExistingOutlet = { asset_id: string; outlet_number: number; outlet_tag: string };
export type ReprintLabel = { asset_id: string; outlet_number: number; tag: string; name: string; site_id: string | null };
/** Missing QR identities are never manufactured by a reprint flow. */
export function existingRiserLabels(risers: ExistingRiser[], outlets: ExistingOutlet[]): ReprintLabel[] {
  return risers.flatMap(r => {
    const labels: ReprintLabel[] = r.asset_tag ? [{ asset_id: r.id, outlet_number: 0, tag: r.asset_tag, name: 'Inlet', site_id: r.site_id }] : [];
    for (let n = 1; n <= (r.outlets_count || 0); n++) {
      const t = outlets.find(o => o.asset_id === r.id && o.outlet_number === n);
      if (t?.outlet_tag) labels.push({ asset_id: r.id, outlet_number: n, tag: t.outlet_tag, name: `Outlet ${n}`, site_id: r.site_id });
    }
    return labels;
  });
}
export function labelSelection(labels: ReprintLabel[], mode: 'all' | 'inlet' | 'outlets') {
  return new Set(labels.filter(l => mode === 'all' || (mode === 'inlet' ? l.outlet_number === 0 : l.outlet_number > 0)).map(l => l.tag));
}