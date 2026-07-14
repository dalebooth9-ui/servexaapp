import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Layers, Split } from "lucide-react";

export type PhotoItem = { file: File; url: string };
export type FormGroup = { photos: PhotoItem[] };

interface Props {
  groups: FormGroup[];
  onChange: (groups: FormGroup[]) => void;
}

export default function PhotoGrouper({ groups, onChange }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const groupSelected = () => {
    if (selected.size < 2) return;
    const idxs = Array.from(selected).sort((a, b) => a - b);
    const merged: FormGroup = { photos: [] };
    const remaining: FormGroup[] = [];
    groups.forEach((g, i) => {
      if (idxs.includes(i)) merged.photos.push(...g.photos);
      else remaining.push(g);
    });
    // Insert merged at position of first selected
    remaining.splice(idxs[0], 0, merged);
    onChange(remaining);
    setSelected(new Set());
  };

  const ungroup = (idx: number) => {
    const g = groups[idx];
    if (!g || g.photos.length <= 1) return;
    const split = g.photos.map((p) => ({ photos: [p] }));
    const next = [...groups.slice(0, idx), ...split, ...groups.slice(idx + 1)];
    onChange(next);
    setSelected(new Set());
  };

  const remove = (idx: number) => {
    const g = groups[idx];
    g?.photos.forEach((p) => URL.revokeObjectURL(p.url));
    onChange(groups.filter((_, i) => i !== idx));
    setSelected(new Set());
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm">
          <span className="font-medium">{groups.length}</span> form
          {groups.length === 1 ? "" : "s"} detected
          {selected.size > 0 && (
            <span className="text-muted-foreground">
              {" "}
              · {selected.size} selected
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={selected.size < 2}
            onClick={groupSelected}
          >
            <Layers className="mr-1 h-3.5 w-3.5" /> Group as one form
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        By default each photo is treated as its own form. Select two or more (click
        thumbnails) and group them if they're front/back of the same paper sheet.
      </p>
      <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
        {groups.map((g, idx) => {
          const isSel = selected.has(idx);
          return (
            <div
              key={idx}
              className={`relative rounded border-2 overflow-hidden cursor-pointer transition ${
                isSel ? "border-primary" : "border-transparent"
              }`}
              onClick={() => toggle(idx)}
            >
              <div className="relative">
                <img
                  src={g.photos[0].url}
                  alt=""
                  className="w-full h-28 object-cover"
                />
                {g.photos.length > 1 && (
                  <Badge className="absolute bottom-1 left-1 text-[10px] h-5">
                    {g.photos.length} pages
                  </Badge>
                )}
              </div>
              <div className="absolute top-1 right-1 flex gap-1">
                {g.photos.length > 1 && (
                  <button
                    className="rounded bg-black/60 text-white p-0.5"
                    title="Ungroup"
                    onClick={(e) => {
                      e.stopPropagation();
                      ungroup(idx);
                    }}
                  >
                    <Split className="h-3 w-3" />
                  </button>
                )}
                <button
                  className="rounded bg-black/60 text-white p-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(idx);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
