/**
 * SyncStatus — Engineer-facing page showing everything currently waiting to
 * sync, anything that conflicted, what synced recently, and a manual
 * "Sync now" trigger.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CloudUpload, RefreshCcw, Trash2, AlertTriangle, Image as ImageIcon, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";

import { listQueue, listDeadLetter, discardItem, discardDeadLetter, subscribeQueueSize, type QueueItem } from "@/lib/syncQueue";
import { listPhotoQueue, discardPhoto, subscribePhotoQueue, type PhotoQueueItem } from "@/lib/photoQueue";
import { listConflicts, subscribeConflicts, type Conflict } from "@/lib/conflictBus";
import { listHistory, lastSuccessfulSync, subscribeHistory, type SyncHistoryEntry } from "@/lib/syncHistory";
import { drainNow } from "@/hooks/useSyncQueueDrainer";

export default function SyncStatus() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [photos, setPhotos] = useState<PhotoQueueItem[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [dlq, setDlq] = useState<QueueItem[]>([]);
  const [history, setHistory] = useState<SyncHistoryEntry[]>([]);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [syncing, setSyncing] = useState(false);

  const refresh = async () => {
    setQueue(await listQueue());
    setPhotos(await listPhotoQueue());
    setConflicts(await listConflicts());
    setDlq(await listDeadLetter());
    setHistory(listHistory());
  };

  useEffect(() => {
    void refresh();
    const u1 = subscribeQueueSize(() => { void refresh(); });
    const u2 = subscribePhotoQueue((p) => setPhotos(p));
    const u3 = subscribeConflicts((c) => setConflicts(c));
    const u4 = subscribeHistory((h) => setHistory(h));
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      u1(); u2(); u3(); u4();
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const lastSync = lastSuccessfulSync();

  const handleSyncNow = async () => {
    if (!isOnline) {
      toast.warning("You're offline — nothing can sync right now");
      return;
    }
    setSyncing(true);
    try {
      await drainNow();
      await refresh();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CloudUpload className="h-6 w-6" />
            Sync status
          </h1>
          <p className="text-sm text-muted-foreground">
            {isOnline ? (
              <span className="inline-flex items-center gap-1"><Wifi className="h-3 w-3 text-success" /> Online</span>
            ) : (
              <span className="inline-flex items-center gap-1"><WifiOff className="h-3 w-3 text-warning" /> Offline — sync will resume automatically</span>
            )}
            {lastSync && (
              <span className="ml-3">Last synced {formatDistanceToNow(new Date(lastSync), { addSuffix: true })}</span>
            )}
          </p>
        </div>
        <Button onClick={handleSyncNow} disabled={syncing || !isOnline}>
          <RefreshCcw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Pending changes</CardTitle>
          <Badge variant={queue.length ? "default" : "secondary"}>{queue.length}</Badge>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No edits waiting to sync.</p>
          ) : (
            <ul className="divide-y divide-border">
              {queue.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{it.label || `${it.op.kind} ${it.op.table}`}</div>
                    <div className="text-xs text-muted-foreground">
                      Queued {formatDistanceToNow(new Date(it.enqueuedAt), { addSuffix: true })}
                      {it.attempts > 0 && ` · ${it.attempts} retry${it.attempts === 1 ? "" : "s"}`}
                      {it.lastError && ` · ${it.lastError}`}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={async () => { await discardItem(it.id); void refresh(); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2"><ImageIcon className="h-4 w-4" /> Pending photos</CardTitle>
          <Badge variant={photos.length ? "default" : "secondary"}>{photos.length}</Badge>
        </CardHeader>
        <CardContent>
          {photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No photos waiting to upload.</p>
          ) : (
            <ul className="divide-y divide-border">
              {photos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.label || p.path}</div>
                    <div className="text-xs text-muted-foreground">
                      {(p.blob.size / 1024).toFixed(0)} KB · queued {formatDistanceToNow(new Date(p.enqueuedAt), { addSuffix: true })}
                      {p.attempts > 0 && ` · ${p.attempts} retry${p.attempts === 1 ? "" : "s"}`}
                      {p.lastError && ` · ${p.lastError}`}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={async () => { await discardPhoto(p.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {conflicts.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Conflicts</CardTitle>
            <Badge variant="destructive">{conflicts.length}</Badge>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Open conflicts will appear as a dialog so you can choose which version to keep.
            </p>
          </CardContent>
        </Card>
      )}

      {dlq.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base text-destructive">Failed permanently</CardTitle>
            <Badge variant="destructive">{dlq.length}</Badge>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {dlq.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{it.label || `${it.op.kind} ${it.op.table}`}</div>
                    <div className="text-xs text-destructive truncate">{it.lastError}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={async () => { await discardDeadLetter(it.id); void refresh(); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recently synced</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing has synced yet on this device.</p>
          ) : (
            <ul className="divide-y divide-border">
              {history.slice(0, 20).map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate">{h.label}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{format(new Date(h.syncedAt), "HH:mm:ss")}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
