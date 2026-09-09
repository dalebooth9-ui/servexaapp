import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Camera, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";
import { buildDurableRef } from "@/lib/durableStorageRef";
import {
  parseRemedialItems,
  newRemedialItemId,
  REMEDIAL_SEVERITIES,
  type RemedialItem,
  type RemedialSeverity,
} from "@/lib/remedialItems";

type Props = {
  value: any;
  onChange: (value: RemedialItem[]) => void;
  fieldId?: string;
  jobId?: string;
  userId?: string;
  readOnly?: boolean;
};

const SEVERITY_LABEL: Record<RemedialSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

function RemedialPhoto({ path, onRemove }: { path: string; onRemove?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.storage.from("submissions").createSignedUrl(path, 3600).then(({ data }) => {
      if (alive && data?.signedUrl) setUrl(data.signedUrl);
    });
    return () => { alive = false; };
  }, [path]);
  return (
    <div className="relative inline-block">
      {url ? (
        <img src={url} alt="Remedial" className="h-14 w-14 rounded border object-cover" />
      ) : (
        <div className="h-14 w-14 rounded border bg-muted" />
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 rounded-full bg-destructive text-destructive-foreground p-0.5"
          aria-label="Remove photo"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export default function RemedialItemsField({ value, onChange, fieldId, jobId, userId, readOnly }: Props) {
  const items = useMemo(() => parseRemedialItems(value), [value]);
  const itemsRef = useRef<RemedialItem[]>(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const pendingItemId = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const commit = useCallback((next: RemedialItem[]) => onChange(next), [onChange]);

  const addItem = () => {
    commit([
      ...itemsRef.current,
      { id: newRemedialItemId(), description: "", severity: "medium", photo_ids: [], already_completed: false },
    ]);
  };

  const updateItem = (id: string, patch: Partial<RemedialItem>) => {
    commit(itemsRef.current.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const removeItem = (id: string) => {
    commit(itemsRef.current.filter((i) => i.id !== id));
  };

  const handleUpload = async (file: File) => {
    const itemId = pendingItemId.current;
    if (!file || !itemId || !file.type.startsWith("image/")) return;
    setUploadingId(itemId);
    let toUpload: Blob = file;
    let ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    let contentType = file.type || "image/jpeg";
    try {
      const { compressImageForUpload } = await import("@/lib/imageCompress");
      const compressed = await compressImageForUpload(file, 2000, 0.85);
      if (compressed) {
        toUpload = compressed;
        ext = "jpg";
        contentType = "image/jpeg";
      }
    } catch {}
    const fileName = `${fieldId || "remedial"}-${itemId}-${Date.now()}.${ext}`;
    const path = jobId ? `${jobId}/remedial-photos/${fileName}` : `remedial-photos/${fileName}`;
    const storagePath = await buildOrgPathAsync(path);
    const { error } = await supabase.storage
      .from("submissions")
      .upload(storagePath, toUpload, { upsert: true, contentType });
    if (error) {
      console.error("Remedial photo upload failed", error);
    } else {
      const current = itemsRef.current.find((i) => i.id === itemId);
      updateItem(itemId, { photo_ids: [...(current?.photo_ids || []), path] });
      if (jobId && userId) {
        await supabase.from("submissions").insert({
          job_id: jobId,
          engineer_id: userId,
          type: "photo",
          file_url: buildDurableRef("submissions", storagePath),
          file_name: fileName,
        } as any).then(({ error: subErr }) => {
          if (subErr) console.error("Remedial photo submission insert failed", subErr);
        });
      }
    }
    setUploadingId(null);
    pendingItemId.current = null;
    if (fileRef.current) fileRef.current.value = "";
  };

  if (readOnly) {
    if (!items.length) return <span className="text-xs text-muted-foreground">—</span>;
    return (
      <ol className="space-y-1.5 text-xs list-decimal pl-4">
        {items.map((item) => (
          <li key={item.id}>
            <span className="font-medium">{item.description}</span>
            <span className="text-muted-foreground">
              {" "}— {SEVERITY_LABEL[item.severity]}
              {item.already_completed ? " · already completed, please check" : ""}
            </span>
            {item.photo_ids.length > 0 && (
              <div className="flex gap-1.5 mt-1">
                {item.photo_ids.map((p) => <RemedialPhoto key={p} path={p} />)}
              </div>
            )}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="space-y-2 w-full">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
      />
      {items.map((item, idx) => (
        <div key={item.id} className="rounded-md border bg-card p-2 space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-[11px] font-semibold text-muted-foreground mt-2 w-4 shrink-0">{idx + 1}.</span>
            <Input
              value={item.description}
              onChange={(e) => updateItem(item.id, { description: e.target.value })}
              placeholder="What needs doing? e.g. Supply and fit new inlet valve"
              dictation
              className="min-h-[44px] text-sm flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0 text-destructive"
              onClick={() => removeItem(item.id)}
              aria-label="Remove remedial"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 pl-6">
            <Select
              value={item.severity}
              onValueChange={(v) => updateItem(item.id, { severity: v as RemedialSeverity })}
            >
              <SelectTrigger className="h-9 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REMEDIAL_SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>{SEVERITY_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={item.already_completed}
                onCheckedChange={(c) => updateItem(item.id, { already_completed: c === true })}
              />
              Already completed (check only)
            </label>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs"
              disabled={uploadingId === item.id}
              onClick={() => {
                pendingItemId.current = item.id;
                fileRef.current?.click();
              }}
            >
              {uploadingId === item.id
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Camera className="h-3.5 w-3.5" />}
              Photo
            </Button>
          </div>
          {item.photo_ids.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pl-6">
              {item.photo_ids.map((p) => (
                <RemedialPhoto
                  key={p}
                  path={p}
                  onRemove={() => updateItem(item.id, { photo_ids: item.photo_ids.filter((x) => x !== p) })}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" className="h-10 gap-1.5 text-xs" onClick={addItem}>
        <Plus className="h-4 w-4" /> Add remedial
      </Button>
      {items.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No remedials recorded. Anything added here carries forward to the follow-up job automatically.
        </p>
      )}
    </div>
  );
}
