import { beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('idb-keyval', () => ({ ...storage, createStore: vi.fn(), del: vi.fn(), keys: vi.fn() }));
import { loadFormDraftEnvelope, saveFormDraft } from '@/lib/offlineFormStorage';

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); storage.get.mockReset(); storage.set.mockReset(); });
it('restores answers and photo references from IndexedDB when the phone mirror is missing', async () => {
  storage.get.mockResolvedValue({ updatedAt: 123, data: { answer: 'GOOD', _site_photo_paths: ['bosden/photo.jpg'] } });
  expect(await loadFormDraftEnvelope('bosden')).toEqual({ updatedAt: 123, data: { answer: 'GOOD', _site_photo_paths: ['bosden/photo.jpg'] } });
});
it('does not claim a safe phone copy when both storage layers reject it', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
  storage.set.mockRejectedValue(new Error('full'));
  await expect(saveFormDraft('bosden', { answer: 'GOOD' }, true)).rejects.toThrow('Phone storage is unavailable or full');
});
it('keeps a phone copy when only the small mirror is full', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
  storage.set.mockResolvedValue(undefined);
  await expect(saveFormDraft('bosden', { answer: 'GOOD' }, true)).resolves.toBeUndefined();
});