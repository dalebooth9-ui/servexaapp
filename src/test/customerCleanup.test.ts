import { describe, expect, it } from 'vitest';
import { groupWinner, mergePreview, removePreview, type CleanupCustomer } from '@/lib/customerCleanup';
const c = (id:string,name:string,counts:Record<string,number>={},created_at='2020-01-01'):CleanupCustomer => ({id,name,counts,created_at});
describe('customer clean-up rules', () => {
  it('matches case and extra spaces, and assesses duplicate names separately', () => {
    const rows=removePreview([' WATKINS  '],[c('1','Watkins'),c('2','Watkins',{jobs:1})]);
    expect(rows.map(r=>r.status)).toEqual(['Safe to remove','Has data, will be skipped']);
  });
  for (const key of ['customer_sites','jobs','invoices_and_quotes','historic_reports','contact_details','customer_documents']) it(`never removes a customer with ${key}`,()=>expect(removePreview(['A'],[c('1','A',{[key]:1})])[0].status).toBe('Has data, will be skipped'));
  it('protects C Watkins Plumbing Ltd',()=>expect(removePreview(['C Watkins Plumbing Ltd'],[c('1','C Watkins Plumbing Ltd')])[0].status).toBe('Protected — will be skipped'));
  it('does not include unlisted customers',()=>expect(removePreview(['A'],[c('1','A'),c('2','B')]).map(r=>r.key)).toEqual(['1']));
  it('reports unmatched names',()=>expect(removePreview(['Absent'],[])[0].status).toBe('Not found'));
  it('keeps most sites, oldest on a tie',()=>expect(groupWinner([c('1','A',{customer_sites:2},'2022'),c('2','B',{customer_sites:2},'2020'),c('3','C',{customer_sites:1},'2010')])?.id).toBe('2'));
  it('resolves GROUP rows to the most-site winner',()=>expect(mergePreview([{name:'A',into:'GROUP: same'},{name:'B',into:'group: SAME'}],[c('1','A'),c('2','B',{customer_sites:3})]).map(r=>r.targetId)).toEqual(['2','2']));
  it('requires a choice when an explicit winner name is ambiguous',()=>expect(mergePreview([{name:'A',into:'B'}],[c('1','A'),c('2','B'),c('3','B')])[0].targetId).toBeUndefined());
});