import { expect, it } from 'vitest';
import { countAnswers, dedupeSitePhotos, mergeLocalDraft, photoSubmitBlocker } from '../lib/reportDraftSafety';

it('never lets an older phone copy overwrite newer saved answers', () => {
  const r = mergeLocalDraft({ server: { valve: 'Male' }, serverUpdatedAt: 2000, local: { valve: 'Female' }, localUpdatedAt: 1000 });
  expect(r.merged.valve).toBe('Male');
  expect(r.restored).toBe(false);
});

it('never lets blank phone values wipe filled answers', () => {
  const r = mergeLocalDraft({ server: { valve: 'Male', notes: 'ok' }, serverUpdatedAt: 1000, local: { valve: '', notes: null }, localUpdatedAt: 5000 });
  expect(r.merged).toEqual({ valve: 'Male', notes: 'ok' });
  expect(r.restored).toBe(false);
});

it('restores newer phone answers and counts them', () => {
  const r = mergeLocalDraft({ server: {}, serverUpdatedAt: 1000, local: { a: 'x', b: true, _site_photo_paths: ['j/1.jpg'] }, localUpdatedAt: 5000 });
  expect(r.answers).toBe(2);
  expect(r.photos).toBe(1);
  expect(r.restored).toBe(true);
});

it('does not announce a restore when the phone copy only holds pre-filled job details', () => {
  const r = mergeLocalDraft({ server: {}, local: { site: 'Bosden' }, localUpdatedAt: 5000, skipKeys: new Set(['site']) });
  expect(r.restored).toBe(false);
});

it('stores each photo once even if it was added twice', () => {
  const out = dedupeSitePhotos({ _site_photo_paths: ['a', 'b', 'a', 'b'], _site_photo_urls: ['ua', 'ub', 'ua', 'ub'], _site_photo_captions: ['Missing plug', 'Bracket', 'Missing plug', 'Bracket'] });
  expect(out._site_photo_paths).toEqual(['a', 'b']);
  expect(out._site_photo_captions).toEqual(['Missing plug', 'Bracket']);
});

it('blocks submit while a photo is uploading or has failed', () => {
  expect(photoSubmitBlocker(['done', 'uploading'])).toMatch(/Wait for 1 photo/);
  expect(photoSubmitBlocker(['failed'])).toMatch(/Retry/);
  expect(photoSubmitBlocker(['done'])).toBeNull();
});

it('counts only real answers', () => {
  expect(countAnswers({ a: 'x', b: '', c: false, _x: 'y', d: ['1'] })).toBe(2);
});
