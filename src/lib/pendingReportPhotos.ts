/** Phone copies of report photos kept until the upload is confirmed. */
import { get, set, del, keys, createStore } from "idb-keyval";

const store = createStore("servexa-report-photos", "pending");

export type StoredPendingPhoto = { id: string; reportId: string; blob: Blob; name: string; type: string; caption: string; createdAt: number; fieldId?: string; source?: 'camera' | 'library'; original?: File };

export async function savePendingPhoto(p: StoredPendingPhoto): Promise<void> {
  await set(`${p.reportId}:${p.id}`, p, store);
}

export async function removePendingPhoto(reportId: string, id: string): Promise<void> {
  try { await del(`${reportId}:${id}`, store); } catch { /* ignore */ }
}

export async function listPendingPhotos(reportId: string): Promise<StoredPendingPhoto[]> {
  try {
    const ks = (await keys(store)).map(String).filter((k) => k.startsWith(`${reportId}:`));
    const rows = await Promise.all(ks.map((k) => get<StoredPendingPhoto>(k, store)));
    return rows.filter((row): row is StoredPendingPhoto => !!row).sort((a, b) => a.createdAt - b.createdAt);
  } catch { throw new Error('Saved photos could not be loaded from this phone. Please retry before adding more.'); }
}
