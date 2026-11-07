import { describe, expect, it } from 'vitest';
import { filteredSummarySites, siteAncestors, siteSummaryCounts } from './siteSummary';

const records = [
  { id: 'r', name: 'North', site_type: 'region', parent_id: null },
  { id: 's', name: 'Court', site_type: 'site', parent_id: 'r' },
  { id: 'b', name: 'Tower', site_type: 'building', parent_id: 's' },
  { id: 'b2', name: 'Annex', site_type: 'building', parent_id: 's' },
  { id: 'z', name: 'Roof', site_type: 'zone', parent_id: 'b' },
  { id: 's2', name: 'School', site_type: 'site', parent_id: null },
];

describe('Sites summary lists', () => {
  it('counts each building record, even when buildings share a site', () => {
    expect(siteSummaryCounts(records)).toEqual({ region: 1, site: 2, building: 2, zone: 1 });
  });
  it('search scopes counts to the matching site and its hierarchy', () => {
    expect(siteSummaryCounts(filteredSummarySites(records, 'Court', []))).toEqual({ region: 1, site: 1, building: 2, zone: 1 });
  });
  it('customer search includes assigned sites and descendants, not other sites', () => {
    expect(siteSummaryCounts(filteredSummarySites(records, 'Acme', [{ name: 'Acme', sites: [{ id: 's' }] }]))).toEqual({ region: 1, site: 1, building: 2, zone: 1 });
  });
  it('finds the owning site and region for zones and buildings', () => {
    expect(siteAncestors(records[4], records).map(site => site.id)).toEqual(['b', 's', 'r']);
  });
  it('unmatched search yields zero for all boxes', () => {
    expect(siteSummaryCounts(filteredSummarySites(records, 'Unknown', []))).toEqual({ region: 0, site: 0, building: 0, zone: 0 });
  });
});