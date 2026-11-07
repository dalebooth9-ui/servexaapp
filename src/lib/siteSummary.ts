import { fuzzyMatch } from '@/lib/fuzzyMatch';

export type SummarySite = { id: string; name: string; site_type: string; parent_id: string | null; address?: string | null; postcode?: string | null };
export type SiteSummaryType = 'region' | 'site' | 'building' | 'zone';

export function siteAncestors<T extends SummarySite>(site: T, records: T[]): T[] {
  const byId = new Map(records.map(record => [record.id, record]));
  const result: T[] = [];
  const visited = new Set([site.id]);
  let parentId = site.parent_id;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    result.push(parent);
    parentId = parent.parent_id;
  }
  return result;
}

export function filteredSummarySites<T extends SummarySite>(records: T[], query: string, folders: { name: string; sites: { id: string }[] }[]): T[] {
  if (!query.trim()) return records;
  const customerSiteIds = new Set(folders.filter(folder => fuzzyMatch(query, folder.name)).flatMap(folder => folder.sites.map(site => site.id)));
  const matches = records.filter(site => {
    const family = [site, ...siteAncestors(site, records)];
    return family.some(record => customerSiteIds.has(record.id) || fuzzyMatch(query, record.name, record.address, record.postcode));
  });
  const included = new Set(matches.flatMap(site => [site.id, ...siteAncestors(site, records).map(parent => parent.id)]));
  return records.filter(site => included.has(site.id));
}

export function siteSummaryCounts(records: SummarySite[]): Record<SiteSummaryType, number> {
  return {
    region: records.filter(site => site.site_type === 'region').length,
    site: records.filter(site => site.site_type === 'site').length,
    building: records.filter(site => site.site_type === 'building').length,
    zone: records.filter(site => site.site_type === 'zone').length,
  };
}