import { expect, it } from 'vitest';
import { alphabeticalPriceBook } from '../lib/priceBookOrder';
it('orders prices A to Z by description rather than UUID', () => {
  const items = [{ id: 'a', description: 'Padlocks & straps' }, { id: 'z', description: 'Air release sign' }, { id: 'b', description: 'Outlet sign' }];
  expect(alphabeticalPriceBook(items).map(i => i.description)).toEqual(['Air release sign', 'Outlet sign', 'Padlocks & straps']);
  expect(items[0].description).toBe('Padlocks & straps');
});