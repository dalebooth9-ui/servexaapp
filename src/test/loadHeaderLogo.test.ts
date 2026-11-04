import {describe,it,expect,vi} from 'vitest';
import {loadHeaderLogo} from '@/lib/loadHeaderLogo';
describe('print header logo fallback',()=>{
  it('uses the customer logo when it loads',async()=>{
    const load=vi.fn().mockResolvedValue('customer-image');
    expect(await loadHeaderLogo('customer.png','viva.png',load)).toEqual({url:'customer.png',image:'customer-image'});
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('uses Viva when the selected customer logo is missing',async()=>{
    const load=vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('viva-image');
    expect(await loadHeaderLogo('missing.png','viva.png',load)).toEqual({url:'viva.png',image:'viva-image'});
    expect(load.mock.calls).toEqual([['missing.png'],['viva.png']]);
  });
  it('uses Viva when a customer has no logo',async()=>{
    expect(await loadHeaderLogo('','viva.png',async()=> 'viva-image')).toEqual({url:'viva.png',image:'viva-image'});
  });
  it('tries Viva after a customer logo request throws',async()=>{
    const load=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('viva-image');
    expect((await loadHeaderLogo('customer.png','viva.png',load)).image).toBe('viva-image');
  });
});