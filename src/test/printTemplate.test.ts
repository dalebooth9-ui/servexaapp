import { describe, it, expect } from 'vitest';
import { pickPrintTemplate } from '@/lib/printTemplate';
const A='org-a',B='org-b';
const t=(id:string,org:string|null,cat:string,created='2026-01-01')=>({id,name:'Anything',org_id:org,job_category:cat,status:'published',created_at:created});
describe('pickPrintTemplate',()=>{
  it('uses the default print template set on the job type, whatever its name',()=>{
    expect(pickPrintTemplate(A,['alarm'],[{slug:'alarm',print_template_id:'x2'}],[t('x1',A,'alarm'),t('x2',A,'other')])?.id).toBe('x2');
  });
  it('falls back to the company first template for that job type',()=>{
    expect(pickPrintTemplate(A,['alarm'],[],[t('late',A,'alarm','2026-03-01'),t('early',A,'alarm','2026-02-01')])?.id).toBe('early');
  });
  it('never uses another company template',()=>{
    expect(pickPrintTemplate(A,['alarm'],[{slug:'alarm',print_template_id:'b1'}],[t('b1',B,'alarm')])).toBeNull();
  });
  it('prefers company template over shared one',()=>{
    expect(pickPrintTemplate(A,['alarm'],[],[t('s',null,'alarm','2025-01-01'),t('own',A,'alarm')])?.id).toBe('own');
  });
});
