## Final offline improvements

Four additions on top of the existing IndexedDB sync queue in `src/lib/syncQueue.ts`, `useOfflineMutation`, and `useSyncQueueDrainer`.

### 1. Photo queue (IndexedDB blob store)

New module `src/lib/photoQueue.ts`:
- Separate idb-keyval store `servexa-photo-queue` keyed by id, storing `{ id, bucket, path, blob, contentType, label, enqueuedAt, attempts, lastError, status, progress }`.
- `enqueuePhoto({ bucket, path, blob, label })` — returns id immediately, fires a local object URL listeners can read.
- `subscribePhotoQueue(fn)` — pub/sub for thumbnails + sync UI.
- `processPhotoQueue()` — for each pending photo, `supabase.storage.from(bucket).upload(path, blob, { upsert: true })`, update progress, remove on success, retry up to 3 with backoff, DLQ thereafter.

New hook `src/hooks/useOfflinePhotoUpload.ts` — try direct upload; on network failure call `enqueuePhoto` and return `{ queued: true, localUrl }` so callers can show the local thumbnail.

New tiny component `src/components/OfflinePhotoThumb.tsx` — given a queued photo id, renders the blob via `URL.createObjectURL` with a small "Pending upload" badge + progress bar; revokes URL on unmount.

Drainer (`useSyncQueueDrainer`) also calls `processPhotoQueue()` and aggregates totals.

### 2. Conflict resolution

Extend `QueuedOp` (update only) with optional `baseUpdatedAt?: string` and `conflictKey?: string` (defaults to `updated_at`). `useOfflineMutation` captures the row's current `updated_at` when queueing.

Update executor in `useSyncQueueDrainer`:
1. Before the UPDATE, `select(conflictKey).match(op.match).maybeSingle()`.
2. If server `updated_at > baseUpdatedAt`, do not write — push the item into a new in-memory `conflictBus` (also persisted to a `servexa-sync-conflicts` store) with `{ item, serverRow, localValues }`. Skip and continue with other items.

New component `src/components/ConflictResolutionDialog.tsx`, mounted once in `App.tsx`:
- Subscribes to `conflictBus`. When non-empty, opens a modal showing field-by-field diff (mine vs. theirs), default selection "Keep my version".
- "Keep mine" → re-queues the op without the baseUpdatedAt guard (force).
- "Keep theirs" → discards the queued op.
- "Merge" not in scope; only the two options.

### 3. Sync Status page

New route `/sync-status` → `src/pages/SyncStatus.tsx`. Add link in `AppSidebar` under the engineer/admin section ("Sync status" with `CloudUpload` icon, badge = pending count).

Sections:
- **Pending** — `listQueue()` + photo queue: label, enqueued time, attempts, "Discard" button.
- **Conflicts** — `listConflicts()` with quick-resolve buttons (opens the same dialog).
- **Recently synced** — last 20 entries from a new `servexa-sync-history` ring buffer (written by the drainer on each success).
- **Last successful sync** — timestamp from history head.
- **"Sync now"** button → calls `processQueue()` + `processPhotoQueue()`, shows progress.

### 4. Background Sync API

`src/pwa/registerSW.ts` after successful registration:
```ts
if ('sync' in reg) {
  await (reg as any).sync.register('servexa-sync-queue');
}
```
Re-register on every successful enqueue (queue + photo).

In the existing service worker config (`vite.config.ts` workbox `additionalManifestEntries`/`runtimeCaching` is already present), add a custom `importScripts`-style handler via `injectManifest`? No — `generateSW` cannot host `sync` listeners. Use a tiny companion worker registered separately is also off-limits per the PWA skill.

Instead, handle Background Sync in the **page** when it fires the `sync` event on the existing SW: we add a `message` listener in `registerSW.ts` so the SW can postMessage `"drain-now"` when it activates from a sync event. Since `generateSW` doesn't emit sync code itself, we extend it with `workbox.importScripts` of `/bg-sync.js` (a tiny hand-written file in `public/` that ONLY adds `self.addEventListener('sync', e => e.waitUntil(self.clients.matchAll().then(cs => cs.forEach(c => c.postMessage({ type: 'bg-sync' })))))`). On the page, the message triggers `drain()`.

Graceful degrade: if `'sync' in reg` is false (Safari/Firefox), the existing `online` listener path still works.

### Technical notes

- Conflict comparison uses `updated_at`. Tables without an `updated_at` column skip the guard (queue behaves as today).
- Photo queue is independent of mutation queue so a slow upload doesn't block UPDATEs.
- All new IndexedDB stores live under the same `servexa-*` prefix for easy debugging.
- No new dependencies — uses existing `idb-keyval`, `sonner`, shadcn `Dialog`.
- No DB / RLS changes.

### Files

Created:
- `src/lib/photoQueue.ts`
- `src/lib/conflictBus.ts`
- `src/lib/syncHistory.ts`
- `src/hooks/useOfflinePhotoUpload.ts`
- `src/components/OfflinePhotoThumb.tsx`
- `src/components/ConflictResolutionDialog.tsx`
- `src/pages/SyncStatus.tsx`
- `public/bg-sync.js`

Edited:
- `src/lib/syncQueue.ts` (conflict fields, history hooks)
- `src/hooks/useOfflineMutation.ts` (capture baseUpdatedAt)
- `src/hooks/useSyncQueueDrainer.ts` (conflict check, photo drain, history)
- `src/pwa/registerSW.ts` (Background Sync register + importScripts wiring)
- `vite.config.ts` (workbox `importScripts: ['/bg-sync.js']`)
- `src/App.tsx` (route + mount ConflictResolutionDialog)
- `src/components/AppSidebar.tsx` (Sync status nav item)
