import { describe, expect, it } from 'vitest';
import { groupDuplicateAssets, assetCreationSource, type DuplicateAsset } from './assetDuplicates';
const asset = (id: string, patch: Partial<DuplicateAsset> = {}): DuplicateAsset => ({ id, org_id:'company1', site_id:'site1', name:'Dry Riser - Back Stairwell', category:'Dry Riser', site_name:'ABCA - 1-6 RIDDELL COURT', asset_tag:id,created_at:'2026-11-03T10:29:16Z',creation_source:null,source_filename:null,import_batch_id:null,notes:null,attributes:{},jobs_count:0,reports_count:0,history_count:0,documents_count:0,outlet_tags_count:0,outlet_printed_count:0,outlets_count:0,label_printed_at:null,label_status:'not_printed',last_inspection_at:null,...patch });
describe('safe duplicate review', () => {
 it('groups identical assets despite different QR tags',()=>expect(groupDuplicateAssets([asset('48W4EU'),asset('6K2QVY'),asset('ND7DVL')])[0].assets.length).toBe(3));
 it('never groups another company',()=>expect(groupDuplicateAssets([asset('a'),asset('b',{org_id:'company2'})])).toHaveLength(0));
 it('never groups another site',()=>expect(groupDuplicateAssets([asset('a'),asset('b',{site_id:'site2'})])).toHaveLength(0));
 it('never groups a different category',()=>expect(groupDuplicateAssets([asset('a'),asset('b',{category:'Wet Riser'})])).toHaveLength(0));
 it('recommends most attached history',()=>expect(groupDuplicateAssets([asset('old',{created_at:'2020-01-01'}),asset('history',{history_count:4})])[0].assets[0].id).toBe('history'));
 it('recommends oldest when history ties',()=>expect(groupDuplicateAssets([asset('new'),asset('old',{created_at:'2020-01-01'})])[0].assets[0].id).toBe('old'));
 it('reports evidenced import rather than guessing manual creation',()=>expect(assetCreationSource(asset('a',{source_filename:'3_assets.csv'}))).toBe('Import: 3_assets.csv'));
 it('does not fabricate origin for legacy records',()=>expect(assetCreationSource(asset('a'))).toBe('Not recorded (older asset)'));
});