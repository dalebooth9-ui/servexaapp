export type DuplicateAsset = {
  id: string; org_id: string; site_id: string; name: string; category: string; site_name: string;
  asset_tag: string | null; created_at: string; creation_source: string | null; source_filename: string | null;
  import_batch_id: string | null; notes: string | null; attributes: Record<string, unknown> | null;
  jobs_count: number; reports_count: number; history_count: number; documents_count: number;
  outlet_tags_count: number; outlet_printed_count: number; outlets_count: number | null;
  label_printed_at: string | null; label_status: string; last_inspection_at: string | null;
};
export const attachmentScore = (a: DuplicateAsset) => a.history_count + a.reports_count + a.jobs_count + a.documents_count + a.outlet_tags_count;
export function groupDuplicateAssets(rows: DuplicateAsset[]) {
  const groups = new Map<string, DuplicateAsset[]>();
  for (const a of rows) {
    const key = JSON.stringify([a.org_id, a.site_id, a.name.trim().toLowerCase(), a.category.trim().toLowerCase()]);
    groups.set(key, [...(groups.get(key) || []), a]);
  }
  return [...groups.entries()].filter(([, assets]) => assets.length > 1).map(([key, assets]) => ({
    key, assets: assets.sort((a, b) => attachmentScore(b) - attachmentScore(a) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)),
  }));
}
export function assetCreationSource(a: DuplicateAsset): string {
  if (a.source_filename) return `Import: ${a.source_filename}`;
  if (a.creation_source) return a.creation_source;
  if (a.import_batch_id) return 'Import (filename unavailable)';
  if (a.attributes?.auto_created_from_response) return 'Report / paper scan sync';
  if (a.notes?.includes('Imported from scan:')) return 'Paper scan';
  return 'Not recorded (older asset)';
}