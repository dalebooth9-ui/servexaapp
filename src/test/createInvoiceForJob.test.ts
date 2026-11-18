import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), insert: vi.fn() }));
vi.mock('@/lib/invoiceHelpers', async (orig) => ({ ...(await orig<any>()), syncInvoiceToXero: vi.fn(async () => ({ ok: false, skipped: true })) }));
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
});it('uses the job PO value, 20% VAT, 30-day due date and PO number', async () => {
  await createInvoiceForJob({ id: 'job-1', customer: 'C', name: 'Dry riser test', customer_po: 'PO123', po_value: 100 });
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ subtotal: 100, tax_rate: 20, tax_amount: 20, total: 120, customer_po: 'PO123' }));
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ unit_price: 100, quantity: 1, description: 'Dry riser test' }));
});
it('leaves the price blank when there is no PO value', async () => {
  await createInvoiceForJob({ id: 'job-1', customer: 'C', name: 'Job' });
  expect(mocks.insert).toHaveBeenCalledTimes(1);
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ subtotal: 0, total: 0 }));
});
