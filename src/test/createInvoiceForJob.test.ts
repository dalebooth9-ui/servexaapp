import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), insert: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getUser: mocks.getUser },
  from: () => {
    const q: any = {};
    for (const method of ['select','eq','order','limit']) q[method] = () => q;
    q.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve);
    q.insert = (payload: unknown) => { mocks.insert(payload); return q; };
    q.single = async () => ({ data: { id: 'invoice-1' }, error: null });
    return q;
  },
} }));
import { createInvoiceForJob } from '../lib/createInvoiceForJob';
beforeEach(() => { vi.clearAllMocks(); mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null }); });
it('records the signed-in creator on the job invoice', async () => {
  expect(await createInvoiceForJob({ id: 'job-1', customer: 'Customer' })).toBe('invoice-1');
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ created_by: 'admin-1', job_id: 'job-1', document_type: 'invoice' }));
});
it('does not insert an invoice without a signed-in creator', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  await expect(createInvoiceForJob({ id: 'job-1' })).rejects.toThrow('Please sign in again');
  expect(mocks.insert).not.toHaveBeenCalled();
});