import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { linkedRiserIds, siteAddressOnce } from '@/components/riser-visits/VisitPaperwork';
import { accessPriorityLines } from '@/lib/siteAccessRules';

describe('Print reports riser rules', () => {
  it('uses only risers linked to the job', () => {
    expect(linkedRiserIds({ asset_id: 'a' }, [{ responses: { riser_asset_id: 'b' } }, { responses: { _riser_visit: { asset_id: 'c' } } }, { responses: {} }]).sort()).toEqual(['a', 'b', 'c']);
  });
  it('no linked risers means none (office must tick)', () => {
    expect(linkedRiserIds({ asset_id: null }, [{ responses: { foo: 1 } }])).toEqual([]);
  });
  it('site address printed once', () => {
    expect(siteAddressOnce('ASTORIA WAY LONDON E14 9RL', 'E14 9RL')).toBe('ASTORIA WAY LONDON E14 9RL');
    expect(siteAddressOnce('1 High St, Leeds', 'LS1 1AA')).toBe('1 High St, Leeds, LS1 1AA');
  });
  it("riser's own key beats site key", () => {
    const l = accessPriorityLines({ cabinet_key_type: 'FB11', cabinet_key_held: 'Reception' }, true, 'Padlock 42');
    expect(l[0]).toBe('Riser key: Padlock 42');
    expect(l.join(' ')).not.toContain('FB11');
  });
  it('falls back to site key when riser has none', () => {
    expect(accessPriorityLines({ cabinet_key_type: 'FB11' }, true, null)[0]).toBe('Key: FB11');
  });
});
