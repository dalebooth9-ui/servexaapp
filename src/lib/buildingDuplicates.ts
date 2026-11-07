export interface BuildingCandidate { id: string; name: string; parent_id: string | null; site_type: string }
export function buildingDuplicatePairs<T extends BuildingCandidate>(sites: T[], counts: Map<string, { assets: number }>): { source: T; keep: T }[] {
  const normalise = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const result: { source: T; keep: T }[] = [];
  const buildings = sites.filter(s => s.site_type === 'building' && s.parent_id);
  for (const long of buildings) {
    const matches = buildings.filter(short => short.id !== long.id && short.parent_id === long.parent_id && normalise(long.name).startsWith(normalise(short.name) + ' ') && normalise(short.name));
    const short = matches.sort((a,b) => normalise(b.name).length-normalise(a.name).length)[0];
    if (!short) continue;
    const lc = counts.get(long.id), sc = counts.get(short.id);
    if (!lc || !sc || (lc.assets > 0 && sc.assets > 0)) continue;
    result.push(lc.assets === 0 ? {source:long,keep:short} : {source:short,keep:long});
  }
  return result;
}