/**
 * PhotoTagPicker — small popover for toggling tags on a single photo.
 * Used from the job photo grid tile action cluster.
 */
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Tag as TagIcon, Loader2 } from "lucide-react";
import type { PhotoTag } from "@/lib/photoTags";

type Props = {
  tags: PhotoTag[];
  selectedIds: string[];
  onToggle: (tag: PhotoTag, next: boolean) => Promise<void> | void;
  triggerClassName?: string;
  label?: string;
};

export default function PhotoTagPicker({ tags, selectedIds, onToggle, triggerClassName, label }: Props) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const selected = new Set(selectedIds);

  const handle = async (tag: PhotoTag) => {
    setBusyId(tag.id);
    try {
      await onToggle(tag, !selected.has(tag.id));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={triggerClassName || "rounded p-1 text-white hover:bg-white/15 transition"}
          aria-label={label || "Tag photo"}
          title={label || "Tag photo"}
        >
          <TagIcon className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-56 p-2"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">Tags</p>
        {tags.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            No tags set up yet. Add them in Settings.
          </p>
        ) : (
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {tags.map((tag) => (
              <label
                key={tag.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-sm hover:bg-muted min-h-[36px]"
              >
                <Checkbox
                  checked={selected.has(tag.id)}
                  disabled={busyId === tag.id}
                  onCheckedChange={() => handle(tag)}
                />
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color }}
                  aria-hidden="true"
                />
                <span className="truncate">{tag.name}</span>
                {busyId === tag.id && <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />}
              </label>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
